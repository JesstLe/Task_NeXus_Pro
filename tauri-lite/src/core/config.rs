//! 配置管理模块
//!
//! 提供配置的保存、加载、导入和导出功能。

use super::types::AppResult;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    /// 开机自启动
    pub auto_start: bool,
    /// 进程配置 (进程名 -> 核心掩码)
    pub process_profiles: HashMap<String, ProcessProfile>,
}

/// 单个进程配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessProfile {
    pub affinity_mask: String,
    pub priority: String,
}

impl AppConfig {
    /// 获取配置文件路径
    fn config_path() -> PathBuf {
        let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("TaskNeXusLite");
        std::fs::create_dir_all(&path).ok();
        path.push("config.json");
        path
    }

    /// 加载配置
    pub fn load() -> Self {
        let path = Self::config_path();
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str(&content) {
                    return config;
                }
            }
        }
        Self::default()
    }

    /// 保存配置
    pub fn save(&self) -> AppResult<()> {
        let path = Self::config_path();
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| super::types::AppError::SystemError(e.to_string()))?;
        std::fs::write(&path, content)
            .map_err(|e| super::types::AppError::SystemError(e.to_string()))?;
        Ok(())
    }

    /// 导出配置到指定路径
    pub fn export_to(&self, path: &std::path::Path) -> AppResult<()> {
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| super::types::AppError::SystemError(e.to_string()))?;
        std::fs::write(path, content)
            .map_err(|e| super::types::AppError::SystemError(e.to_string()))?;
        Ok(())
    }

    /// 从指定路径导入配置
    pub fn import_from(path: &std::path::Path) -> AppResult<Self> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| super::types::AppError::SystemError(e.to_string()))?;
        serde_json::from_str(&content)
            .map_err(|e| super::types::AppError::SystemError(e.to_string()))
    }
}

// ============================================================================
// 开机自启动 (Windows Registry)
// ============================================================================

#[cfg(windows)]
pub fn set_auto_start(enable: bool) -> AppResult<()> {
    use std::env;
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = r"Software\Microsoft\Windows\CurrentVersion\Run";
    let key = hkcu.open_subkey_with_flags(path, KEY_WRITE)
        .map_err(|e| super::types::AppError::SystemError(e.to_string()))?;

    if enable {
        let exe_path = env::current_exe()
            .map_err(|e| super::types::AppError::SystemError(e.to_string()))?;
        key.set_value("TaskNeXusLite", &exe_path.to_string_lossy().to_string())
            .map_err(|e| super::types::AppError::SystemError(e.to_string()))?;
    } else {
        key.delete_value("TaskNeXusLite").ok(); // Ignore error if not exists
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn set_auto_start(_enable: bool) -> AppResult<()> {
    Ok(())
}
