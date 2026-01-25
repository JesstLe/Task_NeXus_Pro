//! Power Plan Management
//!
//! Windows 电源计划控制

use crate::{AppError, AppResult};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 已知电源计划 GUID
const POWER_PLANS: &[(&str, &str)] = &[
    ("high_performance", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"),
    ("balanced", "381b4222-f694-41f0-9685-ff5bb260df2e"),
    ("power_saver", "a1841308-3541-4fab-bc81-f71556f20b4a"),
    ("ultimate", "e9a42b02-d5df-448d-aa00-03f14749eb61"),
];

/// 获取当前电源计划
#[cfg(windows)]
pub async fn get_current_power_plan() -> AppResult<serde_json::Value> {
    use std::process::Command;

    tokio::task::spawn_blocking(|| {
        let output = Command::new("powercfg")
            .args(["/getactivescheme"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| AppError::SystemError(e.to_string()))?;

        let stdout = crate::decode_output(&output.stdout);

        // 解析 GUID
        if let Some(guid) = extract_guid(&stdout) {
            let name = POWER_PLANS
                .iter()
                .find(|(_, g)| g.eq_ignore_ascii_case(&guid))
                .map(|(n, _)| *n)
                .unwrap_or("custom");

            Ok(serde_json::json!({
                "success": true,
                "guid": guid,
                "name": name
            }))
        } else {
            Err(AppError::SystemError("无法解析电源计划".to_string()))
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn get_current_power_plan() -> AppResult<serde_json::Value> {
    Err(AppError::SystemError("仅支持 Windows".to_string()))
}

/// 设置电源计划
#[cfg(windows)]
pub async fn set_power_plan(plan: &str) -> AppResult<serde_json::Value> {
    use std::process::Command;

    let plan = plan.to_string();

    tokio::task::spawn_blocking(move || {
        // 检查是否是 GUID 或名称
        let guid = if is_guid(&plan) {
            plan.clone()
        } else {
            POWER_PLANS
                .iter()
                .find(|(n, _)| n.eq_ignore_ascii_case(&plan))
                .map(|(_, g)| g.to_string())
                .ok_or_else(|| AppError::SystemError(format!("未知的电源计划: {}", plan)))?
        };

        let output = Command::new("powercfg")
            .args(["/setactive", &guid])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| AppError::SystemError(e.to_string()))?;

        if output.status.success() {
            tracing::info!("Power plan switched to: {}", plan);
            Ok(serde_json::json!({
                "success": true,
                "plan": plan
            }))
        } else {
            let stderr = crate::decode_output(&output.stderr);
            Err(AppError::SystemError(stderr.to_string()))
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn set_power_plan(_plan: &str) -> AppResult<serde_json::Value> {
    Err(AppError::SystemError("仅支持 Windows".to_string()))
}

/// 列出所有电源计划
#[cfg(windows)]
pub async fn list_power_plans() -> AppResult<serde_json::Value> {
    use std::process::Command;

    tokio::task::spawn_blocking(|| {
        let output = Command::new("powercfg")
            .args(["/list"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| AppError::SystemError(e.to_string()))?;

        let stdout = crate::decode_output(&output.stdout);
        let mut plans = Vec::new();

        for line in stdout.lines() {
            if let Some(guid) = extract_guid(line) {
                let is_active = line.contains('*');

                // 尝试提取名称
                let name = line
                    .split('(')
                    .nth(1)
                    .and_then(|s| s.split(')').next())
                    .unwrap_or("Unknown")
                    .to_string();

                plans.push(serde_json::json!({
                    "guid": guid,
                    "name": name,
                    "active": is_active
                }));
            }
        }

        Ok(serde_json::json!({
            "success": true,
            "plans": plans
        }))
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn list_power_plans() -> AppResult<serde_json::Value> {
    Err(AppError::SystemError("仅支持 Windows".to_string()))
}

/// 导入电源计划 (.pow 文件)
#[cfg(windows)]
pub async fn import_power_plan(path: String) -> AppResult<serde_json::Value> {
    use std::process::Command;

    tokio::task::spawn_blocking(move || {
        let output = Command::new("powercfg")
            .args(["-import", &path])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| AppError::SystemError(e.to_string()))?;

        if output.status.success() {
            let stdout = crate::decode_output(&output.stdout);
            let guid = extract_guid(&stdout).ok_or_else(|| {
                AppError::SystemError("导出成功但无法获取新 GUID".to_string())
            })?;

            Ok(serde_json::json!({
                "success": true,
                "guid": guid
            }))
        } else {
            let stderr = crate::decode_output(&output.stderr);
            Err(AppError::SystemError(stderr.to_string()))
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn import_power_plan(_path: String) -> AppResult<serde_json::Value> {
    Err(AppError::SystemError("仅支持 Windows".to_string()))
}

/// 打开系统电源设置面板
#[cfg(windows)]
pub fn open_power_settings() -> AppResult<bool> {
    use std::process::Command;
    Command::new("control")
        .arg("powercfg.cpl")
        .spawn()
        .map(|_| true)
        .map_err(|e| AppError::SystemError(e.to_string()))
}

#[cfg(not(windows))]
pub fn open_power_settings() -> AppResult<bool> {
    Err(AppError::SystemError("仅支持 Windows".to_string()))
}

/// 从字符串中提取 GUID
fn extract_guid(s: &str) -> Option<String> {
    // let re_pattern = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

    // 简单的手动匹配
    for word in s.split_whitespace() {
        let word = word.trim_matches(|c: char| !c.is_alphanumeric() && c != '-');
        if word.len() == 36 && word.chars().filter(|&c| c == '-').count() == 4 {
            // 验证格式
            let parts: Vec<&str> = word.split('-').collect();
            if parts.len() == 5
                && parts[0].len() == 8
                && parts[1].len() == 4
                && parts[2].len() == 4
                && parts[3].len() == 4
                && parts[4].len() == 12
            {
                return Some(word.to_lowercase());
            }
        }
    }
    None
}

/// 检查是否是有效的 GUID 格式
fn is_guid(s: &str) -> bool {
    extract_guid(s).is_some()
}
/// 删除电源计划
#[cfg(windows)]
pub async fn delete_power_plan(guid: String) -> AppResult<serde_json::Value> {
    use std::process::Command;

    tokio::task::spawn_blocking(move || {
        // 安全检查：防止删除核心系统计划
        if POWER_PLANS
            .iter()
            .any(|(_, g)| g.eq_ignore_ascii_case(&guid))
        {
            return Err(AppError::SystemError(
                "禁止删除核心系统电源计划".to_string(),
            ));
        }

        let output = Command::new("powercfg")
            .args(["/delete", &guid])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| AppError::SystemError(e.to_string()))?;

        if output.status.success() {
            tracing::info!("Power plan deleted: {}", guid);
            Ok(serde_json::json!({
                "success": true,
                "guid": guid
            }))
        } else {
            let stderr = crate::decode_output(&output.stderr);
            Err(AppError::SystemError(stderr.to_string()))
        }
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn delete_power_plan(_guid: String) -> AppResult<serde_json::Value> {
    Err(AppError::SystemError("仅支持 Windows".to_string()))
}
