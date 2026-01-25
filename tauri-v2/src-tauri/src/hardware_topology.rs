//! 硬件拓扑探测模块
//!
//! 用于检测 CPU 混合架构 (Intel P/E 核) 和 AMD 3D V-Cache 核心。
//! 不依赖 sysinfo，直接使用 Windows API。

use serde::Serialize;
use std::collections::HashMap;
use windows::Win32::System::SystemInformation::{
    GetLogicalProcessorInformationEx, RelationAll, RelationCache, RelationProcessorCore,
    SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX,
};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum CoreType {
    Performance, // Intel P-Core / AMD Frequency Core / Standard Core
    Efficiency,  // Intel E-Core
    VCache,      // AMD 3D V-Cache Core (High L3)
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogicalCore {
    pub id: usize, // OS Logical Processor ID (0..N)
    pub core_type: CoreType,
    pub physical_id: usize, // Which physical core it belongs to
    pub group_id: u32,      // For AMD: CCD Index; For Intel: 0 (Approximated by GroupMask)
}

/// 获取 CPU 拓扑信息
pub fn get_cpu_topology() -> Result<Vec<LogicalCore>, String> {
    // 1. 获取所有逻辑处理器信息
    let info_list = get_logical_processor_info_ex()?;

    // 2. 分析缓存 (Step A: Cache Analysis - Crucial for AMD)
    // Map: GroupMask -> L3 Cache Size (bytes)
    let mut l3_cache_map: HashMap<usize, u64> = HashMap::new();
    // Map: Logical Processor ID -> Group ID (CCD approximation via Cache GroupMask)
    let mut core_group_map: HashMap<usize, usize> = HashMap::new();

    for info in &info_list {
        if info.Relationship == RelationCache {
            let cache = unsafe { info.Anonymous.Cache };
            if cache.Level == 3 {
                // L3 Cache
                // Fix: Access GroupMask via Anonymous union
                let mask = unsafe { cache.Anonymous.GroupMask.Mask };
                let size = cache.CacheSize as u64;
                l3_cache_map.insert(mask, size);

                // 将 mask 下的所有核心映射到这个 mask (作为 GroupID/CCD ID)
                for i in 0..64 {
                    if (mask >> i) & 1 == 1 {
                        core_group_map.insert(i, mask);
                    }
                }
            }
        }
    }

    // 检测是否存在 AMD V-Cache (是否存在显著较大的 L3 Cache)
    // 阈值：通常标准 L3 是 32MB (33554432)，V-Cache 是 96MB+
    // 我们设定一个阈值 64MB
    let vcache_threshold = 64 * 1024 * 1024;
    let has_large_l3 = l3_cache_map.values().any(|&size| size > vcache_threshold);

    // 3. 分析核心架构 (Step B: Architecture Analysis)
    let mut logical_cores = Vec::new();
    let mut efficiency_classes = Vec::new();

    // 临时存储核心信息以便后续判定
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

            // 一个 ProcessorCore 可能对应多个逻辑核心 (超线程)
            // 遍历 bitmask 找到对应的逻辑核心 ID
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

    // 判断是否是 Intel 混合架构 (E-Cores)
    // 如果存在不同的 EfficiencyClass，则认为是混合架构
    let min_class = *efficiency_classes.iter().min().unwrap_or(&0);
    let max_class = *efficiency_classes.iter().max().unwrap_or(&0);
    let is_hybrid = min_class != max_class;

    // 4. 整合信息 (Consolidation)
    for core in temp_cores {
        let core_type;

        // AMD V-Cache 判断逻辑
        if has_large_l3 {
            // 找到该核心所属的 Cache Group
            if let Some(&group_mask) = core_group_map.get(&core.id) {
                if let Some(&cache_size) = l3_cache_map.get(&group_mask) {
                    if cache_size > vcache_threshold {
                        core_type = CoreType::VCache;
                    } else {
                        core_type = CoreType::Performance;
                    }
                } else {
                    core_type = CoreType::Performance;
                }
            } else {
                core_type = CoreType::Performance;
            }
        }
        // Intel Hybrid 判断逻辑
        else if core.efficiency_class == 1 {
            core_type = CoreType::Performance;
        } else if core.efficiency_class == 0 {
            if is_hybrid {
                core_type = CoreType::Efficiency;
            } else {
                core_type = CoreType::Performance;
            }
        } else {
            // 更高的 efficiency class 也视为 Performance
            core_type = CoreType::Performance;
        }

        // 获取简单的 Group ID (使用 Cache Mask 作为 ID 的一部分，简化处理)
        let group_id = *core_group_map.get(&core.id).unwrap_or(&0) as u32;

        logical_cores.push(LogicalCore {
            id: core.id,
            core_type,
            physical_id: core.physical_id,
            group_id,
        });
    }

    // 按 ID 排序
    logical_cores.sort_by_key(|c| c.id);

    Ok(logical_cores)
}

/// Helper: 调用 GetLogicalProcessorInformationEx 获取原始数据
fn get_logical_processor_info_ex() -> Result<Vec<SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX>, String> {
    let mut buffer_size: u32 = 0;

    unsafe {
        // 第一次调用获取所需缓冲区大小
        let _ = GetLogicalProcessorInformationEx(RelationAll, None, &mut buffer_size);

        if buffer_size == 0 {
            return Err("Failed to get logical processor info size".to_string());
        }

        // 分配缓冲区
        let mut buffer: Vec<u8> = vec![0; buffer_size as usize];

        // 第二次调用获取数据
        let ret = GetLogicalProcessorInformationEx(
            RelationAll,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut buffer_size,
        );

        if ret.is_err() {
            return Err("GetLogicalProcessorInformationEx failed".to_string());
        }

        // 解析缓冲区
        let mut info_list = Vec::new();
        let mut offset = 0;

        while offset < buffer_size as usize {
            let ptr = buffer.as_ptr().add(offset) as *const SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX;
            let info = *ptr; // Copy the struct

            info_list.push(info);

            if info.Size == 0 {
                break;
            }
            offset += info.Size as usize;
        }

        Ok(info_list)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_topology() {
        match get_cpu_topology() {
            Ok(topo) => {
                println!("Detected {} logical cores", topo.len());
                for core in &topo {
                    println!(
                        "Core {}: Type={:?}, PhysID={}, Group={}",
                        core.id, core.core_type, core.physical_id, core.group_id
                    );
                }

                let p_cores = topo
                    .iter()
                    .filter(|c| c.core_type == CoreType::Performance)
                    .count();
                let e_cores = topo
                    .iter()
                    .filter(|c| c.core_type == CoreType::Efficiency)
                    .count();
                let v_cores = topo
                    .iter()
                    .filter(|c| c.core_type == CoreType::VCache)
                    .count();

                println!(
                    "Summary: P-Cores={}, E-Cores={}, V-Cache Cores={}",
                    p_cores, e_cores, v_cores
                );
                assert!(topo.len() > 0);
            }
            Err(e) => panic!("Failed to get topology: {}", e),
        }
    }
}
