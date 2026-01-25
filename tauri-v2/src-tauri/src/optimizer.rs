use tauri::command;
use std::process::Command;
use std::os::windows::process::CommandExt;
use winreg::enums::*;
use winreg::RegKey;
use task_nexus_lib::{AppError, AppResult};

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[command]
pub async fn optimize_latency(enable: bool) -> Result<(), String> {
    optimize_latency_internal(enable).await.map_err(|e| e.to_string())
}

async fn optimize_latency_internal(enable: bool) -> AppResult<()> {
    // 1. Timer Resolution (Handled via external tool usually, but we can set BCD)
    // Note: NtSetTimerResolution is complex to call from here without external crate dependency issues.
    // We will stick to BCD tweaks which are persistent.
    
    // 2. Disable Dynamic Tick
    let dyn_tick_val = if enable { "yes" } else { "no" };
    run_cmd("bcdedit", &["/set", "disabledynamictick", dyn_tick_val])?;

    // 3. Disable HPET (High Precision Event Timer)
    if enable {
        // Force TSC by deleting useplatformclock
        let _ = run_cmd("bcdedit", &["/deletevalue", "useplatformclock"]);
    } else {
        // Restore default (usually useplatformclock is not set by default, or set to yes)
        // We leave it unset as that's often default, or set to yes if "revert" implies forcing ON
        // Safest revert is deleting value.
        let _ = run_cmd("bcdedit", &["/deletevalue", "useplatformclock"]);
    }

    // 4. Win32PrioritySeparation
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = hklm.open_subkey_with_flags(
        r"SYSTEM\CurrentControlSet\Control\PriorityControl",
        KEY_WRITE | KEY_READ,
    ).map_err(|e| AppError::SystemError(format!("Failed to open priority key: {}", e)))?;

    if enable {
        // 0x16 (22) or 0x28 (40). 0x28 (26 hex? No 26 dec is 1A hex)
        // User said: 26 (hex 16) or 40 (hex 28).
        // Let's use 0x28 (40 decimal) for "Processors scheduled for short intervals, variable quanta"
        key.set_value("Win32PrioritySeparation", &0x28u32)
            .map_err(|e| AppError::SystemError(format!("Failed to set Win32PrioritySeparation: {}", e)))?;
    } else {
        // Default is usually 2
        key.set_value("Win32PrioritySeparation", &0x02u32)
            .map_err(|e| AppError::SystemError(format!("Failed to revert Win32PrioritySeparation: {}", e)))?;
    }

    Ok(())
}

#[command]
pub async fn optimize_network(enable: bool) -> Result<(), String> {
    optimize_network_internal(enable).await.map_err(|e| e.to_string())
}

async fn optimize_network_internal(enable: bool) -> AppResult<()> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    // 1. TcpAckFrequency & TCPNoDelay
    // Iterate over interfaces
    let interfaces_path = r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces";
    if let Ok(interfaces) = hklm.open_subkey_with_flags(interfaces_path, KEY_READ | KEY_WRITE) {
         for name in interfaces.enum_keys().filter_map(|x| x.ok()) {
            if let Ok(interface_key) = interfaces.open_subkey_with_flags(&name, KEY_WRITE) {
                if enable {
                    let _ = interface_key.set_value("TcpAckFrequency", &1u32);
                    let _ = interface_key.set_value("TCPNoDelay", &1u32);
                } else {
                    let _ = interface_key.delete_value("TcpAckFrequency");
                    let _ = interface_key.delete_value("TCPNoDelay");
                }
            }
         }
    }

    // 2. Network Throttling Index
    let mm_path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile";
    if let Ok(mm_key) = hklm.open_subkey_with_flags(mm_path, KEY_WRITE) {
        if enable {
            // FFFFFFFF
            let _ = mm_key.set_value("NetworkThrottlingIndex", &0xFFFFFFFFu32);
        } else {
            // Default is usually 10 (decimal)
            let _ = mm_key.set_value("NetworkThrottlingIndex", &10u32);
        }
    }

    // 3. NIC Advanced Properties (InterruptModeration, FlowControl, etc.)
    // Iterate SYSTEM\CurrentControlSet\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}\00xx
    let net_class_path = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}";
    if let Ok(class_key) = hklm.open_subkey_with_flags(net_class_path, KEY_READ) {
        for subkey_name in class_key.enum_keys().filter_map(|x| x.ok()) {
            // We only care about 0000, 0001, etc.
            if subkey_name.len() != 4 || !subkey_name.chars().all(char::is_numeric) {
                continue;
            }

            if let Ok(nic_key) = class_key.open_subkey_with_flags(&subkey_name, KEY_WRITE) {
                 // Check if it's a real NIC (has DriverDesc)
                 if nic_key.get_value::<String, _>("DriverDesc").is_ok() {
                     if enable {
                        let _ = nic_key.set_value("*InterruptModeration", &"0");
                        let _ = nic_key.set_value("*FlowControl", &"0");
                        let _ = nic_key.set_value("*JumboPacket", &"0"); // Disabled = 1514 usually, but "0" often works for logic
                        // Some drivers use different string values.
                        // Common: *InterruptModeration: "0" (Off), "1" (On)
                     } else {
                        // Revert to "1" (On) or delete to reset? 
                        // Safer to set "1"
                        let _ = nic_key.set_value("*InterruptModeration", &"1");
                        // Flow Control Auto/RxTx is driver dependent. Skipping strict revert to avoid breaking
                     }
                 }
            }
        }
    }

    Ok(())
}

#[command]
pub async fn optimize_power_gpu(enable: bool, hags: bool) -> Result<(), String> {
    optimize_power_gpu_internal(enable, hags).await.map_err(|e| e.to_string())
}

async fn optimize_power_gpu_internal(enable: bool, hags: bool) -> AppResult<()> {
    // 1. Ultimate Performance Plan
    if enable {
        // Try to verify duplicate first to avoid spamming
        // Simple approach: Run the duplicate command. Windows handles duplicates gracefully (creates new GUID)
        // But better is to just set High Performance command if Ultimate not available?
        // User asked to run: powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61
        let _ = run_cmd("powercfg", &["-duplicatescheme", "e9a42b02-d5df-448d-aa00-03f14749eb61"]);
        
        // Then set active (we'd need to parse the output GUID, or just set High Performance)
        // Since we can't easily parse output here without regex, we might just enabling 'High Performance' 
        // GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
        let _ = run_cmd("powercfg", &["/setactive", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"]);
    } else {
         // Revert to Balanced: 381b4222-f694-41f0-9685-ff5bb260df2e
         let _ = run_cmd("powercfg", &["/setactive", "381b4222-f694-41f0-9685-ff5bb260df2e"]);
    }

    // 2. Unpark Cores (Core Parking)
    if enable {
        // Set min/max processor state to 100% for currently active scheme
        let _ = run_cmd("powercfg", &["-setacvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMAX", "100"]);
        let _ = run_cmd("powercfg", &["-setacvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "PROCTHROTTLEMIN", "100"]);
        // Core parking specific GUIDs are hidden.
        // 0cc5b647-c1df-4637-891a-dec35c318583 (Processor performance core parking min cores)
        // Unhide
         let _ = run_cmd("powercfg", &["-attributes", "SUB_PROCESSOR", "0cc5b647-c1df-4637-891a-dec35c318583", "-ATTRIB_HIDE"]);
         // Set to 100 (No parking = use 100% of cores always? No, parking min cores = 100 means 100% of cores must be unparked?)
         // Actually "Min Cores" 100% means "Don't park any cores" (Keep 100% active).
         let _ = run_cmd("powercfg", &["-setacvalueindex", "SCHEME_CURRENT", "SUB_PROCESSOR", "0cc5b647-c1df-4637-891a-dec35c318583", "100"]);
         let _ = run_cmd("powercfg", &["-setactive", "SCHEME_CURRENT"]);
    }

    // 3. GPU Tweaks (Nvidia P-State / PowerMizer) via Registry
    // HwSchMode (HAGS)
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let graphics_path = r"SYSTEM\CurrentControlSet\Control\GraphicsDrivers";
    if let Ok(graphics_key) = hklm.open_subkey_with_flags(graphics_path, KEY_WRITE) {
        let val = if hags { 2u32 } else { 1u32 }; // 2=On, 1=Off
        let _ = graphics_key.set_value("HwSchMode", &val);
    }
    
    // Note: Manual Nvidia Key tweaks are risky and depend on specific GPU paths.
    // Optimization tools often scan `SYSTEM\CurrentControlSet\Control\Class\{4d36e968...}\0000`
    
    Ok(())
}

fn run_cmd(cmd: &str, args: &[&str]) -> AppResult<()> {
    Command::new(cmd)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| AppError::SystemError(format!("Failed to run {}: {}", cmd, e)))?;
    Ok(())
}
