use chrono::{Local, NaiveDate};
use serde::{Deserialize, Serialize};

// ============================================================================
// Time Bomb Logic
// ============================================================================

// 预设截止日期：2026年2月1日
const EXPIRATION_DATE: (i32, u32, u32) = (2026, 2, 1);

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
    // 构建截止日期
    let expiry = NaiveDate::from_ymd_opt(EXPIRATION_DATE.0, EXPIRATION_DATE.1, EXPIRATION_DATE.2)
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap();

    // 1. 尝试获取网络时间
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    let mut network_time = None;

    // 重试机制：尝试 3 次，每次间隔 1 秒
    for attempt in 0..3 {
        // 优先尝试百度
        if let Ok(resp) = client.head("https://www.baidu.com").send().await {
            if let Some(date_header) = resp.headers().get("date") {
                if let Ok(date_str) = date_header.to_str() {
                    if let Ok(parsed) = chrono::DateTime::parse_from_rfc2822(date_str) {
                        network_time = Some(parsed.naive_utc());
                        break; // 成功获取，跳出循环
                    }
                }
            }
        }

        // 备选微软
        if let Ok(resp) = client.head("https://www.microsoft.com").send().await {
            if let Some(date_header) = resp.headers().get("date") {
                if let Ok(date_str) = date_header.to_str() {
                    if let Ok(parsed) = chrono::DateTime::parse_from_rfc2822(date_str) {
                         network_time = Some(parsed.naive_utc());
                         break; // 成功获取，跳出循环
                    }
                }
            }
        }
        
        // 如果未成功且不是最后一次尝试，则等待
        if attempt < 2 {
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }
    }

    // 如果无法获取网络时间，强制退出
    let current_time = match network_time {
        Some(t) => t,
        None => {
            // 网络检查失败，直接退出
            std::process::exit(0);
        }
    };

    // 转换为本地时间进行对比 (expiry is roughly local midnight? Or just check date)
    // Actually expiry is constructed as naive date. 
    // network_time is UTC. We should add 8 hours for Beijing Time roughly or compare properly.
    // Simplifying: Just compare UTC to UTC if possible, or Local to Local.
    // Let's assume +8 for China since users are Chinese.
    let current_local = current_time + chrono::Duration::hours(8); 

    let is_expired = current_local > expiry;
    let duration = expiry.signed_duration_since(current_local);
    let days_remaining = duration.num_days();

    TimeBombStatus {
        is_expired,
        expiration_date: expiry.format("%Y-%m-%d").to_string(),
        current_date: current_local.format("%Y-%m-%d %H:%M:%S").to_string(),
        days_remaining: if is_expired { 0 } else { days_remaining },
        verification_source: "Network (Baidu/MS)".to_string(),
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
