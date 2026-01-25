use std::collections::HashMap;
use tauri::command;
use windows::Win32::Foundation::*;
use windows::Win32::System::Threading::*;
use windows::Win32::System::SystemInformation::*;

/// Get a mapping of Logical Processor Index -> CPU Set ID
fn get_cpu_set_mapping() -> HashMap<u32, u32> {
    let mut mapping = HashMap::new();
    let mut buffer_size: u32 = 0;

    unsafe {
        // First call to get the required buffer size
        let _ = GetSystemCpuSetInformation(None, 0, &mut buffer_size, None, 0);
        if buffer_size == 0 {
            tracing::warn!("GetSystemCpuSetInformation returned 0 buffer size");
            return mapping;
        }

        let mut buffer = vec![0u8; buffer_size as usize];
        let info_ptr = buffer.as_mut_ptr() as *mut SYSTEM_CPU_SET_INFORMATION;

        if GetSystemCpuSetInformation(Some(info_ptr), buffer_size, &mut buffer_size, None, 0).as_bool() {
            let mut offset = 0;
            while offset < buffer_size as usize {
                let current_ptr = buffer.as_ptr().add(offset) as *const SYSTEM_CPU_SET_INFORMATION;
                let info = &*current_ptr;

                // Type 0 is CpuSetInformation
                if info.Type == CpuSetInformation {
                    let cpu_set = &info.Anonymous.CpuSet;
                    // Note: In Group-aware systems, we'd need to consider info.Anonymous.CpuSet.Group
                    // But for most consumer systems (single group), LogicalProcessorIndex is 0-N.
                    mapping.insert(cpu_set.LogicalProcessorIndex as u32, cpu_set.Id);
                }

                if info.Size == 0 { break; }
                offset += info.Size as usize;
            }
        }
    }
    
    if mapping.is_empty() {
        tracing::warn!("Failed to populate CPU Set mapping");
    } else {
        tracing::debug!("Loaded {} CPU Set mappings", mapping.len());
    }
    
    mapping
}

/// Set CPU Sets (Soft Affinity) for a process
#[command]
pub fn set_process_cpu_sets(pid: u32, core_ids: Vec<u32>) -> Result<(), String> {
    let mapping = get_cpu_set_mapping();
    
    // Map logical indices (0, 1, 2...) to actual CPU Set IDs
    let cpu_set_ids: Vec<u32> = core_ids.iter()
        .filter_map(|id| {
            let mapped = mapping.get(id).copied();
            if mapped.is_none() {
                tracing::warn!("No CPU Set ID found for logical core {}", id);
            }
            mapped
        })
        .collect();

    // Verification: if core_ids was not empty but cpu_set_ids is empty, something is wrong
    if !core_ids.is_empty() && cpu_set_ids.is_empty() {
        return Err("无法将核心索引映射到系统 CPU 设置 ID，可能当前系统环境不支持该功能".to_string());
    }

    unsafe {
        // 1. Open Process with limited info rights
        let handle = OpenProcess(PROCESS_SET_LIMITED_INFORMATION, false, pid)
            .map_err(|e| format!("无法打开进程 {}: {}", pid, e))?;

        // 2. Set CPU Sets using mapped IDs
        let result = SetProcessDefaultCpuSets(handle, Some(&cpu_set_ids));

        // 3. Cleanup
        let _ = CloseHandle(handle);

        // 4. Handle Result
        if result.as_bool() {
            tracing::info!("成功对 PID {} 设置 CPU Sets: {:?} (映射 IDs: {:?})", pid, core_ids, cpu_set_ids);
            Ok(())
        } else {
            let err = windows::core::Error::from_win32();
            tracing::error!("对 PID {} 设置 CPU Sets 失败: {}", pid, err);
            Err(format!("设置 CPU Sets 失败: {}", err))
        }
    }
}

/// Get CPU Sets (Soft Affinity) for a process
#[command]
pub fn get_process_cpu_sets(pid: u32) -> Result<Vec<u32>, String> {
    let mapping = get_cpu_set_mapping();
    // Swap mapping to ID -> Logical Index
    let id_to_logical: HashMap<u32, u32> = mapping.into_iter().map(|(idx, id)| (id, idx)).collect();

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
            .map_err(|e| format!("无法打开进程 {}: {}", pid, e))?;

        let mut required_count: u32 = 0;
        // First call to get required size
        let _ = GetProcessDefaultCpuSets(handle, None, &mut required_count);
        
        if required_count == 0 {
            let _ = CloseHandle(handle);
            return Ok(vec![]);
        }

        let mut cpu_set_ids = vec![0u32; required_count as usize];
        let res = GetProcessDefaultCpuSets(handle, Some(&mut cpu_set_ids), &mut required_count);
        
        let _ = CloseHandle(handle);

        if res.as_bool() {
            let logical_ids: Vec<u32> = cpu_set_ids.iter()
                .filter_map(|id| id_to_logical.get(id).copied())
                .collect();
            Ok(logical_ids)
        } else {
            let err = windows::core::Error::from_win32();
            Err(format!("获取 CPU Sets 失败: {}", err))
        }
    }
}
