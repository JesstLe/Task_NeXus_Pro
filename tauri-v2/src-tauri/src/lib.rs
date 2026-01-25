#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod config;
pub mod cpu_sets;
pub mod governor;
pub mod hardware;
pub mod hardware_topology;
pub mod monitor;
pub mod power;
pub mod security;
pub mod thread;
pub mod tweaks;
pub mod watchdog;
pub mod icons;
pub mod registry;
pub mod advanced_affinity;

use serde::{Deserialize, Serialize};

/// 默认返回 true 的函数，供 serde 使用
fn default_true() -> bool {
    true
}

/// 解码系统命令输出 (GBK -> UTF-8)
pub fn decode_output(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    
    // Try UTF-8 first
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.trim().to_string();
    }

    // Fallback to GBK
    let (cow, _, malformed) = encoding_rs::GBK.decode(bytes);
    if malformed {
        // If still malformed, try to salvage what we can with Lossy
        return String::from_utf8_lossy(bytes).trim().to_string();
    }
    cow.trim().to_string()
}

// ============================================================================
// 进程信息
// ============================================================================

/// 进程信息结构体
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    /// 进程 ID
    pub pid: u32,
    /// 父进程 ID (用于树形视图)
    pub parent_pid: Option<u32>,
    /// 进程名称
    pub name: String,
    /// CPU 使用率 (0.0 - 100.0)
    pub cpu_usage: f32,
    /// 内存使用量 (bytes)
    pub memory_usage: u64,
    /// 优先级 (Idle, BelowNormal, Normal, AboveNormal, High, RealTime)
    pub priority: String,
    /// CPU 亲和性掩码 (formatted string)
    pub cpu_affinity: String,
    /// 线程数
    pub thread_count: u32,
    /// 用户名
    pub user: String,
    /// 执行路径
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
}

// ============================================================================
// CPU 拓扑信息
// ============================================================================

/// CPU 厂商
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum CpuVendor {
    Intel,
    AMD,
    Unknown,
}

/// CPU 拓扑信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuTopology {
    /// CPU 厂商
    pub vendor: CpuVendor,
    /// CPU 型号名称
    pub model: String,
    /// 物理核心数
    pub physical_cores: u32,
    /// 逻辑核心数 (线程数)
    pub logical_cores: u32,
    /// Intel P-Core 数量 (如果适用)
    pub p_cores: Option<u32>,
    /// Intel E-Core 数量 (如果适用)
    pub e_cores: Option<u32>,
    /// AMD CCD 数量 (如果适用)
    pub ccds: Option<u32>,
    /// 是否有 3D V-Cache
    pub has_3d_cache: bool,
    /// P-Core 亲和性掩码
    pub p_core_mask: u64,
    /// E-Core 亲和性掩码
    pub e_core_mask: u64,
    /// 是否为混合架构
    pub is_hybrid: bool,
}

impl Default for CpuTopology {
    fn default() -> Self {
        Self {
            vendor: CpuVendor::Unknown,
            model: String::new(),
            physical_cores: 0,
            logical_cores: 0,
            p_cores: None,
            e_cores: None,
            ccds: None,
            has_3d_cache: false,
            p_core_mask: 0,
            e_core_mask: 0,
            is_hybrid: false,
        }
    }
}

// ============================================================================
// GPU 信息
// ============================================================================

/// GPU 厂商
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum GpuVendor {
    NVIDIA,
    AMD,
    Intel,
    Unknown,
}

/// GPU 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub vendor: GpuVendor,
    pub name: String,
}

// ============================================================================
// 系统信息
// ============================================================================

/// 内存信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInfo {
    /// 总内存 (GB)
    pub total: f64,
    /// 可用内存 (GB)
    pub free: f64,
    /// 已用内存 (GB)
    pub used: f64,
    /// 使用百分比
    pub percent: u32,
}

/// CPU 核心负载
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoreLoad {
    /// 核心索引
    pub index: u32,
    /// 使用率 (0.0 - 100.0)
    pub usage: f32,
}

// ============================================================================
// 配置结构
// ============================================================================

/// 进程策略
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessProfile {
    /// 进程名称 (如 cs2.exe)
    pub name: String,
    /// CPU 亲和性掩码
    pub affinity: String,
    /// 调度模式
    pub mode: String,
    /// 优先级
    pub priority: String,
    /// 优先核心 (可选)
    #[serde(alias = "primary_core")]
    pub primary_core: Option<u32>,
    /// 是否启用
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// 创建时间戳
    pub timestamp: u64,
}

/// 默认规则配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultRules {
    /// 是否启用
    pub enabled: bool,
    /// 游戏进程掩码
    #[serde(alias = "game_mask")]
    pub game_mask: Option<String>,
    /// 系统进程掩码
    #[serde(alias = "system_mask")]
    pub system_mask: Option<String>,
    /// 游戏优先级
    #[serde(alias = "game_priority")]
    pub game_priority: String,
    /// 系统优先级
    #[serde(alias = "system_priority")]
    pub system_priority: String,
}

impl Default for DefaultRules {
    fn default() -> Self {
        Self {
            enabled: false,
            game_mask: None,
            system_mask: None,
            game_priority: "High".to_string(),
            system_priority: "BelowNormal".to_string(),
        }
    }
}

/// 智能内存优化配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartTrimConfig {
    pub enabled: bool,
    pub threshold: u32,
    pub interval: u32,
    pub mode: String,
}

impl Default for SmartTrimConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            threshold: 80,
            interval: 30,
            mode: "standby-only".to_string(),
        }
    }
}

/// ProBalance 智能抑制配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProBalanceConfig {
    pub enabled: bool,
    /// 触发抑制的总 CPU 阈值 (例如 50%)
    #[serde(alias = "cpu_threshold")]
    pub cpu_threshold: f32,
    /// 抑制后的优先级 (例如 "BelowNormal")
    #[serde(alias = "restrain_priority")]
    pub restrain_priority: String,
    /// 排除列表 (进程名)
    #[serde(alias = "excluded_processes")]
    pub excluded_processes: Vec<String>,
}

impl Default for ProBalanceConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            cpu_threshold: 50.0,
            restrain_priority: "BelowNormal".to_string(),
            excluded_processes: vec!["task-nexus.exe".to_string(), "explorer.exe".to_string()],
        }
    }
}

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// 窗口尺寸
    pub width: u32,
    pub height: u32,
    pub x: Option<i32>,
    pub y: Option<i32>,
    /// 开机自启动
    #[serde(alias = "launch_on_startup")]
    pub launch_on_startup: bool,
    /// 关闭时最小化到托盘
    #[serde(alias = "close_to_tray")]
    pub close_to_tray: bool,
    /// 启动时最小化窗口
    #[serde(alias = "start_minimized")]
    pub start_minimized: bool,
    /// CPU 亲和性模式
    #[serde(alias = "cpu_affinity_mode")]
    pub cpu_affinity_mode: String,
    /// 调度模式 (前端用)
    #[serde(default)]
    pub mode: Option<String>,
    /// 进程策略列表
    pub profiles: Vec<ProcessProfile>,
    /// 默认规则
    pub default_rules: DefaultRules,
    /// 游戏列表
    pub game_list: Vec<String>,
    /// 排除列表
    pub exclude_list: Vec<String>,
    /// 智能内存优化
    pub smart_trim: SmartTrimConfig,
    /// ProBalance 配置
    pub pro_balance: ProBalanceConfig,
    /// 后台限制列表
    pub throttle_list: Vec<String>,
    /// 授权许可
    pub license: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            width: 900,
            height: 600,
            x: None,
            y: None,
            launch_on_startup: false,
            close_to_tray: false,
            start_minimized: false,
            cpu_affinity_mode: "dynamic".to_string(),
            mode: None,
            profiles: Vec::new(),
            default_rules: DefaultRules::default(),
            game_list: vec![
                "cs2.exe".to_string(),
                "csgo.exe".to_string(),
                "valorant.exe".to_string(),
                "valorant-win64-shipping.exe".to_string(),
                "leagueclient.exe".to_string(),
                "league of legends.exe".to_string(),
                "apex_legends.exe".to_string(),
                "r5apex.exe".to_string(),
                "pubg.exe".to_string(),
                "tslgame.exe".to_string(),
                "fortnite.exe".to_string(),
                "overwatch.exe".to_string(),
                "dota2.exe".to_string(),
                "narakabladepoint.exe".to_string(),
                "naraka.exe".to_string(),
            ],
            exclude_list: vec![
                "system".to_string(),
                "idle".to_string(),
                "smss.exe".to_string(),
                "csrss.exe".to_string(),
                "wininit.exe".to_string(),
                "services.exe".to_string(),
                "lsass.exe".to_string(),
                "svchost.exe".to_string(),
                "dwm.exe".to_string(),
                "explorer.exe".to_string(),
            ],
            smart_trim: SmartTrimConfig::default(),
            pro_balance: ProBalanceConfig::default(),
            throttle_list: Vec::new(),
            license: None,
        }
    }
}

// ============================================================================
// 错误类型
// ============================================================================

/// 应用错误类型
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("进程不存在或无权限访问: {0}")]
    ProcessNotFound(u32),

    #[error("无效的进程 ID: {0}")]
    InvalidPid(u32),

    #[error("无效的核心掩码: {0}")]
    InvalidAffinityMask(String),

    #[error("系统调用失败: {0}")]
    SystemError(String),

    #[error("配置错误: {0}")]
    ConfigError(String),

    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),

    #[error("JSON 错误: {0}")]
    JsonError(#[from] serde_json::Error),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// 应用结果类型
pub type AppResult<T> = Result<T, AppError>;
