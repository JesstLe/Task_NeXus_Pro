//! UI 辅助工具

use eframe::egui;
use crate::core::{CoreType, PendingProfile, PriorityLevel, CpuTopology};

/// 获取核心类型的显示颜色
pub fn get_core_type_color(core_type: &CoreType) -> egui::Color32 {
    match core_type {
        CoreType::VCache => egui::Color32::from_rgb(255, 100, 100),
        CoreType::Performance => egui::Color32::from_rgb(100, 200, 255),
        CoreType::Efficiency => egui::Color32::from_rgb(100, 255, 100),
        CoreType::Unknown => egui::Color32::WHITE,
    }
}

/// 获取核心类型的显示字符
pub fn get_core_type_char(core_type: &CoreType) -> &'static str {
    match core_type {
        CoreType::VCache => "V",
        CoreType::Performance => "P",
        CoreType::Efficiency => "E",
        CoreType::Unknown => "",
    }
}

/// 辅助函数：根据核心 ID 获取类型后缀字符
fn get_suffix(core_id: u32, topology: Option<&CpuTopology>) -> &'static str {
    if let Some(top) = topology {
        if let Some(core) = top.cores.iter().find(|c| c.id == core_id as usize) {
            return get_core_type_char(&core.core_type);
        }
    }
    ""
}

/// 获取策略摘要文本
pub fn get_profile_summary(profile: &PendingProfile, topology: Option<&CpuTopology>) -> String {
    if profile.is_empty() {
        return "默认".to_string();
    }
    let mut parts = Vec::new();
    if let Some(mask) = profile.affinity_mask {
        // 生成选定核心编号列表
        let cores: Vec<u32> = (0..64).filter(|i| (mask >> i) & 1 == 1).collect();
        if cores.len() <= 4 {
            let core_strs: Vec<String> = cores.iter()
                .map(|&c| format!("{}{}", c, get_suffix(c, topology)))
                .collect();
            parts.push(format!("核心:{}", core_strs.join(",")));
        } else if !cores.is_empty() {
            // 尝试检测连续范围
            let min = *cores.first().unwrap();
            let max = *cores.last().unwrap();
            if max - min + 1 == cores.len() as u32 {
                parts.push(format!("核心:{}-{}", min, max));
            } else {
                parts.push(format!("{}核", cores.len()));
            }
        }
    }
    if let Some(level) = &profile.priority {
        parts.push(format!("{}", level.as_str_cn()));
    }
    if let Some(core) = profile.thread_bind_core {
        parts.push(format!("绑定:{}{}", core, get_suffix(core, topology)));
    }
    if let Some(core) = profile.ideal_core {
        parts.push(format!("理想:{}{}", core, get_suffix(core, topology)));
    }
    parts.join(" | ")
}

/// 加载应用图标
pub fn load_icon() -> egui::IconData {
    let icon_bytes = include_bytes!("../../icon.ico");
    if let Ok(icon_dir) = ico::IconDir::read(std::io::Cursor::new(icon_bytes)) {
        if let Some(entry) = icon_dir.entries().iter().max_by_key(|e| e.width()) {
            if let Ok(image) = entry.decode() {
                return egui::IconData { rgba: image.rgba_data().to_vec(), width: image.width(), height: image.height() };
            }
        }
    }
    egui::IconData::default()
}

/// 运行时加载系统中文字体
pub fn load_system_font() -> Option<Vec<u8>> {
    let font_paths = [
        "C:\\Windows\\Fonts\\msyh.ttc",
        "C:\\Windows\\Fonts\\simhei.ttf",
        "C:\\Windows\\Fonts\\simsun.ttc",
        "C:\\Windows\\Fonts\\msyhbd.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/System/Library/Fonts/PingFang.ttc",
    ];
    
    for path in &font_paths {
        if let Ok(data) = std::fs::read(path) {
            return Some(data);
        }
    }
    None
}
