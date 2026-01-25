//! Task NeXus Lite - 原生高性能 CPU 调度工具

mod core;

use eframe::egui;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use sysinfo::System;
use core::{governor, thread, topology, PriorityLevel, CpuTopology, AppConfig, set_auto_start, PendingProfile, CoreType, LogicalCore};

// 系统托盘相关
use tray_icon::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState, menu::{Menu, MenuItem, PredefinedMenuItem}};
use tray_icon::Icon;

#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{FindWindowA, ShowWindow, SetForegroundWindow, SW_RESTORE, SW_SHOW};
#[cfg(windows)]
use windows::core::PCSTR;

// 全局标志：是否请求显示窗口
static SHOW_WINDOW_FLAG: AtomicBool = AtomicBool::new(false);
static EXIT_FLAG: AtomicBool = AtomicBool::new(false);
// 全局 Context 用于从这托盘线程唤醒 UI
static GUI_CONTEXT: Mutex<Option<egui::Context>> = Mutex::new(None);

#[tokio::main]
async fn main() -> eframe::Result<()> {
    // 创建系统托盘
    let _tray = create_tray_icon();
    
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([950.0, 750.0])
            .with_min_inner_size([750.0, 550.0])
            .with_icon(load_icon()),
        ..Default::default()
    };
    eframe::run_native(
        "Task NeXus Lite",
        options,
        Box::new(|cc| {
            // 运行时加载中文字体
            let mut fonts = egui::FontDefinitions::default();
            if let Some(font_data) = load_system_font() {
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

/// 创建系统托盘图标
fn create_tray_icon() -> Option<tray_icon::TrayIcon> {
    // 加载图标
    let icon_bytes = include_bytes!("../icon.ico");
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
    
    // 监听托盘图标点击
    std::thread::spawn(|| {
        let receiver = TrayIconEvent::receiver();
        loop {
            if let Ok(event) = receiver.recv() {
                let should_show = matches!(
                    event,
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    }
                );
                if !should_show {
                    continue;
                }

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

fn load_icon() -> egui::IconData {
    let icon_bytes = include_bytes!("../icon.ico");
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
fn load_system_font() -> Option<Vec<u8>> {
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

/// 默认游戏关键词列表
fn default_game_keywords() -> Vec<String> {
    vec![
        // FPS 射击游戏
        "cs2".to_string(), "csgo".to_string(), "counter-strike".to_string(),
        "valorant".to_string(), "apex".to_string(), "apexlegends".to_string(),
        "pubg".to_string(), "tslgame".to_string(),
        "fortnite".to_string(), "fortniteclient".to_string(),
        "overwatch".to_string(), "r5apex".to_string(),
        "cod".to_string(), "callofduty".to_string(),
        "rainbow".to_string(), "rainbowsix".to_string(),
        
        // MOBA 游戏
        "league".to_string(), "lol".to_string(), "leagueclient".to_string(),
        "dota".to_string(), "dota2".to_string(),
        "honorofkings".to_string(),
        
        // 动作/格斗游戏
        "naraka".to_string(), "narakabladepoint".to_string(),
        "streetfighter".to_string(),
        "tekken".to_string(),
        
        // 开放世界/RPG
        "genshinimpact".to_string(), "yuanshen".to_string(),
        "gta".to_string(), "gtav".to_string(),
        "eldenring".to_string(),
        "cyberpunk".to_string(),
        "starfield".to_string(),
        "diablo".to_string(),
        "pathofexile".to_string(), "poe".to_string(),
        "lostark".to_string(),
        
        // 竞速游戏
        "forza".to_string(),
        "assettocorsa".to_string(),
        
        // 生存/沙盒
        "minecraft".to_string(),
        "rust".to_string(),
        "ark".to_string(),
        
        // 通用关键词
        "game".to_string(),
    ]
}


struct TNLiteApp {
    sys: System,
    selected_cores: HashSet<usize>,
    processes: Vec<LiteProcess>,
    search_term: String,
    last_refresh: std::time::Instant,
    topology: Option<CpuTopology>,
    config: AppConfig,
    status_msg: String,
    pending_profiles: HashMap<u32, PendingProfile>,
    minimize_to_tray: bool,
    game_keywords: Vec<String>,
    cpu_count: usize,
    is_hidden: bool,
}

#[derive(Clone)]
struct LiteProcess {
    pid: u32,
    name: String,
    cpu: f32,
    mem: u64,
}

impl TNLiteApp {
    fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        
        let topology = topology::get_cpu_topology().ok();
        let core_count = sys.cpus().len();
        let config = AppConfig::load();
        
        Self {
            sys,
            selected_cores: (0..core_count).collect(),
            processes: Vec::new(),
            search_term: String::new(),
            last_refresh: std::time::Instant::now(),
            topology,
            config,
            status_msg: String::new(),
            pending_profiles: HashMap::new(),
            minimize_to_tray: true,
            game_keywords: default_game_keywords(),
            cpu_count: core_count,
            is_hidden: false,
        }
    }

    fn refresh_data(&mut self) {
        self.sys.refresh_cpu_all();
        self.sys.refresh_processes(sysinfo::ProcessesToUpdate::All);
        
        let mut new_procs = Vec::new();
        let query = self.search_term.to_lowercase();
        
        for (pid, process) in self.sys.processes() {
            let name = process.name().to_string_lossy().to_string();
            if name.is_empty() { continue; }
            if !query.is_empty() && !name.to_lowercase().contains(&query) { continue; }
            new_procs.push(LiteProcess {
                pid: pid.as_u32(),
                name,
                cpu: process.cpu_usage() / self.sys.cpus().len() as f32,
                mem: process.memory() / 1024 / 1024,
            });
        }
        new_procs.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
        self.processes = new_procs;
    }
    
    fn get_core_type_color(core_type: &CoreType) -> egui::Color32 {
        match core_type {
            CoreType::VCache => egui::Color32::from_rgb(255, 100, 100),
            CoreType::Performance => egui::Color32::from_rgb(100, 200, 255),
            CoreType::Efficiency => egui::Color32::from_rgb(100, 255, 100),
            CoreType::Unknown => egui::Color32::WHITE,
        }
    }
    
    fn get_core_type_char(core_type: &CoreType) -> &'static str {
        match core_type {
            CoreType::VCache => "V",
            CoreType::Performance => "P",
            CoreType::Efficiency => "E",
            CoreType::Unknown => "",
        }
    }
    
    fn get_grouped_cores(&self) -> (Vec<LogicalCore>, Vec<LogicalCore>) {
        let mut physical_cores = Vec::new();
        let mut smt_cores = Vec::new();
        
        if let Some(top) = &self.topology {
            let mut seen_physical: HashSet<usize> = HashSet::new();
            
            for core in &top.cores {
                if !seen_physical.contains(&core.physical_id) {
                    physical_cores.push(core.clone());
                    seen_physical.insert(core.physical_id);
                } else {
                    smt_cores.push(core.clone());
                }
            }
        }
        
        (physical_cores, smt_cores)
    }
}

impl eframe::App for TNLiteApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // 保存 Context 到全局，以便托盘线程使用
        if let Ok(mut g_ctx) = GUI_CONTEXT.lock() {
            if g_ctx.is_none() {
                *g_ctx = Some(ctx.clone());
            }
        }

        // 检查是否需要显示窗口（从托盘恢复）
        if SHOW_WINDOW_FLAG.swap(false, Ordering::SeqCst) {
            self.is_hidden = false;
            ctx.send_viewport_cmd(egui::ViewportCommand::Visible(true));
            ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(false));
            ctx.send_viewport_cmd(egui::ViewportCommand::Focus);
        }
        
        // 检查是否需要退出
        if EXIT_FLAG.load(Ordering::SeqCst) {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        }
        
        if self.last_refresh.elapsed() >= std::time::Duration::from_millis(1000) {
            self.refresh_data();
            self.last_refresh = std::time::Instant::now();
        }

        egui::CentralPanel::default().show(ctx, |ui| {
            // 标题栏
            ui.horizontal(|ui| {
                ui.heading(egui::RichText::new("Task NeXus Lite").color(egui::Color32::from_rgb(180, 100, 255)));
                if let Some(top) = &self.topology {
                    ui.label(format!("| {} | {}核/{}线程", top.model, top.physical_cores, top.logical_cores));
                }
            });

            ui.add_space(6.0);

            // 核心选择 - 分组显示
            ui.group(|ui| {
                ui.horizontal(|ui| {
                    ui.strong("核心选择");
                    ui.add_space(20.0);
                    ui.label(egui::RichText::new("V").color(egui::Color32::from_rgb(255, 100, 100)));
                    ui.label("V-Cache");
                    ui.label(egui::RichText::new("P").color(egui::Color32::from_rgb(100, 200, 255)));
                    ui.label("性能核");
                    ui.label(egui::RichText::new("E").color(egui::Color32::from_rgb(100, 255, 100)));
                    ui.label("效率核");
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button("全选").clicked() { 
                            let count = self.cpu_count;
                            self.selected_cores = (0..count).collect(); 
                        }
                        if ui.button("清空").clicked() { self.selected_cores.clear(); }
                    });
                });
                
                ui.add_space(6.0);
                
                let (physical_cores, smt_cores) = self.get_grouped_cores();
                
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("物理核心").strong());
                    ui.add_space(10.0);
                    for core in &physical_cores {
                        let is_selected = self.selected_cores.contains(&core.id);
                        let type_color = Self::get_core_type_color(&core.core_type);
                        let type_char = Self::get_core_type_char(&core.core_type);
                        let label = format!("{}{}", core.id, type_char);
                        
                        let bg_color = if is_selected { egui::Color32::from_rgb(147, 51, 234) } else { egui::Color32::from_gray(60) };
                        let button = egui::Button::new(egui::RichText::new(&label).color(type_color).strong())
                            .fill(bg_color).min_size(egui::vec2(42.0, 36.0)).rounding(4.0);
                        
                        if ui.add(button).clicked() {
                            if is_selected { self.selected_cores.remove(&core.id); } else { self.selected_cores.insert(core.id); }
                        }
                    }
                });
                
                if !smt_cores.is_empty() {
                    ui.add_space(4.0);
                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new("SMT超线程").color(egui::Color32::GRAY));
                        ui.add_space(10.0);
                        for core in &smt_cores {
                            let is_selected = self.selected_cores.contains(&core.id);
                            let type_color = Self::get_core_type_color(&core.core_type);
                            let type_char = Self::get_core_type_char(&core.core_type);
                            let label = format!("{}{}", core.id, type_char);
                            
                            let bg_color = if is_selected { egui::Color32::from_rgb(120, 40, 180) } else { egui::Color32::from_gray(45) };
                            let button = egui::Button::new(egui::RichText::new(&label).color(type_color))
                                .fill(bg_color).min_size(egui::vec2(42.0, 36.0)).rounding(4.0);
                            
                            if ui.add(button).clicked() {
                                if is_selected { self.selected_cores.remove(&core.id); } else { self.selected_cores.insert(core.id); }
                            }
                        }
                    });
                }
            });

            ui.add_space(6.0);

            // 进程列表
            ui.group(|ui| {
                ui.horizontal(|ui| {
                    ui.strong("进程列表");
                    ui.add(egui::TextEdit::singleline(&mut self.search_term).hint_text("搜索...").desired_width(150.0));
                });
                ui.add_space(4.0);
                
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("进程名").strong());
                    ui.add_space(100.0);
                    ui.label(egui::RichText::new("当前状态").strong());
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.label(egui::RichText::new("操作").strong());
                        ui.add_space(30.0);
                        ui.label(egui::RichText::new("CPU").strong());
                        ui.add_space(30.0);
                        ui.label(egui::RichText::new("内存").strong());
                    });
                });
                ui.separator();
                
                egui::ScrollArea::vertical().max_height(300.0).id_source("proc_scroll").show(ui, |ui| {
                    let processes = self.processes.clone();
                    let topology = self.topology.clone();
                    for proc in &processes {
                        let proc_pid = proc.pid;
                        let proc_name = proc.name.clone();
                        let selected_cores = self.selected_cores.clone();

                        ui.push_id(proc_pid, |ui| {
                            let response = ui.horizontal(|ui| {
                                let proc_lower = proc_name.to_lowercase();
                                let is_game = self.game_keywords.iter().any(|kw| proc_lower.contains(kw));
                                let name_color = if is_game { 
                                    egui::Color32::from_rgb(0, 120, 0)
                                } else { 
                                    egui::Color32::from_rgb(50, 50, 50)
                                };
                                ui.label(egui::RichText::new(&proc_name).color(name_color).strong());
                                
                                ui.add_space(20.0);
                                
                                let profile = self.pending_profiles.get(&proc_pid);
                                let status_text = profile.map(|p: &PendingProfile| p.summary()).unwrap_or_else(|| "默认".to_string());
                                let status_color = if let Some(p) = profile {
                                    if let Some(level) = &p.priority {
                                        let (r, g, b): (u8, u8, u8) = level.color();
                                        egui::Color32::from_rgb(r, g, b)
                                    } else if !p.is_empty() {
                                        egui::Color32::from_rgb(180, 140, 60)
                                    } else {
                                        egui::Color32::from_gray(100)
                                    }
                                } else {
                                    egui::Color32::from_gray(100)
                                };
                                ui.label(egui::RichText::new(status_text).color(status_color));
                                
                                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                    if ui.button("应用").clicked() {
                                        let profile = self.pending_profiles.entry(proc_pid).or_default();
                                        let mut mask: u64 = 0;
                                        for &c in &selected_cores { mask |= 1 << c; }
                                        profile.affinity_mask = Some(mask);
                                        let profile_clone = profile.clone();
                                        
                                        tokio::spawn(async move {
                                            if let Some(mask) = profile_clone.affinity_mask {
                                                let _ = governor::set_process_affinity(proc_pid, format!("{:X}", mask)).await;
                                            }
                                            if let Some(level) = profile_clone.priority {
                                                let _ = governor::set_priority(proc_pid, level).await;
                                            }
                                            if let Some(core) = profile_clone.thread_bind_core {
                                                let _ = thread::smart_bind_thread(proc_pid, core).await;
                                            }
                                        });
                                        
                                        self.status_msg = format!("已应用策略到 {}", proc_name);
                                    }
                                    
                                    ui.add_space(8.0);
                                    ui.label(format!("{:.1}%", proc.cpu));
                                    ui.add_space(8.0);
                                    ui.label(format!("{} MB", proc.mem));
                                });
                            }).response;

                            response.context_menu(|ui| {
                                ui.label(egui::RichText::new(&proc_name).strong());
                                ui.separator();
                                
                                ui.menu_button("优先级", |ui| {
                                    for (label, p_str) in [("实时", "RealTime"), ("高", "High"), ("较高", "AboveNormal"), ("正常", "Normal"), ("低", "BelowNormal"), ("空闲", "Idle")] {
                                        if let Some(level) = PriorityLevel::from_str(p_str) {
                                            let (r, g, b) = level.color();
                                            if ui.button(egui::RichText::new(label).color(egui::Color32::from_rgb(r, g, b))).clicked() { 
                                                let profile = self.pending_profiles.entry(proc_pid).or_default();
                                                profile.priority = Some(level);
                                                self.status_msg = format!("已设置 {} 优先级: {}", proc_name, label);
                                                ui.close_menu();
                                            }
                                        }
                                    }
                                });
                                
                                ui.menu_button("线程绑定", |ui| {
                                    if let Some(top) = &topology {
                                        for core in &top.cores {
                                            let type_char = Self::get_core_type_char(&core.core_type);
                                            if ui.button(format!("核心 {}{}", core.id, type_char)).clicked() {
                                                let profile = self.pending_profiles.entry(proc_pid).or_default();
                                                profile.thread_bind_core = Some(core.id as u32);
                                                self.status_msg = format!("已设置 {} 线程绑定: 核心{}", proc_name, core.id);
                                                ui.close_menu();
                                            }
                                        }
                                    }
                                });
                                
                                if ui.button("清除策略").clicked() {
                                    self.pending_profiles.remove(&proc_pid);
                                    self.status_msg = format!("已清除 {} 的策略", proc_name);
                                    ui.close_menu();
                                }
                                
                                ui.separator();
                                if ui.button(egui::RichText::new("结束进程").color(egui::Color32::from_rgb(255, 100, 100))).clicked() {
                                    tokio::spawn(async move { let _ = governor::kill_process(proc_pid).await; });
                                    ui.close_menu();
                                }
                            });
                        });
                        ui.separator();
                    }
                });
            });

            // 底部控制栏
            ui.with_layout(egui::Layout::bottom_up(egui::Align::LEFT), |ui| {
                ui.add_space(5.0);
                ui.horizontal(|ui| {
                    let mut auto_start = self.config.auto_start;
                    if ui.checkbox(&mut auto_start, "开机自启动").changed() {
                        self.config.auto_start = auto_start;
                        if set_auto_start(auto_start).is_ok() { let _ = self.config.save(); }
                    }
                    
                    ui.checkbox(&mut self.minimize_to_tray, "关闭时最小化到托盘");
                    ui.separator();
                    
                    if ui.button("保存").clicked() { if self.config.save().is_ok() { self.status_msg = "配置已保存".to_string(); } }
                    if ui.button("导出").clicked() {
                        if let Some(path) = rfd::FileDialog::new().add_filter("JSON", &["json"]).set_file_name("tn_lite_config.json").save_file() {
                            if self.config.export_to(&path).is_ok() { self.status_msg = format!("已导出: {}", path.display()); }
                        }
                    }
                    if ui.button("导入").clicked() {
                        if let Some(path) = rfd::FileDialog::new().add_filter("JSON", &["json"]).pick_file() {
                            if let Ok(cfg) = AppConfig::import_from(&path) { self.config = cfg; let _ = self.config.save(); self.status_msg = "配置已导入".to_string(); }
                        }
                    }
                    ui.separator();
                    if ui.button("清理内存").clicked() { tokio::spawn(async { let _ = governor::clear_system_memory().await; }); self.status_msg = "内存清理已触发".to_string(); }
                });
                
                if !self.status_msg.is_empty() { ui.label(egui::RichText::new(&self.status_msg).weak()); }
            });
        });
        
        // 处理关闭事件 - 最小化到托盘
        if ctx.input(|i| i.viewport().close_requested()) && self.minimize_to_tray {
            self.is_hidden = true;
            ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
            ctx.send_viewport_cmd(egui::ViewportCommand::Visible(false));
            self.status_msg = "已最小化到托盘".to_string();
        }
        
        ctx.request_repaint_after(std::time::Duration::from_millis(200));
    }
}
