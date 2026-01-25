//! UI 模块
//! 
//! 包含应用程序的界面逻辑、托盘图标和辅助工具。

use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use eframe::egui;

pub mod app;
pub mod utils;
pub mod tray;

// 全局标志：是否请求显示窗口
pub static SHOW_WINDOW_FLAG: AtomicBool = AtomicBool::new(false);
pub static EXIT_FLAG: AtomicBool = AtomicBool::new(false);
// 全局 Context 用于从这托盘线程唤醒 UI
pub static GUI_CONTEXT: Mutex<Option<egui::Context>> = Mutex::new(None);
