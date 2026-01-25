//! Task Nexus - Tauri 入口点
//!
//! 电竞性能优化工具 - Rust 后端

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use task_nexus_lib::{
    config, governor, hardware, hardware_topology, power, thread, tweaks, AppError,
    advanced_affinity,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

mod optimizer;

// ============================================================================
// Tauri Commands - CPU 信息
// ============================================================================

/// 获取 CPU 信息
#[tauri::command]
async fn get_cpu_info() -> Result<serde_json::Value, String> {
    hardware::get_cpu_info()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 获取每个核心的实时负载
#[tauri::command]
async fn get_cpu_loads() -> Result<Vec<f32>, String> {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_cpu_all();
    Ok(sys.cpus().iter().map(|c| c.cpu_usage()).collect())
}

/// 获取 CPU 拓扑
#[tauri::command]
async fn get_cpu_topology() -> Result<Vec<hardware_topology::LogicalCore>, String> {
    hardware_topology::get_cpu_topology().map_err(|e| e.to_string())
}

// ============================================================================
// Tauri Commands - Icon
// ============================================================================

/// 获取文件图标 (Base64)
#[tauri::command]
async fn get_process_icon(path: String) -> Result<String, String> {
    task_nexus_lib::icons::get_process_icon(path)
        .await
        .map_err(|e| e)
}

// ============================================================================
// Tauri Commands - 自启动管理
// ============================================================================

#[tauri::command]
fn set_admin_autostart(enable: bool) -> Result<(), String> {
    use std::process::Command;
    use std::os::windows::process::CommandExt; // 必须引入这个 trait 才能用 creation_flags

    // 获取当前 exe 路径
    let app_path = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    let task_name = "TaskNexusAutoStart";
    
    // Windows API 常量：CREATE_NO_WINDOW
    // 这是让黑框完全消失的魔法数字
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let script = if enable {
        // 开启自启：创建最高权限任务
        // 注意：-WindowStyle Hidden 是给 PowerShell 内部的指令，双重保险
        format!(
            r#"
            $ErrorActionPreference = 'SilentlyContinue';
            Unregister-ScheduledTask -TaskName "{name}" -Confirm:$false;
            $Action = New-ScheduledTaskAction -Execute "{path}";
            $Trigger = New-ScheduledTaskTrigger -AtLogon;
            $Principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\INTERACTIVE" -LogonType Interactive -RunLevel Highest;
            Register-ScheduledTask -TaskName "{name}" -Action $Action -Trigger $Trigger -Principal $Principal -Force;
            "#,
            name = task_name,
            path = app_path
        )
    } else {
        // 关闭自启：静默删除任务
        format!(
            r#"Unregister-ScheduledTask -TaskName "{}" -Confirm:$false -ErrorAction SilentlyContinue"#, 
            task_name
        )
    };

    // 执行命令
    let output = Command::new("powershell")
        .args(&[
            "-NoProfile",        // 不加载用户配置文件（加快启动速度，减少闪烁风险）
            "-NonInteractive",   // 不允许交互
            "-WindowStyle", "Hidden", // 告诉 PowerShell 自身要隐藏
            "-Command", &script
        ])
        .creation_flags(CREATE_NO_WINDOW) // 👈 核心：告诉 Windows 内核不要创建窗口
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        // 只有出错时才把错误转成字符串返回，方便调试
        // 正常情况下这里什么都不会发生
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Task execution failed: {}", err_msg));
    }

    Ok(())
}

// ============================================================================
// Tauri Commands - 进程管理
// ============================================================================

/// 获取进程列表
#[tauri::command]
async fn get_processes() -> Result<Vec<task_nexus_lib::ProcessInfo>, String> {
    governor::get_process_snapshot()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 设置进程亲和性
#[tauri::command]
async fn set_affinity(
    pid: u32,
    core_mask: String,
    mode: String,
    primary_core: Option<u32>,
) -> Result<serde_json::Value, String> {
    let mask = core_mask.parse::<u64>().map_err(|_| "无效的核心掩码")?;
    governor::set_affinity(pid, mask, &mode, primary_core)
        .await
        .map(|_| serde_json::json!({"success": true}))
        .map_err(|e: AppError| e.to_string())
}

/// 设置进程亲和性 (Smart Selector)
#[tauri::command]
async fn set_process_affinity(
    pid: u32,
    affinity_mask: String,
) -> Result<serde_json::Value, String> {
    governor::set_process_affinity(pid, affinity_mask)
        .await
        .map(|_| serde_json::json!({"success": true}))
        .map_err(|e: AppError| e.to_string())
}

/// 批量手动设置进程亲和性
#[tauri::command]
async fn batch_apply_affinity(
    pids: Vec<u32>,
    mask_hex: String,
    lock_heavy_thread: bool,
) -> Result<serde_json::Value, String> {
    let mask = u64::from_str_radix(&mask_hex, 16).map_err(|_| "无效的十六进制掩码")?;
    if mask == 0 {
        return Err("掩码不能为空 (进程至少需要一个核心)".into());
    }

    // 找到掩码中的第一个核心，用于线程绑定
    let mut target_core = 0;
    for i in 0..64 {
        if (mask & (1 << i)) != 0 {
            target_core = i;
            break;
        }
    }

    let mut success_count = 0;
    for pid in pids {
        // 1. 设置进程亲和性
        if governor::set_process_affinity(pid, mask_hex.clone()).await.is_ok() {
            success_count += 1;
            
            // 2. 如果开启了主线程锁定
            if lock_heavy_thread {
                let _ = thread::smart_bind_thread(pid, target_core as u32).await;
            }
        }
    }

    Ok(serde_json::json!({
        "success": true,
        "count": success_count
    }))
}

/// 批量还原进程至默认状态 (全核心掩码 + 正常优先级)
#[tauri::command]
async fn batch_reset_to_default(pids: Vec<u32>) -> Result<String, String> {
    // 1. 获取 CPU 拓扑以计算全掩码
    let topo = hardware_topology::get_cpu_topology().map_err(|e| e.to_string())?;
    let mut all_cores_mask: u64 = 0;
    for core in topo {
        all_cores_mask |= 1u64 << core.id;
    }

    let mut success_count = 0;
    for pid in pids {
        // A. 重置进程亲和性 (全核心)
        if let Ok(_) = governor::set_process_affinity(pid, format!("{:x}", all_cores_mask)).await {
            // B. 重置线程亲和性 (释放可能的手动锁定)
            if let Ok(threads) = thread::get_process_threads(pid) {
                for t in threads {
                    let _ = thread::set_thread_affinity(t.tid, all_cores_mask);
                }
            }

            // C. 重置优先级为 Normal
            let _ = governor::set_priority(pid, task_nexus_lib::PriorityLevel::Normal).await;
            
            success_count += 1;
        }
    }

    Ok(format!("已将 {} 个进程还原为默认状态", success_count))
}

/// 设置进程优先级
#[tauri::command]
async fn set_process_priority(pid: u32, priority: String) -> Result<bool, String> {
    let level = task_nexus_lib::PriorityLevel::from_str(&priority).ok_or("无效的优先级")?;
    governor::set_priority(pid, level)
        .await
        .map(|_| true)
        .map_err(|e: AppError| e.to_string())
}

/// 清理进程内存
#[tauri::command]
async fn trim_process_memory(pid: u32) -> Result<u64, String> {
    governor::trim_memory(pid)
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 结束进程
#[tauri::command]
async fn terminate_process(pid: u32) -> Result<bool, String> {
    governor::kill_process(pid)
        .await
        .map(|_| true)
        .map_err(|e: AppError| e.to_string())
}

/// 打开文件所在位置
#[tauri::command]
async fn open_file_location(path: String) -> Result<bool, String> {
    #[cfg(windows)]
    {
        // Use explorer.exe /select,"path" to open folder and highlight the file
        // The path and /select must be combined as a single argument
        let select_arg = format!("/select,\"{}\"", path);
        let output = std::process::Command::new("explorer.exe")
            .raw_arg(&select_arg)
            .spawn();

        match output {
            Ok(_) => Ok(true),
            Err(e) => Err(format!("无法打开文件位置: {}", e)),
        }
    }
    #[cfg(not(windows))]
    {
        Err("仅支持 Windows 平台".to_string())
    }
}

// ============================================================================
// Tauri Commands - 线程管理
// ============================================================================

/// 获取进程的所有线程
#[tauri::command]
fn get_process_threads(pid: u32) -> Result<Vec<thread::ThreadInfo>, String> {
    thread::get_process_threads(pid).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_process_cpu_sets(pid: u32, core_ids: Vec<u32>) -> Result<(), String> {
    task_nexus_lib::cpu_sets::set_process_cpu_sets(pid, core_ids)
}

#[tauri::command]
fn get_process_cpu_sets(pid: u32) -> Result<Vec<u32>, String> {
    task_nexus_lib::cpu_sets::get_process_cpu_sets(pid)
}

/// 设置线程亲和性
#[tauri::command]
async fn set_thread_affinity(tid: u32, core_mask: u64) -> Result<bool, String> {
    thread::set_thread_affinity(tid, core_mask)
        .map(|_| true)
        .map_err(|e: AppError| e.to_string())
}

/// 自动绑定最重线程到指定核心
#[tauri::command]
async fn bind_heaviest_thread(pid: u32, target_core: u32) -> Result<u32, String> {
    thread::smart_bind_thread(pid, target_core)
        .await
        .map_err(|e: AppError| e.to_string())
}

// ============================================================================
// Tauri Commands - 内存管理
// ============================================================================

/// 获取内存信息
#[tauri::command]
async fn get_memory_info() -> Result<task_nexus_lib::MemoryInfo, String> {
    hardware::get_memory_info()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 清理系统内存
#[tauri::command]
async fn clear_memory() -> Result<serde_json::Value, String> {
    governor::clear_system_memory()
        .await
        .map_err(|e: AppError| e.to_string())
}

// ============================================================================
// Tauri Commands - 电源管理
// ============================================================================

/// 获取当前电源计划
#[tauri::command]
async fn get_power_plan() -> Result<serde_json::Value, String> {
    power::get_current_power_plan()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 设置电源计划
#[tauri::command]
async fn set_power_plan(plan: String) -> Result<serde_json::Value, String> {
    power::set_power_plan(&plan)
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 列出所有电源计划
#[tauri::command]
async fn list_power_plans() -> Result<serde_json::Value, String> {
    power::list_power_plans()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 导入电源计划
#[tauri::command]
async fn import_power_plan(path: String) -> Result<serde_json::Value, String> {
    power::import_power_plan(path)
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 打开电源面板
#[tauri::command]
async fn open_power_settings() -> Result<bool, String> {
    power::open_power_settings()
        .map_err(|e: AppError| e.to_string())
}

/// 删除电源计划
#[tauri::command]
async fn delete_power_plan(guid: String) -> Result<serde_json::Value, String> {
    power::delete_power_plan(guid)
        .await
        .map_err(|e: AppError| e.to_string())
}

// ============================================================================
// Tauri Commands - 系统优化
// ============================================================================

/// 获取可用优化项
#[tauri::command]
async fn get_tweaks() -> Result<serde_json::Value, String> {
    tweaks::get_available_tweaks()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 获取当前定时器分辨率
#[tauri::command]
async fn get_timer_resolution() -> Result<f64, String> {
    tweaks::get_timer_resolution()
        .map_err(|e: AppError| e.to_string())
}

/// 设置系统定时器精度
#[tauri::command]
async fn set_timer_resolution(res_ms: f64) -> Result<f64, String> {
    tweaks::set_timer_resolution(res_ms)
        .map_err(|e: AppError| e.to_string())
}

/// 应用优化项
#[tauri::command]
async fn apply_tweaks(tweak_ids: Vec<String>) -> Result<serde_json::Value, String> {
    tweaks::apply_tweaks(&tweak_ids)
        .await
        .map_err(|e: AppError| e.to_string())
}

// ============================================================================
// Tauri Commands - 配置管理
// ============================================================================

/// 获取应用设置
#[tauri::command]
async fn get_settings() -> Result<task_nexus_lib::AppConfig, String> {
    config::get_config()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 设置单项配置
#[tauri::command]
async fn set_setting(key: String, value: serde_json::Value) -> Result<serde_json::Value, String> {
    config::set_config_value(&key, value)
        .await
        .map(|_| serde_json::json!({"success": true}))
        .map_err(|e: AppError| e.to_string())
}

/// 添加进程策略
#[tauri::command]
async fn add_profile(profile: task_nexus_lib::ProcessProfile) -> Result<serde_json::Value, String> {
    config::add_profile(profile)
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 删除进程策略
#[tauri::command]
async fn remove_profile(name: String) -> Result<serde_json::Value, String> {
    config::remove_profile(&name)
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 获取进程策略列表
#[tauri::command]
async fn get_profiles() -> Result<Vec<task_nexus_lib::ProcessProfile>, String> {
    config::get_profiles()
        .await
        .map_err(|e: AppError| e.to_string())
}

/// 导入配置
#[tauri::command]
async fn import_config_file(path: String) -> Result<serde_json::Value, String> {
    config::import_config_from_path(std::path::PathBuf::from(path))
        .map(|_| serde_json::json!({"success": true}))
        .map_err(|e: AppError| e.to_string())
}

/// 导出配置
#[tauri::command]
async fn export_config_file(path: String) -> Result<serde_json::Value, String> {
    config::export_config_to_path(std::path::PathBuf::from(path))
        .map(|_| serde_json::json!({"success": true}))
        .map_err(|e: AppError| e.to_string())
}

// ============================================================================
// Tauri Commands - 窗口控制
// ============================================================================

/// 最小化窗口
#[tauri::command]
async fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

/// 切换最大化
#[tauri::command]
async fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

/// 关闭窗口
#[tauri::command]
async fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

// ============================================================================
// Tauri Commands - CPU 监控
// ============================================================================

/// 启动 CPU 监控
#[tauri::command]
async fn start_cpu_monitor(app: tauri::AppHandle) -> Result<bool, String> {
    hardware::start_cpu_monitor(app).await;
    Ok(true)
}

/// 停止 CPU 监控
#[tauri::command]
async fn stop_cpu_monitor() -> Result<bool, String> {
    hardware::stop_cpu_monitor().await;
    Ok(true)
}

/// 获取当前机器码
#[tauri::command]
async fn get_machine_code() -> Result<String, String> {
    Ok(task_nexus_lib::security::get_machine_code())
}

/// 激活软件
#[tauri::command]
async fn activate_license(key: String) -> Result<bool, String> {
    config::set_config_value("license", serde_json::Value::String(key.clone()))
        .await
        .map_err(|e| e.to_string())?;
    
    let is_valid = task_nexus_lib::security::verify_license(&key);
    Ok(is_valid)
}

#[tauri::command]
async fn save_full_config(config: task_nexus_lib::AppConfig) -> Result<(), String> {
    config::update_full_config(config)
        .await
        .map_err(|e| e.to_string())
}

/// 获取许可证状态
#[tauri::command]
async fn get_license_status() -> Result<serde_json::Value, String> {
    let activated = task_nexus_lib::security::check_activation_status().await;
    let machine_code = task_nexus_lib::security::get_machine_code();
    Ok(serde_json::json!({
        "activated": activated,
        "machineCode": machine_code
    }))
}

/// 检查内测版是否过期
#[tauri::command]
async fn check_expiration() -> Result<task_nexus_lib::security::TimeBombStatus, String> {
    Ok(task_nexus_lib::security::check_expiration().await)
}

// ============================================================================
// 应用入口
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ------------------------------------------------------------------------
    // Automatic Error Logging Setup
    // ------------------------------------------------------------------------
    
    // 1. Configure File Appender (Rolling daily)
    // Use LocalAppData/Task Nexus/logs for reliability
    let log_dir = dirs::data_local_dir()
        .map(|p| p.join("Task Nexus").join("logs"))
        .unwrap_or_else(|| std::path::PathBuf::from("logs"));

    // Ensure directory exists
    let _ = std::fs::create_dir_all(&log_dir);

    let file_appender = tracing_appender::rolling::daily(&log_dir, "task-nexus.log");

    // 2. Init Tracing (Stdout + File)
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer().with_writer(std::io::stdout))
        .with(tracing_subscriber::fmt::layer().with_writer(file_appender).with_ansi(false)) // File output
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
        ))
        .init();

    // 3. Set Custom Panic Hook to Log Crashes
    std::panic::set_hook(Box::new(|info| {
        let backtrace = std::backtrace::Backtrace::capture();
        tracing::error!("CRITICAL PANIC: {:?}\nBacktrace:\n{:?}", info, backtrace);
        eprintln!("Application Panicked: {:?}", info);
    }));

    tracing::info!("Task Nexus starting (Logging to {:?})...", log_dir);

    let monitor = std::sync::Arc::new(task_nexus_lib::monitor::ProcessMonitor::new());
    let monitor_clone = monitor.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .map(|w| {
                    let _ = w.show();
                    let _ = w.set_focus();
                });
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            // 初始化配置
            let app_handle = app.handle();
            if let Err(e) = config::init_config(app_handle) {
                tracing::error!("Failed to init config: {}", e);
            }

            // Enable SeDebugPrivilege for maximum optimization capability
            let _ = governor::enable_debug_privilege();

            // Start Monitor
            monitor_clone.start(app.handle().clone());
            
            // Hardware Monitor is now integrated into monitor_clone

            // 确保窗口在初始化后可见
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }

            // 设置托盘菜单
            let show_i = MenuItem::with_id(app, "show", "显示主界面", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "彻底退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 读取配置
                let should_minimize = if let Ok(cfg) = config::get_config_sync() {
                    cfg.close_to_tray
                } else {
                    false
                };

                if should_minimize {
                    // 阻止默认关闭
                    api.prevent_close();
                    // 隐藏窗口到托盘
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // CPU 信息
            get_cpu_info,
            get_cpu_loads,
            get_cpu_topology,
            get_process_icon,
            // 进程管理
            get_processes,
            set_affinity,
            set_process_affinity,
            set_process_cpu_sets,
            get_process_cpu_sets,
            set_process_priority,
            trim_process_memory,
            terminate_process,
            open_file_location,
            // 线程管理
            get_process_threads,
            set_thread_affinity,
            bind_heaviest_thread,
            // 内存管理
            get_memory_info,
            clear_memory,
            // 电源管理
            get_power_plan,
            set_power_plan,
            list_power_plans,
            import_power_plan,
            open_power_settings,
            delete_power_plan,
            // 系统优化
            get_tweaks,
            apply_tweaks,
            get_timer_resolution,
            set_timer_resolution,
            // 配置管理
            get_settings,
            set_setting,
            add_profile,
            remove_profile,
            get_profiles,
            batch_apply_affinity,
            batch_reset_to_default,
            advanced_affinity::apply_cascading_affinity,
            import_config_file,
            export_config_file,
            // 窗口控制
            window_minimize,
            window_toggle_maximize,
            window_close,
            // CPU 监控
            start_cpu_monitor,
            stop_cpu_monitor,
            get_machine_code,
            activate_license,
            get_license_status,
            save_full_config,
            check_expiration,
            set_admin_autostart,
            // Optimizer Commands
            optimizer::optimize_latency,
            optimizer::optimize_network,
            optimizer::optimize_power_gpu,
            // 注册表操作
            task_nexus_lib::registry::backup_registry,
            task_nexus_lib::registry::import_registry,
            task_nexus_lib::registry::restore_registry,
            task_nexus_lib::registry::scan_registry,
            task_nexus_lib::registry::clean_registry,
            task_nexus_lib::registry::list_registry_backups,
            task_nexus_lib::registry::create_full_backup,
            task_nexus_lib::registry::restore_backup_by_name,
            task_nexus_lib::registry::delete_backup_by_name,
            task_nexus_lib::registry::check_admin,
            task_nexus_lib::registry::open_backup_folder,
            task_nexus_lib::registry::get_backup_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}

