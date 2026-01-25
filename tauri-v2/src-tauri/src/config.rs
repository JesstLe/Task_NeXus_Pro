//! Configuration Management
//!
//! 应用配置的加载、保存和管理

use crate::{AppConfig, AppError, AppResult, ProcessProfile};
use once_cell::sync::OnceCell;
use parking_lot::RwLock;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

/// 全局配置实例
static CONFIG: OnceCell<RwLock<AppConfig>> = OnceCell::new();

/// 配置文件路径
static CONFIG_PATH: OnceCell<PathBuf> = OnceCell::new();

/// 初始化配置
pub fn init_config<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| AppError::ConfigError(e.to_string()))?;

    // 确保目录存在
    std::fs::create_dir_all(&app_data).ok();

    let config_path = app_data.join("config.json");
    CONFIG_PATH.set(config_path.clone()).ok();

    // 加载或创建配置
    let config = if config_path.exists() {
        let raw_content = std::fs::read_to_string(&config_path)?;
        
        // 尝试使用安全模块解密 (Gaming Security Shield)
        match crate::security::decrypt_data(&raw_content) {
            Ok(decrypted) => {
                tracing::info!("Config decrypted successfully");
                serde_json::from_str(&decrypted).unwrap_or_default()
            }
            Err(e) => {
                // 如果解密失败，检查是否是旧版的明文 JSON
                if raw_content.trim().starts_with('{') {
                    tracing::warn!("Plain-text config detected, migrating to encrypted format...");
                    serde_json::from_str(&raw_content).unwrap_or_default()
                } else {
                    tracing::error!("Failed to decrypt config and not valid JSON: {:?}. Using default.", e);
                    AppConfig::default()
                }
            }
        }
    } else {
        AppConfig::default()
    };

    CONFIG.set(RwLock::new(config)).ok();

    tracing::info!("Config initialized from {:?}", config_path);
    Ok(())
}

/// 保存配置
fn save_config() -> AppResult<()> {
    let config = CONFIG
        .get()
        .ok_or(AppError::ConfigError("Config not initialized".to_string()))?;
    let path = CONFIG_PATH
        .get()
        .ok_or(AppError::ConfigError("Config path not set".to_string()))?;

    let json = serde_json::to_string_pretty(&*config.read())?;
    
    // 使用安全模块加密 (Gaming Security Shield)
    let encrypted = crate::security::encrypt_data(&json)?;
    std::fs::write(path, encrypted)?;

    Ok(())
}

/// 获取完整配置
pub async fn get_config() -> AppResult<AppConfig> {
    let config = CONFIG
        .get()
        .ok_or(AppError::ConfigError("Config not initialized".to_string()))?;
    Ok(config.read().clone())
}

/// 获取完整配置 (同步版本, 用于 setup hook)
pub fn get_config_sync() -> AppResult<AppConfig> {
    let config = CONFIG
        .get()
        .ok_or(AppError::ConfigError("Config not initialized".to_string()))?;
    Ok(config.read().clone())
}

/// 设置配置值
pub async fn set_config_value(key: &str, value: serde_json::Value) -> AppResult<()> {
    let config = CONFIG
        .get()
        .ok_or(AppError::ConfigError("Config not initialized".to_string()))?;

    {
        let mut cfg = config.write();

        match key {
            "launchOnStartup" => {
                if let Some(v) = value.as_bool() {
                    cfg.launch_on_startup = v;
                }
            }
            "closeToTray" => {
                if let Some(v) = value.as_bool() {
                    cfg.close_to_tray = v;
                }
            }
            "startMinimized" => {
                if let Some(v) = value.as_bool() {
                    cfg.start_minimized = v;
                }
            }
            "cpuAffinityMode" => {
                if let Some(v) = value.as_str() {
                    cfg.cpu_affinity_mode = v.to_string();
                }
            }
            "defaultRules" => {
                if let Ok(rules) = serde_json::from_value(value) {
                    cfg.default_rules = rules;
                }
            }
            "gameList" => {
                if let Ok(list) = serde_json::from_value(value) {
                    cfg.game_list = list;
                }
            }
            "excludeList" => {
                if let Ok(list) = serde_json::from_value(value) {
                    cfg.exclude_list = list;
                }
            }
            "smartTrim" => {
                if let Ok(config) = serde_json::from_value(value) {
                    cfg.smart_trim = config;
                }
            }
            "throttleList" => {
                if let Ok(list) = serde_json::from_value(value) {
                    cfg.throttle_list = list;
                }
            }
            "proBalance" => {
                if let Ok(config) = serde_json::from_value(value) {
                    cfg.pro_balance = config;
                }
            }
            "license" => {
                if let Some(v) = value.as_str() {
                    cfg.license = Some(v.to_string());
                } else if value.is_null() {
                    cfg.license = None;
                }
            }
            "width" => {
                if let Some(v) = value.as_u64() {
                    cfg.width = v as u32;
                }
            }
            "height" => {
                if let Some(v) = value.as_u64() {
                    cfg.height = v as u32;
                }
            }
            "x" => {
                cfg.x = value.as_i64().map(|v| v as i32);
            }
            "y" => {
                cfg.y = value.as_i64().map(|v| v as i32);
            }
            _ => {
                return Err(AppError::ConfigError(format!(
                    "Unknown config key: {}",
                    key
                )));
            }
        }
    }

    save_config()?;
    Ok(())
}

/// 添加进程策略
pub async fn add_profile(profile: ProcessProfile) -> AppResult<serde_json::Value> {
    let config = CONFIG
        .get()
        .ok_or(AppError::ConfigError("Config not initialized".to_string()))?;

    let profiles = {
        let mut cfg = config.write();

        // 检查是否已存在
        let name_lower = profile.name.to_lowercase();
        if let Some(idx) = cfg
            .profiles
            .iter()
            .position(|p| p.name.to_lowercase() == name_lower)
        {
            cfg.profiles[idx] = profile;
        } else {
            cfg.profiles.push(profile);
        }

        cfg.profiles.clone()
    };

    save_config()?;

    Ok(serde_json::json!({
        "success": true,
        "profiles": profiles
    }))
}

/// 删除进程策略
pub async fn remove_profile(name: &str) -> AppResult<serde_json::Value> {
    let config = CONFIG
        .get()
        .ok_or(AppError::ConfigError("Config not initialized".to_string()))?;

    let profiles = {
        let mut cfg = config.write();
        let name_lower = name.to_lowercase();
        let initial_len = cfg.profiles.len();
        cfg.profiles.retain(|p| p.name.to_lowercase() != name_lower);

        if cfg.profiles.len() == initial_len {
            return Err(AppError::ConfigError(format!(
                "Profile not found: {}",
                name
            )));
        }

        cfg.profiles.clone()
    };

    save_config()?;

    Ok(serde_json::json!({
        "success": true,
        "profiles": profiles
    }))
}

/// 获取所有进程策略
pub async fn get_profiles() -> AppResult<Vec<ProcessProfile>> {
    let config = CONFIG
        .get()
        .ok_or(AppError::ConfigError("Config not initialized".to_string()))?;
    Ok(config.read().profiles.clone())
}

/// 导出配置到指定路径
pub fn export_config_to_path(path: PathBuf) -> AppResult<()> {
    let config = CONFIG.get().ok_or(AppError::ConfigError("Config not initialized".to_string()))?;
    let json = serde_json::to_string_pretty(&*config.read())?;
    
    // 导出明文 JSON 以便用户备份和迁移 (Import 兼容明文和密文)
    std::fs::write(path, json)?;
    Ok(())
}

/// 从指定路径导入配置
pub fn import_config_from_path(path: PathBuf) -> AppResult<()> {
    let raw_content = std::fs::read_to_string(&path)?;
    
    // 优先尝试解密，若失败则检查是否为明文（兼容旧版本导出）
    let json_content = match crate::security::decrypt_data(&raw_content) {
        Ok(decrypted) => decrypted,
        Err(_) => {
            if raw_content.trim().starts_with('{') {
                raw_content
            } else {
                return Err(AppError::ConfigError("无法识别的配置文件格式或硬件环境不匹配".to_string()));
            }
        }
    };

    let new_config: AppConfig = serde_json::from_str(&json_content)
        .map_err(|e| AppError::ConfigError(format!("Invalid config file: {}", e)))?;
    
    // Update global config
    let config = CONFIG.get().ok_or(AppError::ConfigError("Config not initialized".to_string()))?;
    *config.write() = new_config;
    
    // Save to default location (will automatically be encrypted)
    save_config()?;
    
    Ok(())
}

/// 更新完整配置 (用于自定义编辑器)
pub async fn update_full_config(new_config: AppConfig) -> AppResult<()> {
    let config = CONFIG.get().ok_or(AppError::ConfigError("Config not initialized".to_string()))?;
    
    // 覆盖全局配置
    *config.write() = new_config;
    
    // 保存并在后台应用更改 (如 SmartTrim 等)
    save_config()?;
    
    Ok(())
}
