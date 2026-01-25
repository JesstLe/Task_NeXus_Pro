## 目标
- 在不触碰游戏完整性/不注入的前提下，通过“系统调度 + 后台压制 + 关键系统开关”提升帧率与帧稳定（减少卡顿/掉帧）。

## 现状盘点（仓库已具备）
- 进程调度：优先级、CPU 亲和性（硬绑核/策略模式）、CPU Sets（软亲和性）、重线程智能锁核、级联线程绑定。
- 系统策略：电源计划/核心解停泊、HAGS 开关、系统计时器分辨率（NtSetTimerResolution）。
- 资源干预：进程工作集 Trim、系统 Standby List 清理、对后台进程做 Job Object CPU 上限。

## 立刻可用的“推荐组合”（产品策略层）
- 新增并内置“永劫无间-电竞档”Profile：
  - 游戏进程：优先级 High（不使用 RealTime）、CPU Sets 优先绑定 P-Core（或用户选择的核心序列）、可选启用“最重线程锁核”。
  - 系统：切到高性能/卓越性能；计时器分辨率设为 0.5ms/1ms（可一键 A/B）；HAGS 提供开/关对比；必要时启用“禁用 Game Bar/电源限流”等现有 tweaks。
  - 后台：对 Top CPU/IO 噪声进程自动降优先级/绑定小核/必要时加 CPU 上限（带黑白名单与自动回滚）。

## 需要补齐的能力（后端）
- 增加“电源节流/EcoQoS”进程级控制：使用 SetProcessInformation 配置 PROCESS_POWER_THROTTLING_STATE，实现对游戏进程禁用节能节流，对后台进程启用更强节流。
- 增加 IO/Page priority：通过 NtSetInformationProcess/SetProcessInformation 设置 ProcessIoPriority、ProcessPagePriority，让后台任务更不抢盘/内存带宽（不改游戏本体）。
- 可选实现“进程级 GPU 偏好”：写入 UserGpuPreferences（按 exe 路径）并提供回滚；用于双显卡/混合显卡机器强制高性能 GPU。

## 需要补齐的能力（前端/交互）
- 增加“电竞模式”一键开关：
  - 开启时：检测永劫无间进程→自动应用 profile；退出进程→自动恢复用户原状态（电源计划/计时器等）。
  - 提供实时可观测指标：游戏 FPS/帧时间若无法直接取，则展示 CPU/GPU 占用、掉帧相关的后台噪声进程 Top 列表。
- 增加 A/B 测试面板：对计时器分辨率、HAGS、电源计划三项做快速切换与结果记录（仅记录本地指标）。

## 验证方式
- 增加最小化验证：
  - 后端单元/集成：对 Windows API 调用返回值与错误路径覆盖；对“自动回滚”路径做模拟。
  - 运行验证：在开发环境启动游戏/模拟进程时，确认 profile 生效、退出后状态恢复。

## 风险与回滚
- 所有系统级改动（电源计划、HAGS、tweaks、计时器分辨率、注册表）必须提供“当前值读取 + 一键恢复默认”。
- 默认不使用 RealTime；默认不做高频 Standby purge（只在“开局前/显存爆/切后台卡顿”场景手动触发）。
