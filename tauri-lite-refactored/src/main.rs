#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Task NeXus Lite (Refactored) - Entry Point

mod core;
mod ui;

use eframe::egui;
use ui::app::TNLiteApp;
use ui::tray;
use ui::utils;

#[tokio::main]
async fn main() -> eframe::Result<()> {
    // 创建系统托盘
    let _tray = tray::create_tray_icon();
    
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([950.0, 750.0])
            .with_min_inner_size([750.0, 550.0])
            .with_icon(utils::load_icon()),
        ..Default::default()
    };
    
    eframe::run_native(
        "Task NeXus Lite",
        options,
        Box::new(|cc| {
            // 运行时加载中文字体
            let mut fonts = egui::FontDefinitions::default();
            if let Some(font_data) = utils::load_system_font() {
                fonts.font_data.insert("cjk".to_owned(), egui::FontData::from_owned(font_data));
                fonts.families.entry(egui::FontFamily::Proportional).or_default().insert(0, "cjk".to_owned());
                fonts.families.entry(egui::FontFamily::Monospace).or_default().push("cjk".to_owned());
            }
            cc.egui_ctx.set_fonts(fonts);
            
            let mut style = (*cc.egui_ctx.style()).clone();
            style.visuals.widgets.active.bg_fill = egui::Color32::from_rgb(147, 51, 234);
            cc.egui_ctx.set_style(style);
            
            Box::new(TNLiteApp::new())
        }),
    )
}
