use std::process::Command;
use std::os::windows::process::CommandExt;
use crate::core::{AppResult, AppError};

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone)]
pub struct PowerPlan {
    pub guid: String,
    pub name: String,
    pub is_active: bool,
}

pub fn get_power_plans() -> AppResult<Vec<PowerPlan>> {
    let output = Command::new("powercfg")
        .arg("/list")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| AppError::SystemError(format!("Failed to execute powercfg: {}", e)))?;

    // 优先尝试 UTF-8，失败则使用 GBK 解码 (修复中文乱码)
    let stdout = match String::from_utf8(output.stdout.clone()) {
        Ok(s) => s,
        Err(_) => {
            let (cow, _encoding_used, _had_errors) = encoding_rs::GBK.decode(&output.stdout);
            cow.into_owned()
        }
    };
    
    let mut plans = Vec::new();

    for line in stdout.lines() {
        if line.contains("GUID") {
            // Parse line like: "Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced) *"
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                let guid = parts[3].to_string();
                let name_start = line.find('(').unwrap_or(0);
                let name_end = line.find(')').unwrap_or(line.len());
                let name = if name_start < name_end {
                    line[name_start + 1..name_end].to_string()
                } else {
                    "Unknown".to_string()
                };
                let is_active = line.trim().ends_with('*');

                plans.push(PowerPlan {
                    guid,
                    name,
                    is_active,
                });
            }
        }
    }

    Ok(plans)
}

pub fn set_active_plan(guid: &str) -> AppResult<()> {
    let output = Command::new("powercfg")
        .arg("/setactive")
        .arg(guid)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| AppError::SystemError(format!("Failed to execute powercfg: {}", e)))?;

    if output.status.success() {
        Ok(())
    } else {
        // 解码错误信息，防止乱码
        let stderr = match String::from_utf8(output.stderr.clone()) {
            Ok(s) => s,
            Err(_) => {
                let (cow, _, _) = encoding_rs::GBK.decode(&output.stderr);
                cow.into_owned()
            }
        };
        Err(AppError::SystemError(format!("Failed to set active plan: {}", stderr)))
    }
}

pub fn delete_plan(guid: &str) -> AppResult<()> {
    // Prevent deleting default plans
    let default_plans = [
        "381b4222-f694-41f0-9685-ff5bb260df2e", // Balanced
        "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c", // High performance
        "a1841308-3541-4fab-bc81-f71556f20b4a", // Power saver
        "e9a42b02-d5df-448d-aa00-03f14749eb61", // Ultimate Performance
    ];

    if default_plans.contains(&guid) {
        return Err(AppError::SystemError("Cannot delete default Windows power plans".to_string()));
    }

    let status = Command::new("powercfg")
        .arg("/delete")
        .arg(guid)
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| AppError::SystemError(format!("Failed to execute powercfg: {}", e)))?;

    if status.success() {
        Ok(())
    } else {
        Err(AppError::SystemError(format!("Failed to delete plan: {}", status)))
    }
}

pub fn import_plan(file_path: &str) -> AppResult<()> {
    let status = Command::new("powercfg")
        .arg("/import")
        .arg(file_path)
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| AppError::SystemError(format!("Failed to execute powercfg: {}", e)))?;

    if status.success() {
        Ok(())
    } else {
        Err(AppError::SystemError(format!("Failed to import plan: {}", status)))
    }
}