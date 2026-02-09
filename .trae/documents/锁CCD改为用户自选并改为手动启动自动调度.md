## 现状检查
- 目前“自动调度/自动化策略”是**启动即生效**：应用启动时在 [main.rs](file:///e:/Documents/WorkSpace/TN/src-tauri/src/main.rs) 的 `.setup()` 里启动 `ProcessMonitor::start()`；监控线程每秒 tick 一次，并在同一 tick 内无条件执行：
  - `enforce_profiles`（自动化策略 profiles）
  - `apply_default_rules`（默认规则：游戏→P核/CCD0，系统→E核/CCD1）
  - `check_and_restrain`（ProBalance）
  - `check_and_trim_memory`（SmartTrim）
  具体位置见 [monitor.rs:L167-L173](file:///e:/Documents/WorkSpace/TN/src-tauri/src/monitor.rs#L167-L173)。
- “锁CCD”在 UI 层主要体现在分区/核心选择，但**默认规则**在后端写死了语义：游戏映射到 “P-Core/CCD0”，系统映射到 “E-Core/CCD1”（并且还会改优先级），见 [watchdog.rs:L451-L525](file:///e:/Documents/WorkSpace/TN/src-tauri/src/watchdog.rs#L451-L525)。
- 后端其实已经具备“用户自定义掩码”的能力：`DefaultRules` 里有 `game_mask/system_mask` 字段（前端目前没暴露）见 [lib.rs:L241-L270](file:///e:/Documents/WorkSpace/TN/src-tauri/src/lib.rs#L241-L270)。
- CCD/分组信息在后端 topology 里通过 `LogicalCore.group_id` 提供（AMD 可近似视为 CCD/NUMA/L3 分组），见 [hardware_topology.rs:L21-L28](file:///e:/Documents/WorkSpace/TN/src-tauri/src/hardware_topology.rs#L21-L28)。前端 `LogicalCore` 类型已包含 `group_id`，[types.ts:L23-L28](file:///e:/Documents/WorkSpace/TN/src/types.ts#L23-L28)。

## 目标（按你的要求落地）
1. “锁 CCD”改为**用户自选**：用户可选 CCD0/CCD1（或更多 group）把某个进程锁定到目标 CCD。
2. “单纯的锁”：执行只做亲和性/CPU sets 绑定，不额外触发 profiles/defaultRules/ProBalance/SmartTrim。
3. “不自动调度”：软件启动后默认不运行自动调度逻辑；只有用户在 UI 里手动确认后才开始。

## 后端改动（Rust/Tauri）
- **增加一个运行时开关** `AUTO_ENFORCE_ENABLED`（AtomicBool，默认 false）。
- **新增 2 个 Tauri 命令**：
  - `get_auto_enforce_enabled() -> bool`
  - `set_auto_enforce_enabled(enable: bool)`
- **在监控 tick 里加 gating**：仅当 `AUTO_ENFORCE_ENABLED == true` 时，才执行 [monitor.rs:L167-L173](file:///e:/Documents/WorkSpace/TN/src-tauri/src/monitor.rs#L167-L173) 的 4 个 watchdog 调用；否则只做进程扫描与事件推送（UI 仍能看到进程列表/负载），但不会自动改任何进程。
- （可选但建议）**给 DefaultRules 增加“仅锁核心”开关**（例如 `affinityOnly: bool`，默认 true/false 由你定）：开启时 `apply_default_rules` 只设置 affinity，不再改 priority，避免“单纯锁”被优先级修改破坏。

## 前端改动（React/TS）
- **新增“自动调度”总开关 UI**（放在设置页或主控制栏）：
  - 默认显示“未启动自动调度（手动模式）”
  - 用户点击“开始自动调度”时调用 `set_auto_enforce_enabled(true)`；点击“停止自动调度”则调用 `false`。
- **把“锁 CCD”做成明确的手动动作**：在 `SmartAffinitySelector` 增加快捷按钮：
  - 当 topology 检测到存在多个 `group_id` 时，提供 `锁到 CCD0/CCD1`（或 `Group 0/1/...`）按钮：前端按 `group_id` 分组生成 mask（仅取 core.id < 64），然后直接走现有 `onApply(mask, hard/soft)` 流程。
  - 这样用户可以在进程页面选中游戏进程 → 一键锁到 CCD1，且不触发任何自动规则。
- **defaultRules 的“游戏锁到 CCD1”支持**：在设置页 DefaultRules 区域新增下拉选项：
  - “游戏目标”：自动/CCD0/CCD1/自定义
  - “系统目标”：自动/CCD0/CCD1/自定义
  - 选择 CCD 时由前端基于 topology 自动计算 `game_mask/system_mask` 并写入配置（沿用现有 `set_setting('defaultRules', ...)`）。
  - 由于后端已经支持 `game_mask/system_mask`，只需补齐前端类型与 UI。

## 验证方式
- 启动应用（不点确认）：观察仍能刷新进程列表，但不会自动更改任何进程 affinity/priority（监控日志也不应出现 DefaultRules/ProBalance 相关 apply 日志）。
- 手动对某个游戏进程点击“锁到 CCD1”：该进程 affinity 变更，且不会引发其他进程被自动迁移。
- 点击“开始自动调度”：此后才允许 profiles/defaultRules/ProBalance/SmartTrim 在 tick 中生效。

## 需要改动的主要文件（预计）
- 后端：
  - [monitor.rs](file:///e:/Documents/WorkSpace/TN/src-tauri/src/monitor.rs)
  - [main.rs](file:///e:/Documents/WorkSpace/TN/src-tauri/src/main.rs)（注册新命令）
  - [lib.rs](file:///e:/Documents/WorkSpace/TN/src-tauri/src/lib.rs) / [watchdog.rs](file:///e:/Documents/WorkSpace/TN/src-tauri/src/watchdog.rs)（可选：affinityOnly）
- 前端：
  - [SmartAffinitySelector.tsx](file:///e:/Documents/WorkSpace/TN/src/components/SmartAffinitySelector.tsx)
  - [SettingsPanel.tsx](file:///e:/Documents/WorkSpace/TN/src/components/settings/SettingsPanel.tsx)
  - [types.ts](file:///e:/Documents/WorkSpace/TN/src/types.ts)（补齐 defaultRules 字段）

确认后我会按上述方案落地实现（含中文注释/中文文案），并在本地构建验证。