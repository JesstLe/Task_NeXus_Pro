//! 线程管理模块 - 线程级亲和性绑定
//!
//! 提供比进程级更精细的 CPU 核心绑定，将游戏"帧线程"
//! 固定到指定核心以避免缓存失效

use crate::{AppError, AppResult};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[cfg(windows)]
use windows::Win32::{
    Foundation::CloseHandle,
    System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
    },
    System::Threading::{
        GetThreadTimes, OpenThread, SetThreadAffinityMask, THREAD_QUERY_INFORMATION,
        THREAD_SET_INFORMATION,
    },
};

/// 线程信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreadInfo {
    /// 线程 ID
    pub tid: u32,
    /// 所属进程 ID
    pub pid: u32,
    /// CPU 时间 (纳秒)
    pub cpu_time_ns: u64,
    /// CPU 使用率 (0-100)
    pub cpu_usage: f32,
    /// 是否是最重线程
    pub is_heaviest: bool,
}

/// 上次采样的线程 CPU 时间缓存
static THREAD_CPU_CACHE: Lazy<RwLock<HashMap<u32, (u64, std::time::Instant)>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

/// 获取进程的所有线程及其 CPU 使用率
#[cfg(windows)]
pub fn get_process_threads(pid: u32) -> AppResult<Vec<ThreadInfo>> {
    use std::mem::size_of;

    let mut threads = Vec::new();

    unsafe {
        // 创建线程快照
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)
            .map_err(|e| AppError::SystemError(format!("创建线程快照失败: {}", e)))?;

        let mut entry = THREADENTRY32 {
            dwSize: size_of::<THREADENTRY32>() as u32,
            ..Default::default()
        };

        // 遍历所有线程
        if Thread32First(snapshot, &mut entry).is_ok() {
            loop {
                // 只处理目标进程的线程
                if entry.th32OwnerProcessID == pid {
                    let tid = entry.th32ThreadID;

                    // 获取线程 CPU 时间
                    if let Ok(cpu_time) = get_thread_cpu_time(tid) {
                        let cpu_usage = calculate_thread_cpu_usage(tid, cpu_time);

                        threads.push(ThreadInfo {
                            tid,
                            pid,
                            cpu_time_ns: cpu_time,
                            cpu_usage,
                            is_heaviest: false,
                        });
                    }
                }

                entry.dwSize = size_of::<THREADENTRY32>() as u32;
                if Thread32Next(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }

        let _ = CloseHandle(snapshot);
    }

    // 标记最重线程
    if let Some(max_idx) = threads
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.cpu_usage.partial_cmp(&b.cpu_usage).unwrap())
        .map(|(i, _)| i)
    {
        if threads[max_idx].cpu_usage > 0.1 {
            threads[max_idx].is_heaviest = true;
        }
    }

    // 按 CPU 使用率降序排序
    threads.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap());

    Ok(threads)
}

/// 获取线程的 CPU 时间 (100ns 单位)
#[cfg(windows)]
fn get_thread_cpu_time(tid: u32) -> AppResult<u64> {
    use windows::Win32::Foundation::FILETIME;

    unsafe {
        let handle = OpenThread(THREAD_QUERY_INFORMATION, false, tid)
            .map_err(|e| AppError::SystemError(format!("打开线程失败: {}", e)))?;

        let mut creation = FILETIME::default();
        let mut exit = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();

        let result = GetThreadTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user);
        let _ = CloseHandle(handle);

        if result.is_err() {
            return Err(AppError::SystemError("获取线程时间失败".into()));
        }

        // 合并 kernel + user 时间
        let kernel_time = ((kernel.dwHighDateTime as u64) << 32) | (kernel.dwLowDateTime as u64);
        let user_time = ((user.dwHighDateTime as u64) << 32) | (user.dwLowDateTime as u64);

        // 转换为纳秒 (FILETIME 是 100ns 单位)
        Ok((kernel_time + user_time) * 100)
    }
}

/// 计算线程 CPU 使用率 (基于上次采样)
fn calculate_thread_cpu_usage(tid: u32, current_time: u64) -> f32 {
    let now = std::time::Instant::now();
    let mut cache = THREAD_CPU_CACHE.write();

    if let Some((last_time, last_instant)) = cache.get(&tid) {
        let elapsed_ns = now.duration_since(*last_instant).as_nanos() as u64;
        if elapsed_ns > 0 {
            let cpu_time_diff = current_time.saturating_sub(*last_time);
            // CPU 使用率 = (CPU 时间差 / 实际时间差) * 100
            let usage = (cpu_time_diff as f64 / elapsed_ns as f64) * 100.0;
            cache.insert(tid, (current_time, now));
            return usage.min(100.0) as f32;
        }
    }

    // 首次采样，记录但返回 0
    cache.insert(tid, (current_time, now));
    0.0
}

/// 设置线程亲和性
#[cfg(windows)]
pub fn set_thread_affinity(tid: u32, core_mask: u64) -> AppResult<()> {
    unsafe {
        let handle = OpenThread(
            THREAD_QUERY_INFORMATION | THREAD_SET_INFORMATION,
            false,
            tid,
        )
        .map_err(|e| AppError::SystemError(format!("打开线程失败: {}", e)))?;

        let result = SetThreadAffinityMask(handle, core_mask as usize);
        let _ = CloseHandle(handle);

        if result == 0 {
            return Err(AppError::SystemError("设置线程亲和性失败".into()));
        }

        Ok(())
    }
}

/// 使用双采样差分法，智能识别并绑定最重线程
#[cfg(windows)]
pub async fn smart_bind_thread(pid: u32, target_core: u32) -> AppResult<u32> {
    use std::time::Duration;

    tokio::task::spawn_blocking(move || {
        unsafe {
            // 第一次采样
            let mut threads_first = HashMap::new();
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)
                .map_err(|e| AppError::SystemError(format!("创建线程快照失败: {}", e)))?;

            let mut entry = THREADENTRY32 {
                dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
                ..Default::default()
            };

            if Thread32First(snapshot, &mut entry).is_ok() {
                loop {
                    if entry.th32OwnerProcessID == pid {
                         if let Ok(time) = get_thread_cpu_time(entry.th32ThreadID) {
                             threads_first.insert(entry.th32ThreadID, time);
                         }
                    }
                    entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
                    if Thread32Next(snapshot, &mut entry).is_err() { break; }
                }
            }
            let _ = CloseHandle(snapshot);

            // 采样间隔
            std::thread::sleep(Duration::from_millis(250));

            // 第二次采样并寻找最大差值
            let mut max_delta = 0u64;
            let mut heaviest_tid_by_delta = 0u32;
            let mut max_total_time = 0u64;
            let mut heaviest_tid_by_total = 0u32;

            let snapshot2 = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)
                .map_err(|e| AppError::SystemError(format!("创建第二次快照失败: {}", e)))?;

            entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
            if Thread32First(snapshot2, &mut entry).is_ok() {
                loop {
                    if entry.th32OwnerProcessID == pid {
                        let tid = entry.th32ThreadID;
                        
                        // 获取第二次时间 (也可以用于 fallback)
                        if let Ok(second_time) = get_thread_cpu_time(tid) {
                             // 跟踪历史总时间最大的线程 (作为 Fallback)
                             if second_time > max_total_time {
                                 max_total_time = second_time;
                                 heaviest_tid_by_total = tid;
                             }

                             // 计算 Delta
                             if let Some(&first_time) = threads_first.get(&tid) {
                                  if second_time >= first_time {
                                      let delta = second_time - first_time;
                                      if delta > max_delta {
                                          max_delta = delta;
                                          heaviest_tid_by_delta = tid;
                                      }
                                  }
                             }
                        }
                    }
                    entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
                    if Thread32Next(snapshot2, &mut entry).is_err() { break; }
                }
            }
            let _ = CloseHandle(snapshot2);

            // 决策逻辑: 优先使用 Delta (活跃度), 失败则回退到 Total Time (累计最重)
            let heaviest_tid = if max_delta > 0 {
                heaviest_tid_by_delta
            } else {
                tracing::warn!("Smart Bind: No active thread found (Delta=0), falling back to total CPU time.");
                heaviest_tid_by_total
            };

            // 检查是否找到有效的主线程
            if heaviest_tid == 0 {
                return Err(AppError::SystemError("无法确定主线程 (无线程或读取失败)".into()));
            }

            // 绑定到指定核心
            let core_mask = 1u64 << target_core;
            set_thread_affinity(heaviest_tid, core_mask)?;

            tracing::info!(
                "智能线程聚类: Process {} -> MainThread {} locked to Core {} (Delta: {}ns, Total: {}ns)",
                pid, heaviest_tid, target_core, max_delta, max_total_time
            );

            Ok(heaviest_tid)
        }
    }).await.map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub fn get_process_threads(_pid: u32) -> AppResult<Vec<ThreadInfo>> {
    Err(AppError::SystemError("仅支持 Windows".into()))
}

#[cfg(not(windows))]
pub fn set_thread_affinity(_tid: u32, _core_mask: u64) -> AppResult<()> {
    Err(AppError::SystemError("仅支持 Windows".into()))
}

#[cfg(not(windows))]
pub async fn smart_bind_thread(_pid: u32, _target_core: u32) -> AppResult<u32> {
    Err(AppError::SystemError("仅支持 Windows".into()))
}
