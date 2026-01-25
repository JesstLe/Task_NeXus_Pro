//! 进程调度引擎
//!
//! 提供进程优先级设置、CPU 亲和性绑定、内存清理等核心能力。
//! 适配自 tauri-v2 的 governor.rs，移除了 Tauri 特有依赖。

use super::types::{AppError, AppResult, PriorityLevel};

#[cfg(windows)]
use windows::Win32::{
    Foundation::CloseHandle,
    System::Threading::*,
    System::ProcessStatus::*,
    System::Diagnostics::ToolHelp::*,
};

// ============================================================================
// 进程优先级控制
// ============================================================================

/// 设置进程优先级
#[cfg(windows)]
pub async fn set_priority(pid: u32, level: PriorityLevel) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        unsafe {
            let handle = OpenProcess(PROCESS_SET_INFORMATION, false, pid)
                .map_err(|e| AppError::SystemError(format!("OpenProcess failed: {}", e)))?;
            
            let priority_class = match level {
                PriorityLevel::Idle => IDLE_PRIORITY_CLASS,
                PriorityLevel::BelowNormal => BELOW_NORMAL_PRIORITY_CLASS,
                PriorityLevel::Normal => NORMAL_PRIORITY_CLASS,
                PriorityLevel::AboveNormal => ABOVE_NORMAL_PRIORITY_CLASS,
                PriorityLevel::High => HIGH_PRIORITY_CLASS,
                PriorityLevel::RealTime => REALTIME_PRIORITY_CLASS,
            };
            
            let result = SetPriorityClass(handle, priority_class);
            let _ = CloseHandle(handle);
            
            result.map_err(|e| AppError::SystemError(format!("SetPriorityClass failed: {}", e)))
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn set_priority(_pid: u32, _level: PriorityLevel) -> AppResult<()> {
    Ok(())
}

// ============================================================================
// CPU 亲和性控制
// ============================================================================

/// 设置进程 CPU 亲和性 (Hex Mask String)
/// 注意：为响应用户需求，此处从硬限制 (SetProcessAffinityMask) 改为软限制 (SetThreadIdealProcessor)。
/// 对于多核选择，采用 Round-Robin 方式将进程的所有线程分散建议到选中的核心上。
#[cfg(windows)]
pub async fn set_process_affinity(pid: u32, affinity_mask: String) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        let mask = u64::from_str_radix(affinity_mask.trim_start_matches("0x"), 16)
            .map_err(|_| AppError::InvalidAffinityMask(affinity_mask.clone()))?;
        
        // 解析掩码为核心 ID 列表
        let mut target_cores = Vec::new();
        for i in 0..64 {
            if (mask >> i) & 1 == 1 {
                target_cores.push(i as u32);
            }
        }
        
        if target_cores.is_empty() {
            return Err(AppError::InvalidAffinityMask("Mask is empty".to_string()));
        }

        unsafe {
            // 获取进程所有线程
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)
                .map_err(|e| AppError::SystemError(format!("CreateToolhelp32Snapshot failed: {}", e)))?;
            
            let mut entry = THREADENTRY32 {
                dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
                ..Default::default()
            };
            
            if Thread32First(snapshot, &mut entry).is_ok() {
                let mut core_idx = 0;
                loop {
                    if entry.th32OwnerProcessID == pid {
                        // 对每个线程设置理想处理器 (轮询分配)
                        let ideal_core = target_cores[core_idx % target_cores.len()];
                        core_idx += 1;
                        
                        if let Ok(handle) = OpenThread(THREAD_SET_INFORMATION, false, entry.th32ThreadID) {
                            let _ = SetThreadIdealProcessor(handle, ideal_core);
                            let _ = CloseHandle(handle);
                        }
                    }
                    
                    entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
                    if Thread32Next(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
            Ok(())
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn set_process_affinity(_pid: u32, _affinity_mask: String) -> AppResult<()> {
    Ok(())
}

// ============================================================================
// 进程终止
// ============================================================================

/// 结束进程
#[cfg(windows)]
pub async fn kill_process(pid: u32) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        unsafe {
            let handle = OpenProcess(PROCESS_TERMINATE, false, pid)
                .map_err(|e| AppError::SystemError(format!("OpenProcess failed: {}", e)))?;
            
            let result = TerminateProcess(handle, 1);
            let _ = CloseHandle(handle);
            
            result.map_err(|e| AppError::SystemError(format!("TerminateProcess failed: {}", e)))
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn kill_process(_pid: u32) -> AppResult<()> {
    Ok(())
}

// ============================================================================
// 内存管理
// ============================================================================

/// 清理进程工作集内存
#[cfg(windows)]
pub async fn trim_memory(pid: u32) -> AppResult<u64> {
    tokio::task::spawn_blocking(move || {
        unsafe {
            let handle = OpenProcess(PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION, false, pid)
                .map_err(|e| AppError::SystemError(format!("OpenProcess failed: {}", e)))?;
            
            let result = EmptyWorkingSet(handle);
            let _ = CloseHandle(handle);
            
            result.map_err(|e| AppError::SystemError(format!("EmptyWorkingSet failed: {}", e)))?;
            Ok(1)
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn trim_memory(_pid: u32) -> AppResult<u64> {
    Ok(0)
}

/// 清理系统内存 (所有后台进程)
pub async fn clear_system_memory() -> AppResult<u64> {
    use sysinfo::System;
    
    let mut sys = System::new_all();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All);
    
    let mut cleaned = 0u64;
    
    for (pid, _) in sys.processes() {
        if let Ok(n) = trim_memory(pid.as_u32()).await {
            cleaned += n;
        }
    }
    
    Ok(cleaned)
}
