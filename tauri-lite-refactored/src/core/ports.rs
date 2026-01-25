//! 抽象接口定义 (Ports)
//! 
//! 定义系统核心能力的抽象接口，实现 DIP (依赖倒置原则)。
//! UI 层应依赖这些接口而非具体实现。

use super::types::{AppResult, LiteProcess, PriorityLevel, CpuTopology};

/// 进程扫描接口
pub trait ProcessScanner {
    /// 扫描当前进程列表
    fn scan_processes(&mut self, search_term: &str) -> Vec<LiteProcess>;
    /// 获取 CPU 核心数
    fn cpu_count(&self) -> usize;
}

/// 进程控制接口
#[async_trait::async_trait]
pub trait ProcessOptimizer {
    /// 设置进程优先级
    async fn set_priority(&self, pid: u32, level: PriorityLevel) -> AppResult<()>;
    /// 设置进程 CPU 亲和性
    async fn set_affinity(&self, pid: u32, affinity_mask: String) -> AppResult<()>;
    /// 结束进程
    async fn kill_process(&self, pid: u32) -> AppResult<()>;
    /// 清理进程内存
    async fn trim_memory(&self, pid: u32) -> AppResult<u64>;
    /// 清理系统内存
    async fn clear_system_memory(&self) -> AppResult<u64>;
    /// 智能绑定最重线程
    async fn smart_bind_thread(&self, pid: u32, target_core: u32) -> AppResult<u32>;
}

/// 拓扑查询接口
pub trait TopologyProvider {
    /// 获取 CPU 拓扑
    fn get_topology(&self) -> AppResult<CpuTopology>;
}
