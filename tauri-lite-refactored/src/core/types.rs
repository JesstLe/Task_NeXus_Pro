//! 公共类型定义
//! 
//! 所有模块共享的基础类型，保持与 tauri-v2 核心库兼容。

use serde::{Deserialize, Serialize};

/// 轻量级进程信息 (用于 UI 列表)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiteProcess {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    pub mem: u64,
}

/// 进程信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_usage: u64,
    pub priority: String,
    pub cpu_affinity: String,
    pub thread_count: u32,
    pub user: String,
    pub path: String,
}

/// 优先级级别
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum PriorityLevel {
    Idle,
    BelowNormal,
    Normal,
    AboveNormal,
    High,
    RealTime,
}

impl PriorityLevel {
    pub fn as_str(&self) -> &'static str {
        match self {
            PriorityLevel::Idle => "Idle",
            PriorityLevel::BelowNormal => "BelowNormal",
            PriorityLevel::Normal => "Normal",
            PriorityLevel::AboveNormal => "AboveNormal",
            PriorityLevel::High => "High",
            PriorityLevel::RealTime => "RealTime",
        }
    }
    
    pub fn as_str_cn(&self) -> &'static str {
        match self {
            PriorityLevel::Idle => "空闲",
            PriorityLevel::BelowNormal => "低",
            PriorityLevel::Normal => "正常",
            PriorityLevel::AboveNormal => "较高",
            PriorityLevel::High => "高",
            PriorityLevel::RealTime => "实时",
        }
    }


    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "idle" => Some(PriorityLevel::Idle),
            "belownormal" => Some(PriorityLevel::BelowNormal),
            "normal" => Some(PriorityLevel::Normal),
            "abovenormal" => Some(PriorityLevel::AboveNormal),
            "high" => Some(PriorityLevel::High),
            "realtime" => Some(PriorityLevel::RealTime),
            _ => None,
        }
    }

    /// 获取优先级对应的颜色 (UI 逻辑 - 暂留此处或移至 UI adapter，为保持兼容暂留但推荐在 UI 层处理)
    pub fn color(&self) -> (u8, u8, u8) {
        match self {
            PriorityLevel::RealTime => (255, 50, 50),   // 红色
            PriorityLevel::High => (255, 150, 50),      // 橙色
            PriorityLevel::AboveNormal => (255, 220, 50), // 黄色
            PriorityLevel::Normal => (150, 150, 150),   // 灰色
            PriorityLevel::BelowNormal => (100, 180, 255), // 蓝色
            PriorityLevel::Idle => (100, 100, 100),     // 深灰
        }
    }
}

/// CPU 核心类型
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum CoreType {
    Performance,
    Efficiency,
    VCache,
    Unknown,
}

/// 逻辑核心信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogicalCore {
    pub id: usize,
    pub core_type: CoreType,
    pub physical_id: usize,
    pub group_id: u32,
}

/// CPU 拓扑信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuTopology {
    pub model: String,
    pub physical_cores: u32,
    pub logical_cores: u32,
    pub cores: Vec<LogicalCore>,
    pub is_hybrid: bool,
    pub has_vcache: bool,
    /// CCD 分组信息 (CCD ID -> Core IDs)
    pub ccd_groups: Vec<Vec<usize>>,
}

/// 应用错误类型
#[derive(Debug)]
pub enum AppError {
    ProcessNotFound(u32),
    InvalidPid(u32),
    InvalidAffinityMask(String),
    SystemError(String),
    IoError(std::io::Error),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::ProcessNotFound(pid) => write!(f, "进程不存在: {}", pid),
            AppError::InvalidPid(pid) => write!(f, "无效的进程 ID: {}", pid),
            AppError::InvalidAffinityMask(m) => write!(f, "无效的核心掩码: {}", m),
            AppError::SystemError(s) => write!(f, "系统错误: {}", s),
            AppError::IoError(e) => write!(f, "IO 错误: {}", e),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::IoError(e)
    }
}

/// 应用结果类型
pub type AppResult<T> = Result<T, AppError>;

/// 待应用的进程策略 (尚未执行)
#[derive(Debug, Clone, Default)]
pub struct PendingProfile {
    /// 核心掩码 (None = 使用当前选中的核心)
    pub affinity_mask: Option<u64>,
    /// 优先级 (None = 不修改)
    pub priority: Option<PriorityLevel>,
    /// 线程绑定目标核心 (None = 不绑定)
    pub thread_bind_core: Option<u32>,
    /// 理想核心 (SetThreadIdealProcessor) (None = 不设置)
    pub ideal_core: Option<u32>,
}

impl PendingProfile {
    pub fn is_empty(&self) -> bool {
        self.affinity_mask.is_none() && self.priority.is_none() && self.thread_bind_core.is_none() && self.ideal_core.is_none()
    }
    
    // summary 方法移至 UI 层处理，保持 Domain 纯净
}
