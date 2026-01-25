//! CPU 硬件拓扑检测模块
//!
//! 使用 Win32 API 检测 Intel P/E 核心和 AMD V-Cache 架构。
//! 适配自 tauri-v2 的 hardware_topology.rs。

use super::types::{AppError, AppResult, CoreType, CpuTopology, LogicalCore};
use std::collections::HashMap;

#[cfg(windows)]
use windows::Win32::System::SystemInformation::{
    GetLogicalProcessorInformationEx, RelationAll, RelationCache, RelationProcessorCore,
    SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX,
};

/// 获取 CPU 拓扑信息
pub fn get_cpu_topology() -> AppResult<CpuTopology> {
    let cores = get_logical_cores()?;
    
    let is_hybrid = cores.iter().any(|c| c.core_type == CoreType::Efficiency);
    let has_vcache = cores.iter().any(|c| c.core_type == CoreType::VCache);
    
    // 获取 CPU 型号
    let model = get_cpu_model();
    
    // 统计物理核心数
    let physical_ids: std::collections::HashSet<_> = cores.iter().map(|c| c.physical_id).collect();
    
    Ok(CpuTopology {
        model,
        physical_cores: physical_ids.len() as u32,
        logical_cores: cores.len() as u32,
        cores,
        is_hybrid,
        has_vcache,
    })
}

/// 获取 CPU 型号名称
fn get_cpu_model() -> String {
    use sysinfo::System;
    let sys = System::new_all();
    sys.cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string())
}

/// 获取所有逻辑核心信息
#[cfg(windows)]
fn get_logical_cores() -> AppResult<Vec<LogicalCore>> {
    let info_list = get_logical_processor_info_ex()?;
    
    // L3 缓存分析 (检测 V-Cache)
    let mut l3_cache_map: HashMap<usize, u64> = HashMap::new();
    let mut core_group_map: HashMap<usize, usize> = HashMap::new();
    
    for info in &info_list {
        if info.Relationship == RelationCache {
            let cache = unsafe { info.Anonymous.Cache };
            if cache.Level == 3 {
                let mask = unsafe { cache.Anonymous.GroupMask.Mask };
                let size = cache.CacheSize as u64;
                l3_cache_map.insert(mask, size);
                
                for i in 0..64 {
                    if (mask >> i) & 1 == 1 {
                        core_group_map.insert(i, mask);
                    }
                }
            }
        }
    }
    
    // V-Cache 阈值: 64MB
    let vcache_threshold = 64 * 1024 * 1024;
    let has_large_l3 = l3_cache_map.values().any(|&size| size > vcache_threshold);
    
    // 核心架构分析
    let mut logical_cores = Vec::new();
    let mut efficiency_classes = Vec::new();
    
    struct TempCore {
        id: usize,
        physical_id: usize,
        efficiency_class: u8,
    }
    let mut temp_cores = Vec::new();
    let mut current_physical_id = 0;
    
    for info in &info_list {
        if info.Relationship == RelationProcessorCore {
            let processor = unsafe { info.Anonymous.Processor };
            let mask = processor.GroupMask[0].Mask;
            let efficiency_class = processor.EfficiencyClass;
            
            efficiency_classes.push(efficiency_class);
            
            for i in 0..64 {
                if (mask >> i) & 1 == 1 {
                    temp_cores.push(TempCore {
                        id: i,
                        physical_id: current_physical_id,
                        efficiency_class,
                    });
                }
            }
            current_physical_id += 1;
        }
    }
    
    let min_class = *efficiency_classes.iter().min().unwrap_or(&0);
    let max_class = *efficiency_classes.iter().max().unwrap_or(&0);
    let is_hybrid = min_class != max_class;
    
    // 整合核心信息
    for core in temp_cores {
        let core_type = if has_large_l3 {
            if let Some(&group_mask) = core_group_map.get(&core.id) {
                if let Some(&cache_size) = l3_cache_map.get(&group_mask) {
                    if cache_size > vcache_threshold {
                        CoreType::VCache
                    } else {
                        CoreType::Performance
                    }
                } else {
                    CoreType::Performance
                }
            } else {
                CoreType::Performance
            }
        } else if core.efficiency_class == 1 {
            CoreType::Performance
        } else if core.efficiency_class == 0 {
            if is_hybrid { CoreType::Efficiency } else { CoreType::Performance }
        } else {
            CoreType::Performance
        };
        
        let group_id = *core_group_map.get(&core.id).unwrap_or(&0) as u32;
        
        logical_cores.push(LogicalCore {
            id: core.id,
            core_type,
            physical_id: core.physical_id,
            group_id,
        });
    }
    
    logical_cores.sort_by_key(|c| c.id);
    Ok(logical_cores)
}

#[cfg(windows)]
fn get_logical_processor_info_ex() -> AppResult<Vec<SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX>> {
    let mut buffer_size: u32 = 0;
    
    unsafe {
        let _ = GetLogicalProcessorInformationEx(RelationAll, None, &mut buffer_size);
        
        if buffer_size == 0 {
            return Err(AppError::SystemError("Failed to get processor info size".to_string()));
        }
        
        let mut buffer: Vec<u8> = vec![0; buffer_size as usize];
        
        let ret = GetLogicalProcessorInformationEx(
            RelationAll,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut buffer_size,
        );
        
        if ret.is_err() {
            return Err(AppError::SystemError("GetLogicalProcessorInformationEx failed".to_string()));
        }
        
        let mut info_list = Vec::new();
        let mut offset = 0;
        
        while offset < buffer_size as usize {
            let ptr = buffer.as_ptr().add(offset) as *const SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX;
            let info = *ptr;
            info_list.push(info);
            
            if info.Size == 0 { break; }
            offset += info.Size as usize;
        }
        
        Ok(info_list)
    }
}

#[cfg(not(windows))]
fn get_logical_cores() -> AppResult<Vec<LogicalCore>> {
    Ok(vec![])
}
