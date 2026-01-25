use std::{thread as std_thread, time::Duration, collections::HashMap};
use crate::{governor, thread as thread_utils};
use tauri::command;

/// 基于负载权重的级联映射算法 (Load-Weighted Cascading Mapping)
/// 
/// 核心思想：将“最忙的线程”精准填入用户指定的“最高优先级核心”序列。
#[command]
pub async fn apply_cascading_affinity(pid: u32, priority_cores: Vec<u32>) -> Result<(), String> {
    if priority_cores.is_empty() {
        return Err("核心列表不能为空".into());
    }

    // 1. 基础保障：先把整个进程圈在用户选的所有核心里
    // 即使算法后续分发有微调，至少进程不会跑出这个范围
    let mut full_mask = 0u64;
    for &core_id in &priority_cores {
        if core_id < 64 {
            full_mask |= 1 << core_id;
        }
    }

    if full_mask == 0 {
        return Err("无效的核心掩码".into());
    }

    // 设置进程掩码 (使用现有的 governor 逻辑，它支持格式化 hex)
    let mask_hex = format!("{:X}", full_mask);
    governor::set_process_affinity(pid, mask_hex)
        .await
        .map_err(|e| e.to_string())?;

    // 如果只选了 1 个核，或者不是 Windows，没必要做级联算法
    #[cfg(not(windows))]
    {
        return Ok(());
    }

    #[cfg(windows)]
    {
        if priority_cores.len() < 1 {
            return Ok(());
        }

        // 2. 启动异步线程进行“画像与分发” (避免阻塞 UI 线程)
        // 使用 spawn_blocking 因为内部有 thread::sleep
        tokio::task::spawn_blocking(move || {
            // === Step A: 采样 ===
            // 第一次快照
            let mut threads_snapshot_1 = HashMap::new();
            if let Ok(threads) = thread_utils::get_process_threads(pid) {
                for t in threads {
                    threads_snapshot_1.insert(t.tid, t.cpu_time_ns);
                }
            } else {
                return;
            }

            // 让子弹飞一会儿 (300ms 动态采样)
            std_thread::sleep(Duration::from_millis(300));

            // 第二次快照
            let mut thread_loads: Vec<(u32, u64)> = Vec::new(); // (TID, DeltaTime)
            if let Ok(threads_2) = thread_utils::get_process_threads(pid) {
                for t2 in threads_2 {
                    if let Some(&t1_time) = threads_snapshot_1.get(&t2.tid) {
                        if t2.cpu_time_ns >= t1_time {
                            let delta = t2.cpu_time_ns - t1_time;
                            thread_loads.push((t2.tid, delta));
                        }
                    }
                }
            } else {
                return;
            }

            // === Step B: 排序 ===
            // 按负载降序排列 (最忙的在前面)
            thread_loads.sort_by(|a, b| b.1.cmp(&a.1));

            // === Step C: 级联绑定 ===
            
            // 👑 Rank 1 (Main) -> 绑定到 priority_cores[0]
            if let Some(&(main_tid, _)) = thread_loads.get(0) {
                let mask = 1u64 << priority_cores[0];
                let _ = thread_utils::set_thread_affinity(main_tid, mask);
                tracing::info!("级联算法: 主线程 {} 锁定至 Core {}", main_tid, priority_cores[0]);
            }

            // 🛡️ Rank 2 (Render/Driver) -> 绑定到 priority_cores[1] (如果有)
            if priority_cores.len() >= 2 {
                if let Some(&(render_tid, _)) = thread_loads.get(1) {
                    // 如果用户选了多个核，将次重线程锁在第二个核上
                    let mask = 1u64 << priority_cores[1];
                    let _ = thread_utils::set_thread_affinity(render_tid, mask);
                    tracing::info!("级联算法: 次重线程 {} 锁定至 Core {}", render_tid, priority_cores[1]);
                }
            }

            // 📦 Rank 3+ (Others) -> 已经在进程级的 full_mask 约束下了，无需额外操作
            // 让系统调度器在 full_mask 范围内自由分配，避免核心利用率不均。
        });
    }

    Ok(())
}
