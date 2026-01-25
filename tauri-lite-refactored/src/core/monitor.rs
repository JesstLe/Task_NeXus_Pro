//! 系统监控模块
//! 
//! 封装 sysinfo 库，提供进程扫描和系统状态刷新功能。
//! 接管原 main.rs 中的 refresh_data 逻辑。

use sysinfo::{System, ProcessesToUpdate};
use super::types::LiteProcess;

/// 系统监控器
pub struct SystemMonitor {
    sys: System,
    /// 缓存的 CPU 核心数，用于计算 CPU 使用率
    cpu_count: f32,
}

impl SystemMonitor {
    /// 创建新的系统监控器
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        let cpu_count = sys.cpus().len() as f32;
        
        Self {
            sys,
            cpu_count,
        }
    }

    /// 获取 CPU 核心数
    pub fn cpu_count(&self) -> usize {
        self.cpu_count as usize
    }

    /// 扫描进程并返回列表
    /// 
    /// 对应原 main.rs 中的 refresh_data 逻辑
    pub fn scan_processes(&mut self, search_term: &str) -> Vec<LiteProcess> {
        // 1. 刷新系统状态
        self.sys.refresh_cpu_all();
        self.sys.refresh_processes(ProcessesToUpdate::All);
        
        let mut new_procs = Vec::new();
        let query = search_term.to_lowercase();
        
        // 2. 遍历、过滤与转换
        for (pid, process) in self.sys.processes() {
            let name = process.name().to_string_lossy().to_string();
            if name.is_empty() { continue; }
            if !query.is_empty() && !name.to_lowercase().contains(&query) { continue; }
            
            new_procs.push(LiteProcess {
                pid: pid.as_u32(),
                name,
                // CPU 使用率归一化逻辑保持不变
                cpu: process.cpu_usage() / self.cpu_count,
                mem: process.memory() / 1024 / 1024,
            });
        }
        
        // 3. 排序 (按 CPU 降序)
        new_procs.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
        
        new_procs
    }
}
