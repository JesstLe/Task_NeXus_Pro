//! 线程级调度模块
//!
//! 提供线程亲和性绑定和"帧线程优化"能力。
//! 适配自 tauri-v2 的 thread.rs。

use super::types::{AppError, AppResult};
use std::collections::HashMap;

#[cfg(windows)]
use windows::Win32::{
    Foundation::CloseHandle,
    System::Diagnostics::ToolHelp::*,
    System::Threading::*,
};

/// 线程信息
#[derive(Debug, Clone)]
pub struct ThreadInfo {
    pub tid: u32,
    pub cpu_time: u64,
}

// ============================================================================
// 线程绑定
// ============================================================================

/// 设置线程亲和性
#[cfg(windows)]
pub async fn set_thread_affinity(tid: u32, core_mask: u64) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        unsafe {
            let handle = OpenThread(THREAD_SET_INFORMATION | THREAD_QUERY_INFORMATION, false, tid)
                .map_err(|e| AppError::SystemError(format!("OpenThread failed: {}", e)))?;
            
            let result = SetThreadAffinityMask(handle, core_mask as usize);
            let _ = CloseHandle(handle);
            
            if result == 0 {
                Err(AppError::SystemError("SetThreadAffinityMask returned 0".to_string()))
            } else {
                Ok(())
            }
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn set_thread_affinity(_tid: u32, _core_mask: u64) -> AppResult<()> {
    Ok(())
}

/// 智能绑定最重线程 (帧线程优化)
/// 使用双采样差分法识别 CPU 占用最高的线程并绑定到指定核心
#[cfg(windows)]
pub async fn smart_bind_thread(pid: u32, target_core: u32) -> AppResult<u32> {
    // 第一次采样
    let sample1 = get_thread_cpu_times(pid)?;
    
    // 等待 100ms
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    
    // 第二次采样
    let sample2 = get_thread_cpu_times(pid)?;
    
    // 计算增量，找出最重线程
    let mut max_delta = 0u64;
    let mut heaviest_tid = 0u32;
    
    for (tid, time2) in &sample2 {
        if let Some(time1) = sample1.get(tid) {
            let delta = time2.saturating_sub(*time1);
            if delta > max_delta {
                max_delta = delta;
                heaviest_tid = *tid;
            }
        }
    }
    
    if heaviest_tid == 0 {
        return Err(AppError::SystemError("无法识别帧线程 (Delta=0)".to_string()));
    }
    
    // 绑定到目标核心
    let core_mask = 1u64 << target_core;
    set_thread_affinity(heaviest_tid, core_mask).await?;
    
    Ok(heaviest_tid)
}

/// 设置线程理想处理器 (第一优先核心)
#[cfg(windows)]
pub async fn set_thread_ideal_processor(tid: u32, ideal_core: u32) -> AppResult<()> {
    tokio::task::spawn_blocking(move || {
        unsafe {
            let handle = OpenThread(THREAD_SET_INFORMATION | THREAD_QUERY_INFORMATION, false, tid)
                .map_err(|e| AppError::SystemError(format!("OpenThread failed: {}", e)))?;
            
            // SetThreadIdealProcessor 返回前一个理想处理器，失败返回 -1 (但 Win32 API 签名是 u32，失败通常是 INVALID_SET_FILE_POINTER 类似的值，不过 SetThreadIdealProcessor 成功返回前一个值)
            // 这里我们主要关心调用本身。Win32 API: DWORD SetThreadIdealProcessor(HANDLE hThread, DWORD dwIdealProcessor);
            let result = SetThreadIdealProcessor(handle, ideal_core);
            let _ = CloseHandle(handle);
            
            if result == u32::MAX {
                Err(AppError::SystemError("SetThreadIdealProcessor failed".to_string()))
            } else {
                Ok(())
            }
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

/// 智能设置最重线程的理想处理器
#[cfg(windows)]
pub async fn smart_set_ideal_thread(pid: u32, ideal_core: u32) -> AppResult<u32> {
    // 第一次采样
    let sample1 = get_thread_cpu_times(pid)?;
    
    // 等待 100ms
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    
    // 第二次采样
    let sample2 = get_thread_cpu_times(pid)?;
    
    // 计算增量，找出最重线程
    let mut max_delta = 0u64;
    let mut heaviest_tid = 0u32;
    
    for (tid, time2) in &sample2 {
        if let Some(time1) = sample1.get(tid) {
            let delta = time2.saturating_sub(*time1);
            if delta > max_delta {
                max_delta = delta;
                heaviest_tid = *tid;
            }
        }
    }
    
    if heaviest_tid == 0 {
        return Err(AppError::SystemError("无法识别帧线程 (Delta=0)".to_string()));
    }
    
    // 设置理想核心
    set_thread_ideal_processor(heaviest_tid, ideal_core).await?;
    
    Ok(heaviest_tid)
}

#[cfg(not(windows))]
pub async fn smart_bind_thread(_pid: u32, _target_core: u32) -> AppResult<u32> {
    Err(AppError::SystemError("Not supported on this platform".to_string()))
}

/// 获取进程所有线程的 CPU 时间
#[cfg(windows)]
fn get_thread_cpu_times(pid: u32) -> AppResult<HashMap<u32, u64>> {
    let mut times = HashMap::new();
    
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)
            .map_err(|e| AppError::SystemError(format!("CreateToolhelp32Snapshot failed: {}", e)))?;
        
        let mut entry = THREADENTRY32 {
            dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
            ..Default::default()
        };
        
        if Thread32First(snapshot, &mut entry).is_ok() {
            loop {
                if entry.th32OwnerProcessID == pid {
                    if let Ok(cpu_time) = get_single_thread_cpu_time(entry.th32ThreadID) {
                        times.insert(entry.th32ThreadID, cpu_time);
                    }
                }
                
                entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
                if Thread32Next(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        
        let _ = CloseHandle(snapshot);
    }
    
    Ok(times)
}

#[cfg(windows)]
fn get_single_thread_cpu_time(tid: u32) -> AppResult<u64> {
    unsafe {
        let handle = OpenThread(THREAD_QUERY_INFORMATION, false, tid)
            .map_err(|e| AppError::SystemError(format!("OpenThread failed: {}", e)))?;
        
        let mut creation = Default::default();
        let mut exit = Default::default();
        let mut kernel = Default::default();
        let mut user = Default::default();
        
        let result = GetThreadTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user);
        let _ = CloseHandle(handle);
        
        result.map_err(|e| AppError::SystemError(format!("GetThreadTimes failed: {}", e)))?;
        
        let kernel_time = ((kernel.dwHighDateTime as u64) << 32) | (kernel.dwLowDateTime as u64);
        let user_time = ((user.dwHighDateTime as u64) << 32) | (user.dwLowDateTime as u64);
        
        Ok(kernel_time + user_time)
    }
}
