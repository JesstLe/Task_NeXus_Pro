use crate::ProcessInfo;
// use once_cell::sync::Lazy;
// use parking_lot::RwLock;
// use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use std::collections::HashMap;

#[cfg(windows)]
use windows::Win32::Foundation::*;
#[cfg(windows)]
// use windows::Win32::System::ProcessStatus::*;
#[cfg(windows)]
use windows::Win32::System::Threading::*; // For GetProcessMemoryInfo if needed, or stick to sysinfo for basic mem
#[cfg(windows)]
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
};

// Shared state for CPU usage calculation
// static LAST_CPU_TIMES: Lazy<RwLock<HashMap<u32, u64>>> = Lazy::new(|| RwLock::new(HashMap::new()));

pub struct ProcessMonitor {
    running: Arc<AtomicBool>,
}

impl ProcessMonitor {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self, app_handle: AppHandle) {
        if self.running.load(Ordering::SeqCst) {
            return;
        }
        self.running.store(true, Ordering::SeqCst);
        let running = self.running.clone();

        std::thread::spawn(move || {
            let mut sys = sysinfo::System::new_all();
            
            // OPTIMIZATION: Cache users list (Refresh every 60s)
            let mut users = sysinfo::Users::new_with_refreshed_list();
            
            // OPTIMIZATION: Cache process details (Refresh every 3s)
            let mut process_details_cache: HashMap<u32, (String, String, u32)> = HashMap::new();
            
            let mut iteration_count: u64 = 0;

            while running.load(Ordering::SeqCst) {
                let start_time = std::time::Instant::now();
                iteration_count = iteration_count.wrapping_add(1);

                // 1. Refresh Users (Low frequency)
                if iteration_count % 60 == 0 {
                     users = sysinfo::Users::new_with_refreshed_list();
                }

                // 2. Refresh Processes (CPU/Mem always refresh)
                sys.refresh_processes(sysinfo::ProcessesToUpdate::All);
                
                // OPTIMIZATION Phase 2: Consolidated Hardware Monitoring
                // Refresh Global CPU & Memory here to avoid a second thread
                sys.refresh_cpu_all();
                sys.refresh_memory();

                // 2.1 Emit Global CPU Loads
                let cpu_loads: Vec<f32> = sys.cpus().iter().map(|c| c.cpu_usage()).collect();
                let _ = app_handle.emit("cpu-load-update", &cpu_loads);

                // 2.2 Emit Global Memory Load
                let total_mem = sys.total_memory();
                let used_mem = total_mem.saturating_sub(sys.available_memory());
                let mem_percent = if total_mem > 0 {
                    (used_mem as f64 / total_mem as f64 * 100.0) as f32
                } else {
                    0.0
                };
                let _ = app_handle.emit("memory-load-update", mem_percent);

                
                let mut processes = Vec::new();
                let core_count = sys.cpus().len() as f32;
                
                // Determine if we should refresh heavy WinAPI details this tick
                // Throttle: Refresh every 3rd tick (approx 3s if loop is 1s, wait, loop is 1s sleep)
                // If tick is 1s, then iteration % 3 == 0 means every 3 seconds.
                let should_refresh_details = iteration_count % 3 == 0;

                for (pid, process) in sys.processes() {
                    let pid_u32 = pid.as_u32();

                    // Basic Info from sysinfo (Fast)
                    let name = process.name().to_string_lossy().to_string();
                    let memory_usage = process.memory();
                    let mut cpu_usage = process.cpu_usage();
                    if core_count > 0.0 {
                        cpu_usage /= core_count;
                    }
                    let path = process
                        .exe()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let user = match process.user_id() {
                        Some(uid) => users
                            .get_user_by_id(uid)
                            .map(|u| u.name().to_string())
                            .unwrap_or_else(|| "Unknown".to_string()),
                        None => "System".to_string(),
                    };

                    // Optimised WinAPI Calls
                    let details = if should_refresh_details {
                        let d = get_process_details_win(pid_u32);
                        process_details_cache.insert(pid_u32, d.clone());
                        d
                    } else {
                        // Use cache or fallback if new process
                        if let Some(cached) = process_details_cache.get(&pid_u32) {
                             cached.clone()
                        } else {
                             // New process appearing in-between throttles? Fetch it once.
                             let d = get_process_details_win(pid_u32);
                             process_details_cache.insert(pid_u32, d.clone());
                             d
                        }
                    };
                    
                    let (priority, affinity, _thread_count_win) = details;

                    // Get parent PID for tree view
                    let parent_pid = process.parent().map(|p| p.as_u32());

                    processes.push(ProcessInfo {
                        pid: pid_u32,
                        parent_pid,
                        name,
                        cpu_usage,
                        memory_usage,
                        priority,
                        cpu_affinity: affinity,
                        thread_count: _thread_count_win,
                        user,
                        path,
                    });
                }
                
                // Cleanup cache for dead processes (Optional: do it every 60s to save cycles)
                if iteration_count % 60 == 0 {
                    let current_pids: Vec<u32> = processes.iter().map(|p| p.pid).collect();
                    process_details_cache.retain(|&k, _| current_pids.contains(&k));
                }

                // Sorting (optional here, but backend sorting saves frontend work?
                processes.sort_by(|a, b| {
                    b.cpu_usage
                        .partial_cmp(&a.cpu_usage)
                        .unwrap_or(std::cmp::Ordering::Equal)
                });

                // ProBalance Watchdog, Profile Enforcement & Smart Trim Check
                tauri::async_runtime::block_on(async {
                    crate::watchdog::enforce_profiles(&processes).await;
                    crate::watchdog::apply_default_rules(&processes).await;
                    crate::watchdog::check_and_restrain(&processes).await;
                    crate::watchdog::check_and_trim_memory().await;
                });

                // Emit event
                if let Err(e) = app_handle.emit("process-update", &processes) {
                    eprintln!("Failed to emit process-update: {}", e);
                }

                // Sleep remainder of 1s
                let elapsed = start_time.elapsed();
                if elapsed < Duration::from_secs(1) {
                    std::thread::sleep(Duration::from_secs(1) - elapsed);
                }
            }
        });
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

#[cfg(windows)]
fn get_process_details_win(pid: u32) -> (String, String, u32) {
    fn format_affinity_mask(process_mask: usize, system_mask: usize) -> String {
        if process_mask == system_mask {
            return "All".to_string();
        }

        let mut ranges = Vec::new();
        let mut start: Option<usize> = None;

        for i in 0..64 {
            let set = (process_mask >> i) & 1 == 1;
            match (set, start) {
                (true, None) => start = Some(i),
                (false, Some(s)) => {
                    if s == i - 1 {
                        ranges.push(format!("{}", s));
                    } else {
                        ranges.push(format!("{}-{}", s, i - 1));
                    }
                    start = None;
                }
                _ => {}
            }
        }

        if let Some(s) = start {
            if s == 63 {
                ranges.push(format!("{}", s));
            } else {
                ranges.push(format!("{}-{}", s, 63));
            }
        }

        if ranges.is_empty() {
            format!("{:#x}", process_mask)
        } else {
            ranges.join(",")
        }
    }

    fn count_threads(pid: u32) -> u32 {
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
            if snapshot.is_err() {
                return 0;
            }
            let snapshot = snapshot.unwrap();
            let mut entry = THREADENTRY32 {
                dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
                ..Default::default()
            };
            let mut count = 0u32;
            if Thread32First(snapshot, &mut entry).is_ok() {
                loop {
                    if entry.th32OwnerProcessID == pid {
                        count += 1;
                    }
                    entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
                    if Thread32Next(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
            count
        }
    }

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);

        if let Ok(handle) = handle {
            // Priority
            let priority_class = GetPriorityClass(handle);
            let priority = match priority_class {
                _ if priority_class == IDLE_PRIORITY_CLASS.0 => "Idle",
                _ if priority_class == BELOW_NORMAL_PRIORITY_CLASS.0 => "BelowNormal",
                _ if priority_class == NORMAL_PRIORITY_CLASS.0 => "Normal",
                _ if priority_class == ABOVE_NORMAL_PRIORITY_CLASS.0 => "AboveNormal",
                _ if priority_class == HIGH_PRIORITY_CLASS.0 => "High",
                _ if priority_class == REALTIME_PRIORITY_CLASS.0 => "RealTime",
                _ => "Normal",
            }
            .to_string();

            let mut process_mask: usize = 0;
            let mut system_mask: usize = 0;
            let _ = GetProcessAffinityMask(handle, &mut process_mask, &mut system_mask);

            let affinity = format_affinity_mask(process_mask, system_mask);
            let thread_count = count_threads(pid);

            let _ = CloseHandle(handle);
            return (priority, affinity, thread_count);
        }

        ("Normal".to_string(), "All".to_string(), 0)
    }
}

#[cfg(not(windows))]
fn get_process_details_win(_pid: u32) -> (String, String, u32) {
    ("Normal".to_string(), "All".to_string(), 0)
}
