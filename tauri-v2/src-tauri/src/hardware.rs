//! Hardware Detection Module
//!
//! CPU 拓扑检测、GPU 识别、系统监控

use crate::{AppError, AppResult, CpuTopology, CpuVendor, MemoryInfo};
// use once_cell::sync::Lazy;
// use parking_lot::RwLock;
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(windows)]
// use windows::Win32::System::SystemInformation::*;

/// CPU 监控运行状态
static CPU_MONITOR_RUNNING: AtomicBool = AtomicBool::new(false);

/// 上一次的 CPU 时间 (用于计算使用率)
// static LAST_CPU_TIMES: Lazy<RwLock<Vec<(u64, u64)>>> = Lazy::new(|| RwLock::new(Vec::new()));

// ============================================================================
// CPU 信息
// ============================================================================

/// 获取基本 CPU 信息
pub async fn get_cpu_info() -> AppResult<serde_json::Value> {
    use sysinfo::System;
    use std::collections::HashSet;

    tokio::task::spawn_blocking(|| {
        let mut sys = System::new();
        sys.refresh_cpu_all();

        let cpus = sys.cpus();
        if cpus.is_empty() {
            return Err(AppError::SystemError("无法检测到 CPU 信息".to_string()));
        }

        let model_raw = cpus[0].brand().to_string();
        let logical_cores = cpus.len();
        let speed = cpus[0].frequency();

        // 清理型号名称
        let model = model_raw
            .replace("(R)", "")
            .replace("(TM)", "")
            .replace(" CPU ", " ")
            .split('@')
            .next()
            .unwrap_or(&model_raw)
            .trim()
            .to_string();

        // 检测厂商
        let vendor = if model_raw.to_lowercase().contains("intel") {
            "Intel"
        } else if model_raw.to_lowercase().contains("amd") || model_raw.to_lowercase().contains("ryzen") {
            "AMD"
        } else {
            "Unknown"
        };

        // 获取物理核心数 (使用 hardware_topology 精确计算)
        let physical_cores = match crate::hardware_topology::get_cpu_topology() {
            Ok(topo) => {
                // 统计不同的 physical_id 数量
                let unique_physical_ids: HashSet<usize> = topo.iter().map(|c| c.physical_id).collect();
                unique_physical_ids.len()
            }
            Err(_) => {
                // 兜底方案：假设超线程，物理核心 = 逻辑核心 / 2
                logical_cores / 2
            }
        };

        Ok(serde_json::json!({
            "model": model,
            "vendor": vendor,
            "cores": logical_cores, // Backward compatibility with frontend
            "logical_cores": logical_cores,
            "physical_cores": physical_cores,
            "speed": speed,
        }))
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

/// 检测 CPU 拓扑 (P-Core/E-Core, CCD 等)
pub async fn detect_cpu_topology() -> AppResult<CpuTopology> {
    use sysinfo::System;

    tokio::task::spawn_blocking(|| {
        let mut sys = System::new();
        sys.refresh_cpu_all();

        let cpus = sys.cpus();
        if cpus.is_empty() {
            return Err(AppError::SystemError("无法检测到 CPU 信息".to_string()));
        }

        let model = cpus[0].brand().to_string();
        let logical_cores = cpus.len() as u32;
        let physical_cores = logical_cores / 2; // 假设超线程

        // 检测厂商
        let vendor = if model.to_lowercase().contains("intel") {
            CpuVendor::Intel
        } else if model.to_lowercase().contains("amd") || model.to_lowercase().contains("ryzen") {
            CpuVendor::AMD
        } else {
            CpuVendor::Unknown
        };

        let mut topology = CpuTopology {
            vendor: vendor.clone(),
            model: model.clone(),
            physical_cores,
            logical_cores,
            p_cores: None,
            e_cores: None,
            ccds: None,
            has_3d_cache: false,
            p_core_mask: 0,
            e_core_mask: 0,
            is_hybrid: false,
        };

        // ========================================================
        // 统一检测：使用 hardware_topology (Win32 API) 动态检测
        // 不再依赖 CPU 型号字符串匹配
        // ========================================================
        if let Ok(topo) = crate::hardware_topology::get_cpu_topology() {
            use crate::hardware_topology::CoreType;
            use std::collections::HashSet;

            // 统计各类型核心数
            let p_count = topo.iter().filter(|c| c.core_type == CoreType::Performance || c.core_type == CoreType::VCache).count() as u32;
            let e_count = topo.iter().filter(|c| c.core_type == CoreType::Efficiency).count() as u32;
            let vcache_count = topo.iter().filter(|c| c.core_type == CoreType::VCache).count() as u32;

            // 精确计算物理核心数
            let unique_physical_ids: HashSet<usize> = topo.iter().map(|c| c.physical_id).collect();
            topology.physical_cores = unique_physical_ids.len() as u32;

            // Intel Hybrid 检测
            if vendor == CpuVendor::Intel && e_count > 0 {
                topology.is_hybrid = true;
                topology.p_cores = Some(p_count);
                topology.e_cores = Some(e_count);

                // 计算 P-Core 掩码 (从 topology 中提取实际的逻辑核心 ID)
                let mut p_mask: u64 = 0;
                let mut e_mask: u64 = 0;
                for core in &topo {
                    if core.core_type == CoreType::Performance {
                        p_mask |= 1u64 << core.id;
                    } else if core.core_type == CoreType::Efficiency {
                        e_mask |= 1u64 << core.id;
                    }
                }
                topology.p_core_mask = p_mask;
                topology.e_core_mask = e_mask;
            }

            // AMD V-Cache 检测
            if vendor == CpuVendor::AMD && vcache_count > 0 {
                topology.has_3d_cache = true;
                // CCD 检测：统计不同的 group_id
                let unique_groups: HashSet<u32> = topo.iter().map(|c| c.group_id).collect();
                topology.ccds = Some(unique_groups.len() as u32);

                // 计算 VCache 核心掩码 (作为 p_core_mask)
                let mut vcache_mask: u64 = 0;
                let mut freq_mask: u64 = 0;
                for core in &topo {
                    if core.core_type == CoreType::VCache {
                        vcache_mask |= 1u64 << core.id;
                    } else {
                        freq_mask |= 1u64 << core.id;
                    }
                }
                topology.p_core_mask = vcache_mask; // VCache 核心优先
                topology.e_core_mask = freq_mask;  // 频率核心
            }
        } else {
            // 动态检测失败 - 使用安全回退 (所有核心视为 Performance)
            tracing::warn!("Dynamic CPU topology detection failed. Using safe fallback.");
        }

        // Note: Legacy AMD CCD string-matching removed.
        // All detection is now handled by hardware_topology Win32 API above.

        Ok(topology)
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

/// 检测 Intel 混合架构核心配置
fn detect_intel_hybrid(model: &str) -> Option<(u32, u32)> {
    let model_upper = model.to_uppercase();

    // 14代 Raptor Lake Refresh (Desktop & Mobile HX)
    if model_upper.contains("14900HX") { return Some((8, 16)); }  // Mobile HX
    if model_upper.contains("14900") { return Some((8, 16)); }     // Desktop
    if model_upper.contains("14700HX") { return Some((8, 12)); }  // Mobile HX
    if model_upper.contains("14700") { return Some((8, 12)); }     // Desktop
    if model_upper.contains("14600HX") { return Some((6, 8)); }   // Mobile HX
    if model_upper.contains("14600") { return Some((6, 8)); }      // Desktop

    // 13代 Raptor Lake (Desktop & Mobile HX/H)
    if model_upper.contains("13980HX") || model_upper.contains("13950HX") { return Some((8, 16)); } // Mobile HX Extreme
    if model_upper.contains("13900HX") { return Some((8, 16)); }  // Mobile HX (same as desktop)
    if model_upper.contains("13900HK") || model_upper.contains("13900H") { return Some((6, 8)); } // Mobile H/HK
    if model_upper.contains("13900") { return Some((8, 16)); }     // Desktop
    if model_upper.contains("13700HX") { return Some((8, 8)); }   // Mobile HX
    if model_upper.contains("13700H") { return Some((6, 8)); }    // Mobile H
    if model_upper.contains("13700") { return Some((8, 8)); }      // Desktop
    if model_upper.contains("13650HX") || model_upper.contains("13600HX") { return Some((6, 8)); } // Mobile HX
    if model_upper.contains("13600H") { return Some((4, 8)); }    // Mobile H
    if model_upper.contains("13600") { return Some((6, 8)); }      // Desktop
    if model_upper.contains("13500HX") { return Some((6, 8)); }   // Mobile HX
    if model_upper.contains("13500H") { return Some((4, 8)); }    // Mobile H
    if model_upper.contains("13400") { return Some((6, 4)); }

    // 12代 Alder Lake (Desktop & Mobile HX/H)
    if model_upper.contains("12900HX") { return Some((8, 8)); }   // Mobile HX
    if model_upper.contains("12900HK") || model_upper.contains("12900H") { return Some((6, 8)); } // Mobile H/HK
    if model_upper.contains("12900") { return Some((8, 8)); }      // Desktop
    if model_upper.contains("12800H") { return Some((6, 8)); }    // Mobile H
    if model_upper.contains("12700H") { return Some((6, 8)); }    // Mobile H
    if model_upper.contains("12700") { return Some((8, 4)); }      // Desktop
    if model_upper.contains("12650H") { return Some((6, 4)); }    // Mobile H
    if model_upper.contains("12600K") { return Some((6, 4)); }    // Desktop
    if model_upper.contains("12400") { return Some((6, 0)); }

    // No match - return None (caller should use safe fallback)
    None
}

/// 检测 AMD CCD 配置
fn detect_amd_ccds(model: &str, logical_cores: u32) -> Option<u32> {
    let model_upper = model.to_uppercase();

    // 双 CCD 处理器
    if model_upper.contains("5900")
        || model_upper.contains("5950")
        || model_upper.contains("7900")
        || model_upper.contains("7950")
        || model_upper.contains("9900")
        || model_upper.contains("9950")
    {
        return Some(2);
    }

    // 单 CCD
    if model_upper.contains("5600")
        || model_upper.contains("5700")
        || model_upper.contains("5800")
        || model_upper.contains("7600")
        || model_upper.contains("7700")
        || model_upper.contains("7800")
        || model_upper.contains("9600")
        || model_upper.contains("9700")
        || model_upper.contains("9800")
    {
        return Some(1);
    }

    // 根据核心数推断
    if logical_cores >= 24 {
        Some(2)
    } else if logical_cores >= 6 {
        Some(1)
    } else {
        None
    }
}

// ============================================================================
// 内存信息
// ============================================================================

/// 获取系统内存信息
pub async fn get_memory_info() -> AppResult<MemoryInfo> {
    use sysinfo::System;

    tokio::task::spawn_blocking(|| {
        let sys = System::new_all();

        let total = sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
        let free = sys.available_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
        let used = total - free;
        let percent = ((used / total) * 100.0) as u32;

        Ok(MemoryInfo {
            total: (total * 10.0).round() / 10.0,
            free: (free * 10.0).round() / 10.0,
            used: (used * 10.0).round() / 10.0,
            percent,
        })
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

// ============================================================================
// CPU 监控
// ============================================================================

/// 启动 CPU 核心监控 (Deprecated: Merged into ProcessMonitor)
pub async fn start_cpu_monitor(_app: tauri::AppHandle) {
    tracing::info!("CPU monitor requested (Legacy ignored: Integrated into ProcessMonitor)");
}

/// 停止 CPU 监控 (Deprecated)
pub async fn stop_cpu_monitor() {
    // No-op
}

// ============================================================================
// GPU 检测
// ============================================================================

/// 检测 GPU 信息
#[cfg(windows)]
pub async fn detect_gpu() -> AppResult<crate::GpuInfo> {
    use crate::{GpuInfo, GpuVendor};

    tokio::task::spawn_blocking(|| {
        // 使用 sysinfo 或 WMI 获取 GPU 信息
        // 这里简化处理，实际应该调用 SetupAPI 或 WMI

        // 暂时返回 Unknown
        Ok(GpuInfo {
            vendor: GpuVendor::Unknown,
            name: "Unknown GPU".to_string(),
        })
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn detect_gpu() -> AppResult<crate::GpuInfo> {
    use crate::{GpuInfo, GpuVendor};

    Ok(GpuInfo {
        vendor: GpuVendor::Unknown,
        name: "N/A".to_string(),
    })
}
