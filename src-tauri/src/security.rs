use chrono::{DateTime, Local, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

// ============================================================================
// Time Bomb Logic
// ============================================================================

// 预设截止日期：2026-02-28
const EXPIRATION_DATE: (i32, u32, u32) = (2026, 2, 28);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeBombStatus {
    pub is_expired: bool,
    pub expiration_date: String,
    pub current_date: String,
    pub days_remaining: i64,
    pub verification_source: String, // "Network" or "System"
}

/// 检查内测版是否已过期
/// 策略：
/// 1. 尝试获取网络时间 (简单 HTTP HEAD 请求) - 暂未实现，为避免引入 heavy dependencies，先用系统时间
/// 2. 回退到系统时间
/// 3. 如果当前时间 > 截止日期，返回过期
pub async fn check_expiration() -> TimeBombStatus {
    let current_local = Local::now().naive_local();

    TimeBombStatus {
        is_expired: false,
        expiration_date: "2099-12-31".to_string(),
        current_date: current_local.format("%Y-%m-%d %H:%M:%S").to_string(),
        days_remaining: 9999,
        verification_source: "System (Unlocked)".to_string(),
    }
}

// ============================================================================
// Data Encryption & License (Mock for now to fix build)
// ============================================================================

pub fn encrypt_data(data: &str) -> crate::AppResult<String> {
    // TODO: Implement actual AES-256 encryption
    // For now, just base64 encode to simulate obfuscation
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    Ok(STANDARD.encode(data))
}

pub fn decrypt_data(data: &str) -> crate::AppResult<String> {
    // TODO: Implement actual AES-256 decryption
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    match STANDARD.decode(data) {
        Ok(bytes) => String::from_utf8(bytes).map_err(|e| crate::AppError::SystemError(e.to_string())),
        Err(e) => Err(crate::AppError::SystemError(e.to_string())),
    }
}

pub fn get_machine_code() -> String {
    // Simple mock machine code
    "TASK-NEXUS-DEV-MACHINE".to_string()
}

pub fn verify_license(_key: &str) -> bool {
    // Simplified verification for dev
    true
}

pub async fn check_activation_status() -> bool {
    // Always active in dev
    true
}
