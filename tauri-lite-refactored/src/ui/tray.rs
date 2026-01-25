//! 系统托盘逻辑

use tray_icon::{TrayIconBuilder, menu::{Menu, MenuItem, PredefinedMenuItem}};
use tray_icon::Icon;
use std::sync::atomic::Ordering;
use super::{SHOW_WINDOW_FLAG, EXIT_FLAG, GUI_CONTEXT};

#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{FindWindowA, ShowWindow, SetForegroundWindow, SW_RESTORE, SW_SHOW};
#[cfg(windows)]
use windows::core::PCSTR;

/// 创建系统托盘图标
pub fn create_tray_icon() -> Option<tray_icon::TrayIcon> {
    // 加载图标
    let icon_bytes = include_bytes!("../../icon.ico");
    let icon = if let Ok(icon_dir) = ico::IconDir::read(std::io::Cursor::new(icon_bytes)) {
        if let Some(entry) = icon_dir.entries().iter().max_by_key(|e| e.width()) {
            if let Ok(image) = entry.decode() {
                Icon::from_rgba(image.rgba_data().to_vec(), image.width(), image.height()).ok()
            } else { None }
        } else { None }
    } else { None };
    
    // 创建托盘菜单
    let menu = Menu::new();
    let show_item = MenuItem::new("显示窗口", true, None);
    let quit_item = MenuItem::new("退出程序", true, None);
    let _ = menu.append(&show_item);
    let _ = menu.append(&PredefinedMenuItem::separator());
    let _ = menu.append(&quit_item);
    
    // 监听菜单事件
    let show_id = show_item.id().clone();
    let quit_id = quit_item.id().clone();
    
    std::thread::spawn(move || {
        let receiver = tray_icon::menu::MenuEvent::receiver();
        loop {
            if let Ok(event) = receiver.recv() {
                if event.id == show_id {
                    SHOW_WINDOW_FLAG.store(true, Ordering::SeqCst);
                    if let Ok(ctx) = GUI_CONTEXT.lock() {
                        if let Some(ctx) = ctx.as_ref() { ctx.request_repaint(); }
                    }
                } else if event.id == quit_id {
                    EXIT_FLAG.store(true, Ordering::SeqCst);
                    if let Ok(ctx) = GUI_CONTEXT.lock() {
                        if let Some(ctx) = ctx.as_ref() { ctx.request_repaint(); }
                    }
                    std::process::exit(0);
                }
            }
        }
    });
    
    // 监听托盘图标点击 (只响应左键点击和双击)
    std::thread::spawn(|| {
        use tray_icon::{TrayIconEvent, MouseButton};
        let receiver = TrayIconEvent::receiver();
        loop {
            if let Ok(event) = receiver.recv() {
                // 仅响应左键点击，过滤掉悬停(Enter/Leave/Move)等事件
                let should_show = matches!(
                    event,
                    TrayIconEvent::Click { button: MouseButton::Left, .. }
                );

                if should_show {
                    SHOW_WINDOW_FLAG.store(true, Ordering::SeqCst);
                    if let Ok(ctx) = GUI_CONTEXT.lock() {
                        if let Some(ctx) = ctx.as_ref() { ctx.request_repaint(); }
                    }
                    
                    #[cfg(windows)]
                    unsafe {
                        let window_name = "Task NeXus Lite\0";
                        if let Ok(hwnd) = FindWindowA(None, PCSTR::from_raw(window_name.as_ptr())) {
                            if !hwnd.0.is_null() {
                                let _ = ShowWindow(hwnd, SW_SHOW);
                                let _ = ShowWindow(hwnd, SW_RESTORE);
                                let _ = SetForegroundWindow(hwnd);
                            }
                        }
                    }
                }
            }
        }
    });
    
    let builder = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip("Task NeXus Lite");
    
    let builder = if let Some(icon) = icon {
        builder.with_icon(icon)
    } else {
        builder
    };
    
    builder.build().ok()
}
