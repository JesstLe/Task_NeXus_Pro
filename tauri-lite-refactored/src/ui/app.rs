//! 应用程序 UI 逻辑
//! 
//! 接管原 main.rs 中的 TNLiteApp 结构体及其实现。

use eframe::egui;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::Ordering;

use crate::core::{
    governor, thread, topology, power,
    PriorityLevel, CpuTopology, AppConfig, set_auto_start, PendingProfile, LiteProcess,
    monitor::SystemMonitor, config::ProcessProfile
};

use super::{SHOW_WINDOW_FLAG, EXIT_FLAG, GUI_CONTEXT};
use super::utils;

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

pub struct TNLiteApp {
    monitor: SystemMonitor,
    selected_cores: HashSet<usize>,
    processes: Vec<LiteProcess>,
    search_term: String,
    // last_refresh: std::time::Instant,
    topology: Option<CpuTopology>,
    config: AppConfig,
    status_msg: String,
    pending_profiles: HashMap<u32, PendingProfile>,
    minimize_to_tray: bool,
    game_keywords: Vec<String>,
    cpu_count: usize,
    is_hidden: bool,
    power_plans: Vec<power::PowerPlan>,
}

impl TNLiteApp {
    pub fn new() -> Self {
        // 使用 SystemMonitor 初始化
        let monitor = SystemMonitor::new();
        let cpu_count = monitor.cpu_count();
        
        let topology = topology::get_cpu_topology().ok();
        let config = AppConfig::load();
        
        let mut app = Self {
            monitor,
            selected_cores: (0..cpu_count).collect(),
            processes: Vec::new(),
            search_term: String::new(),
            // last_refresh: std::time::Instant::now(),
            topology,
            config,
            status_msg: String::new(),
            pending_profiles: HashMap::new(),
            minimize_to_tray: true,
            game_keywords: default_game_keywords(),
            cpu_count,
            is_hidden: false,
            power_plans: Vec::new(),
        };
        app.refresh_data();
        app.refresh_power_plans();
        app
    }

    fn refresh_data(&mut self) {
        // 调用 Monitor 模块获取数据，实现 UI 与数据获取解耦
        self.processes = self.monitor.scan_processes(&self.search_term);
    }

    fn refresh_power_plans(&mut self) {
        if let Ok(plans) = power::get_power_plans() {
            self.power_plans = plans;
        }
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
        
        // Smart Refresh: We do NOT automatically refresh data here anymore.

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
                
                // 使用 Topology 模块的方法获取分组
                let (physical_cores, smt_cores) = if let Some(top) = &self.topology {
                    top.get_grouped_cores()
                } else {
                    (Vec::new(), Vec::new())
                };
                
                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("物理核心").strong());
                    ui.add_space(10.0);
                    
                    let mut current_ccd = 0;
                    if let Some(top) = &self.topology {
                        // 如果有 CCD 分组且超过 1 个，则启用分组显示
                        let has_ccd_groups = top.ccd_groups.len() > 1;
                        
                        // 为了快速查找核心所属的 CCD，构建一个映射
                        // 仅当需要分组显示时才构建
                        let mut core_ccd_map = HashMap::new();
                        if has_ccd_groups {
                            for (ccd_idx, group) in top.ccd_groups.iter().enumerate() {
                                for &core_id in group {
                                    core_ccd_map.insert(core_id, ccd_idx);
                                }
                            }
                        }

                        for (idx, core) in physical_cores.iter().enumerate() {
                            // CCD 分隔逻辑
                            if has_ccd_groups {
                                let ccd = *core_ccd_map.get(&core.id).unwrap_or(&0);
                                if idx > 0 && ccd != current_ccd {
                                    ui.add_space(10.0);
                                    ui.separator();
                                    ui.add_space(10.0);
                                    current_ccd = ccd;
                                }
                            }

                            let is_selected = self.selected_cores.contains(&core.id);
                            let type_color = utils::get_core_type_color(&core.core_type);
                            let type_char = utils::get_core_type_char(&core.core_type);
                            let label = format!("{}{}", core.id, type_char);
                            
                            let bg_color = if is_selected { egui::Color32::from_rgb(147, 51, 234) } else { egui::Color32::from_gray(60) };
                            let button = egui::Button::new(egui::RichText::new(&label).color(type_color).strong())
                                .fill(bg_color).min_size(egui::vec2(42.0, 36.0)).rounding(4.0);
                            
                            if ui.add(button).clicked() {
                                if is_selected { self.selected_cores.remove(&core.id); } else { self.selected_cores.insert(core.id); }
                            }
                        }
                    }
                });
                
                if !smt_cores.is_empty() {
                    ui.add_space(4.0);
                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new("SMT超线程").color(egui::Color32::GRAY));
                        ui.add_space(10.0);
                        
                        let mut current_ccd = 0;
                        let mut core_ccd_map = HashMap::new();
                        let has_ccd_groups = if let Some(top) = &self.topology {
                            if top.ccd_groups.len() > 1 {
                                for (ccd_idx, group) in top.ccd_groups.iter().enumerate() {
                                    for &core_id in group {
                                        core_ccd_map.insert(core_id, ccd_idx);
                                    }
                                }
                                true
                            } else {
                                false
                            }
                        } else {
                            false
                        };

                        for (idx, core) in smt_cores.iter().enumerate() {
                            // CCD 分隔逻辑 (SMT)
                            if has_ccd_groups {
                                let ccd = *core_ccd_map.get(&core.id).unwrap_or(&0);
                                if idx > 0 && ccd != current_ccd {
                                    ui.add_space(10.0);
                                    ui.separator();
                                    ui.add_space(10.0);
                                    current_ccd = ccd;
                                }
                            }

                            let is_selected = self.selected_cores.contains(&core.id);
                            let type_color = utils::get_core_type_color(&core.core_type);
                            let type_char = utils::get_core_type_char(&core.core_type);
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

            // 电源管理面板 (暂时隐藏)
            // ui.group(|ui| {
            //     ui.horizontal(|ui| {
            //         ui.strong("电源管理");
            //         if ui.button("刷新").clicked() {
            //             self.refresh_power_plans();
            //             self.status_msg = "电源计划已刷新".to_string();
            //         }
            //     });
            //     ui.add_space(4.0);
            //     
            //     ui.horizontal(|ui| {
            //         ui.label("当前计划:");
            //         if let Some(active) = self.power_plans.iter().find(|p| p.is_active) {
            //             ui.label(egui::RichText::new(&active.name).color(egui::Color32::GREEN).strong());
            //         } else {
            //             ui.label("未知");
            //         }
            //         
            //         ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            //             if ui.button("导入计划").clicked() {
            //                 if let Some(path) = rfd::FileDialog::new().add_filter("Power Plan", &["pow"]).pick_file() {
            //                     if power::import_plan(&path.to_string_lossy()).is_ok() {
            //                         self.refresh_power_plans();
            //                         self.status_msg = "电源计划已导入".to_string();
            //                     }
            //                 }
            //             }
            //         });
            //     });

            //     ui.separator();

            //     egui::ScrollArea::vertical().max_height(100.0).id_source("power_scroll").show(ui, |ui| {
            //         // Clone plans to avoid borrowing self while mutating self
            //         let plans = self.power_plans.clone();
            //         for plan in plans {
            //             ui.horizontal(|ui| {
            //                 let name_text = if plan.is_active {
            //                     egui::RichText::new(&plan.name).strong().color(egui::Color32::GREEN)
            //                 } else {
            //                     egui::RichText::new(&plan.name)
            //                 };
            //                 
            //                 if ui.button(name_text).clicked() {
            //                     if let Err(e) = power::set_active_plan(&plan.guid) {
            //                         self.status_msg = format!("切换失败: {}", e);
            //                     } else {
            //                         self.refresh_power_plans();
            //                         self.status_msg = format!("已切换电源计划: {}", plan.name);
            //                     }
            //                 }

            //                 ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            //                     if !plan.is_active {
            //                         if ui.small_button("🗑").on_hover_text("删除").clicked() {
            //                             if power::delete_plan(&plan.guid).is_ok() {
            //                                 self.refresh_power_plans();
            //                                 self.status_msg = format!("已删除电源计划: {}", plan.name);
            //                             } else {
            //                                 self.status_msg = "无法删除默认或活动计划".to_string();
            //                             }
            //                         }
            //                     }
            //                 });
            //             });
            //         }
            //     });
            // });

            ui.add_space(6.0);
            
            // 底部反馈区域
            ui.group(|ui| {
                ui.horizontal(|ui| {
                    ui.label("反馈和更新获取请加群：629474892");
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.button("加入群聊【TN测试群】").clicked() {
                            let _ = webbrowser::open("https://qm.qq.com/q/oIKs1SQpMs");
                        }
                    });
                });
            });

            ui.add_space(6.0);

            // 进程列表
            ui.group(|ui| {
                ui.horizontal(|ui| {
                    ui.strong("进程列表");
                    ui.add(egui::TextEdit::singleline(&mut self.search_term).hint_text("搜索...").desired_width(150.0));
                    
                    // 手动刷新按钮
                    if ui.button("🔄 刷新").clicked() {
                        self.refresh_data();
                        self.status_msg = "进程列表已刷新".to_string();
                    }
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
                                // 使用 utils 中的 summary 方法
                                let status_text = profile.map(|p| utils::get_profile_summary(p, self.topology.as_ref())).unwrap_or_else(|| "默认".to_string());
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
                                        
                                        // Save to config whitelist
                                        let process_profile = ProcessProfile::from_pending(profile);
                                        self.config.process_profiles.insert(proc_name.clone(), process_profile);
                                        let _ = self.config.save();

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
                                            if let Some(core) = profile_clone.ideal_core {
                                                let _ = thread::smart_set_ideal_thread(proc_pid, core).await;
                                            }
                                            // 自动触发内存清理
                                            let _ = governor::trim_memory(proc_pid).await;
                                        });
                                        
                                        self.status_msg = format!("已应用策略并保存到白名单: {}", proc_name);
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
                                
                                ui.menu_button("模式选择", |ui| {
                                    ui.menu_button("模式1: 第一优先核心", |ui| {
                                        if let Some(top) = &topology {
                                            for core in &top.cores {
                                                let type_char = utils::get_core_type_char(&core.core_type);
                                                if ui.button(format!("核心 {}{}", core.id, type_char)).clicked() {
                                                    let profile = self.pending_profiles.entry(proc_pid).or_default();
                                                    profile.ideal_core = Some(core.id as u32);
                                                    self.status_msg = format!("已设置 {} 理想核心: 核心{}", proc_name, core.id);
                                                    ui.close_menu();
                                                }
                                            }
                                        }
                                    });
                                    ui.add_enabled(false, egui::Button::new("模式2: (开发中)"));
                                    ui.add_enabled(false, egui::Button::new("模式3: (开发中)"));
                                });

                                ui.menu_button("线程绑定", |ui| {
                                    if let Some(top) = &topology {
                                        for core in &top.cores {
                                            let type_char = utils::get_core_type_char(&core.core_type);
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
        
        // Smart Refresh: Low refresh rate when focused, stop when unfocused
        if ctx.input(|i| i.focused) {
            ctx.request_repaint_after(std::time::Duration::from_millis(200)); // 5 FPS when focused
        }
    }
}
