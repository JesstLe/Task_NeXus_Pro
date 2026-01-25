//! System Tweaks Module
//!
//! 系统优化功能 - 网络、输入延迟、电源等

use crate::{AppError, AppResult};
use serde::{Deserialize, Serialize};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 优化项定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TweakInfo {
    pub id: String,
    pub category: String,
    pub name: String,
    pub desc: String,
    pub command: String,
    pub safe: bool,
}

/// 获取所有可用优化项
pub async fn get_available_tweaks() -> AppResult<serde_json::Value> {
    let tweaks = vec![
        // --- Input Latency ---
        TweakInfo {
            id: "disable_hpet".to_string(),
            category: "Input".to_string(),
            name: "禁用高精度事件计时器 (HPET)".to_string(),
            desc: "降低系统计时器开销，减少微小的输入延迟抖动。".to_string(),
            command: "bcdedit /deletevalue useplatformclock".to_string(),
            safe: true,
        },
        TweakInfo {
            id: "disable_dynamic_tick".to_string(),
            category: "Input".to_string(),
            name: "禁用动态时钟 (Dynamic Tick)".to_string(),
            desc: "防止 CPU 在空闲时挂起时钟中断，提高即时响应性。".to_string(),
            command: "bcdedit /set disabledynamictick yes".to_string(),
            safe: true,
        },
        TweakInfo {
            id: "optimize_keyboard".to_string(),
            category: "Input".to_string(),
            name: "键盘极速响应".to_string(),
            desc: "将键盘重复延迟设为 0，重复率设为 31。".to_string(),
            command: r#"reg add "HKCU\Control Panel\Keyboard" /v KeyboardDelay /t REG_SZ /d "0" /f && reg add "HKCU\Control Panel\Keyboard" /v KeyboardSpeed /t REG_SZ /d "31" /f"#.to_string(),
            safe: true,
        },
        TweakInfo {
            id: "disable_mouse_accel".to_string(),
            category: "Input".to_string(),
            name: "禁用鼠标加速".to_string(),
            desc: "确保系统级\"提高指针精确度\"被禁用。".to_string(),
            command: r#"reg add "HKCU\Control Panel\Mouse" /v MouseSpeed /t REG_SZ /d "0" /f && reg add "HKCU\Control Panel\Mouse" /v MouseThreshold1 /t REG_SZ /d "0" /f && reg add "HKCU\Control Panel\Mouse" /v MouseThreshold2 /t REG_SZ /d "0" /f"#.to_string(),
            safe: true,
        },
        
        // --- Network ---
        TweakInfo {
            id: "tcp_nodelay".to_string(),
            category: "Network".to_string(),
            name: "TCP NoDelay & AckFrequency".to_string(),
            desc: "禁用 Nagle 算法，减少小数据包的发送延迟。".to_string(),
            command: "netsh int tcp set global nagle=disabled && netsh int tcp set global autotuninglevel=normal".to_string(),
            safe: true,
        },
        TweakInfo {
            id: "network_throttling_disable".to_string(),
            category: "Network".to_string(),
            name: "解除 Windows 网络限流".to_string(),
            desc: "修改注册表 NetworkThrottlingIndex 为 FFFFFFFF。".to_string(),
            command: r#"reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 0xffffffff /f"#.to_string(),
            safe: true,
        },
        
        // --- System ---
        TweakInfo {
            id: "disable_game_bar".to_string(),
            category: "System".to_string(),
            name: "禁用 Xbox Game Bar / DVR".to_string(),
            desc: "关闭系统自带的游戏录制和覆盖功能，减少 FPS 波动。".to_string(),
            command: r#"reg add "HKCU\System\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f && reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\GameDVR" /v AllowGameDVR /t REG_DWORD /d 0 /f"#.to_string(),
            safe: true,
        },
        TweakInfo {
            id: "disable_power_throttling".to_string(),
            category: "System".to_string(),
            name: "禁用电源限流 (Power Throttling)".to_string(),
            desc: "防止 Windows 激进地降低后台进程频率。".to_string(),
            command: r#"reg add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling" /v PowerThrottlingOff /t REG_DWORD /d 1 /f"#.to_string(),
            safe: true,
        },
    ];

    Ok(serde_json::to_value(tweaks).unwrap())
}

/// 应用指定的优化项
#[cfg(windows)]
pub async fn apply_tweaks(tweak_ids: &[String]) -> AppResult<serde_json::Value> {
    use std::process::Command;

    let tweak_ids = tweak_ids.to_vec();

    tokio::task::spawn_blocking(move || {
        let all_tweaks = get_tweaks_map();
        let mut success_count = 0;
        let mut errors: Vec<String> = Vec::new();

        for id in &tweak_ids {
            if let Some(tweak) = all_tweaks.get(id.as_str()) {
                tracing::info!("Applying tweak: {} ({})", tweak.name, tweak.command);

                // Split commands by '&' (handle both '&' and '&&')
                let normalized_cmd = tweak.command.replace("&&", "&");
                let sub_commands: Vec<&str> = normalized_cmd.split('&').map(|s| s.trim()).collect();
                let mut tweak_failed = false;
                let mut sub_errors = Vec::new();

                for cmd_str in sub_commands {
                    if cmd_str.is_empty() { continue; }

                    // Parse command and arguments manually to avoid cmd /c issues
                    let parts: Vec<String> = shell_words::split(cmd_str).unwrap_or_else(|_| vec![cmd_str.to_string()]);
                    if parts.is_empty() { continue; }

                    let mut cmd = Command::new(&parts[0]);
                    if parts.len() > 1 {
                        cmd.args(&parts[1..]);
                    }
                    cmd.creation_flags(CREATE_NO_WINDOW);
                    
                    let output = cmd.output();

                    match output {
                        Ok(out) if out.status.success() => {
                            // Success
                        }
                        Ok(out) => {
                            let stderr = crate::decode_output(&out.stderr);
                            let stdout = crate::decode_output(&out.stdout);
                            let error_msg = if !stderr.trim().is_empty() { stderr.trim() } else { stdout.trim() };
                            
                            // Special case: ignore missing values in delete operations
                            if (cmd_str.contains("bcdedit") || cmd_str.contains("reg delete")) && 
                               (error_msg.contains("找不到") || error_msg.contains("not found") || error_msg.is_empty()) {
                                tracing::info!("Ignored expected error for {}: {}", parts[0], error_msg);
                            } else {
                                tweak_failed = true;
                                sub_errors.push(error_msg.to_string());
                            }
                        }
                        Err(e) => {
                            tweak_failed = true;
                            sub_errors.push(e.to_string());
                        }
                    }
                }

                if !tweak_failed {
                    success_count += 1;
                } else {
                    errors.push(format!("{}: {}", tweak.name, sub_errors.join(" | ")));
                }
            }
        }

        Ok(serde_json::json!({
            "success": errors.is_empty(),
            "applied": success_count,
            "errors": errors
        }))
    })
    .await
    .map_err(|e| AppError::SystemError(e.to_string()))?
}

#[cfg(not(windows))]
pub async fn apply_tweaks(_tweak_ids: &[String]) -> AppResult<serde_json::Value> {
    Err(AppError::SystemError("仅支持 Windows".to_string()))
}

/// 获取系统当前定时器分辨率 (单位: ms)
#[cfg(windows)]
pub fn get_timer_resolution() -> AppResult<f64> {
    use windows::Wdk::System::SystemInformation::{NtQueryTimerResolution};

    unsafe {
        let mut min: u32 = 0;
        let mut max: u32 = 0;
        let mut cur: u32 = 0;

        let status = NtQueryTimerResolution(&mut min, &mut max, &mut cur);
        if status.0 == 0 {
            // 返回值单位是 100ns，转换为 ms: cur / 10000.0
            Ok(cur as f64 / 10000.0)
        } else {
            Err(AppError::SystemError(format!("NtQueryTimerResolution failed: 0x{:X}", status.0)))
        }
    }
}

/// 设置系统当前定时器分辨率 (单位: ms)
/// 设置为 0 表示关闭 (恢复默认)
#[cfg(windows)]
pub fn set_timer_resolution(res_ms: f64) -> AppResult<f64> {
    use windows::Wdk::System::SystemInformation::{NtQueryTimerResolution};

    #[link(name = "ntdll")]
    extern "system" {
        fn NtSetTimerResolution(
            RequestedResolution: u32,
            SetResolution: u8,
            ActualResolution: *mut u32,
        ) -> i32;
    }

    unsafe {
        // 先查询范围
        let mut min: u32 = 0;
        let mut max: u32 = 0;
        let mut cur: u32 = 0;
        let _ = NtQueryTimerResolution(&mut min, &mut max, &mut cur);

        // 如果 res_ms 为 0，则尝试恢复默认 (通常是请求 min 或取消请求)
        // 实际上 NtSetTimerResolution 的第二个参数是 Set (boolean)
        let (set, res_val) = if res_ms <= 0.0 {
            (0, min) // 取消请求
        } else {
            // 限制在范围内
            let mut requested = (res_ms * 10000.0) as u32;
            if requested < max { requested = max; }
            if requested > min { requested = min; }
            (1, requested)
        };

        let mut actual: u32 = 0;
        let status = NtSetTimerResolution(res_val, set, &mut actual);
        
        if status == 0 {
            Ok(actual as f64 / 10000.0)
        } else {
            Err(AppError::SystemError(format!("NtSetTimerResolution failed: 0x{:X}", status)))
        }
    }
}

#[cfg(not(windows))]
pub fn get_timer_resolution() -> AppResult<f64> {
     Err(AppError::SystemError("仅支持 Windows".to_string()))
}

#[cfg(not(windows))]
pub fn set_timer_resolution(_res_ms: f64) -> AppResult<f64> {
     Err(AppError::SystemError("仅支持 Windows".to_string()))
}

/// 获取优化项映射
fn get_tweaks_map() -> std::collections::HashMap<&'static str, TweakInfo> {
    let mut map = std::collections::HashMap::new();

    map.insert(
        "disable_hpet",
        TweakInfo {
            id: "disable_hpet".to_string(),
            category: "Input".to_string(),
            name: "禁用 HPET".to_string(),
            desc: "".to_string(),
            command: "bcdedit /deletevalue useplatformclock".to_string(),
            safe: true,
        },
    );

    map.insert(
        "disable_dynamic_tick",
        TweakInfo {
            id: "disable_dynamic_tick".to_string(),
            category: "Input".to_string(),
            name: "禁用动态时钟".to_string(),
            desc: "".to_string(),
            command: "bcdedit /set disabledynamictick yes".to_string(),
            safe: true,
        },
    );

    map.insert("optimize_keyboard", TweakInfo {
        id: "optimize_keyboard".to_string(),
        category: "Input".to_string(),
        name: "键盘优化".to_string(),
        desc: "".to_string(),
        command: r#"reg add "HKCU\Control Panel\Keyboard" /v KeyboardDelay /t REG_SZ /d 0 /f & reg add "HKCU\Control Panel\Keyboard" /v KeyboardSpeed /t REG_SZ /d 31 /f"#.to_string(),
        safe: true,
    });


    map.insert("disable_mouse_accel", TweakInfo {
        id: "disable_mouse_accel".to_string(),
        category: "Input".to_string(),
        name: "禁用鼠标加速".to_string(),
        desc: "".to_string(),
        command: r#"reg add "HKCU\Control Panel\Mouse" /v MouseSpeed /t REG_SZ /d 0 /f & reg add "HKCU\Control Panel\Mouse" /v MouseThreshold1 /t REG_SZ /d 0 /f & reg add "HKCU\Control Panel\Mouse" /v MouseThreshold2 /t REG_SZ /d 0 /f"#.to_string(),
        safe: true,
    });

    map.insert("tcp_nodelay", TweakInfo {
        id: "tcp_nodelay".to_string(),
        category: "Network".to_string(),
        name: "TCP NoDelay".to_string(),
        desc: "".to_string(),
        command: "netsh int tcp set global nagle=disabled & netsh int tcp set global autotuninglevel=normal".to_string(),
        safe: true,
    });

    map.insert("network_throttling_disable", TweakInfo {
        id: "network_throttling_disable".to_string(),
        category: "Network".to_string(),
        name: "网络限流".to_string(),
        desc: "".to_string(),
        command: r#"reg add "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 4294967295 /f"#.to_string(),
        safe: true,
    });

    map.insert("disable_game_bar", TweakInfo {
        id: "disable_game_bar".to_string(),
        category: "System".to_string(),
        name: "禁用 Game Bar".to_string(),
        desc: "".to_string(),
        command: r#"reg add "HKCU\System\GameConfigStore" /v GameDVR_Enabled /t REG_DWORD /d 0 /f & reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\GameDVR" /v AllowGameDVR /t REG_DWORD /d 0 /f"#.to_string(),
        safe: true,
    });

    map.insert("disable_power_throttling", TweakInfo {
        id: "disable_power_throttling".to_string(),
        category: "System".to_string(),
        name: "禁用电源限流".to_string(),
        desc: "".to_string(),
        command: r#"reg add "HKLM\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling" /v PowerThrottlingOff /t REG_DWORD /d 1 /f"#.to_string(),
        safe: true,
    });

    map
}
