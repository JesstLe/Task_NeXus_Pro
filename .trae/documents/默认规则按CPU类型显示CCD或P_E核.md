## 你的疑问：我检测 CPU 型号的逻辑对吗？
- 你仓库里**已经有 CPU 型号/架构检测**：前端在初始化时 `get_cpu_info()` 拿到 `info.model`，再用 `getCpuArchitecture(info.model)` 得到 `cpuArch`（AMD_CCD / INTEL_HYBRID 等）。见 [App.tsx](file:///e:/Documents/WorkSpace/TN/src/App.tsx) 与 [cpuDatabase.ts](file:///e:/Documents/WorkSpace/TN/src/data/cpuDatabase.ts#L163-L182)。
- 因此这次 UI 显示逻辑我会**直接复用你现有 cpuArch** 来决定“Intel 显示 P/E、AMD 显示 CCD”，不会再用“我自己猜测”的平台判断。

## 目标
- AMD（cpuArch.type === 'AMD_CCD'）：默认规则 UI 显示/选择 `CCD0/CCD1/...`。
- Intel 混合（cpuArch.type === 'INTEL_HYBRID' 且 isHybrid=true）：默认规则 UI 显示/选择 `P 核 / E 核`。
- 其它/识别失败：维持现在的 group 方案（或仅显示“自动”），保证不误导。

## 实现方案
### 1) 让 SettingsPanel 拿到 cpuArch
- 在 [App.tsx](file:///e:/Documents/WorkSpace/TN/src/App.tsx) 里，把已有的 `cpuArch` 作为 prop 传给 SettingsPanel。
- 扩展 [SettingsPanel.tsx](file:///e:/Documents/WorkSpace/TN/src/components/settings/SettingsPanel.tsx) 的 Props 增加 `cpuArch?: CpuArch | null`。

### 2) 默认规则下拉的标签与可选项按 cpuArch 切换
- Intel 混合：下拉选项为 `自动 / P 核 / E 核`。
- AMD CCD：下拉选项为 `自动 / CCD0 / CCD1 / ...`（按 `topology.group_id` 排序映射 0..n）。
- 其它：仅 `自动`（必要时保留 `Group x` 作为 fallback）。

### 3) 掩码生成方式（避免“仅靠型号推测核心排列”）
- Intel 混合的 P/E 掩码**优先用后端 topology 的 core_type**（Performance/Efficiency）生成，避免不同 CPU/BIOS/系统导致的线程编号差异。
- AMD 的 CCD 掩码按 `group_id` 分组生成。
- `resolveRuleTarget` / `setRuleMaskByTarget` 改为基于“当前平台的 option 列表（label + maskHex）”匹配与写入。

## 改动文件
- [App.tsx](file:///e:/Documents/WorkSpace/TN/src/App.tsx)
- [SettingsPanel.tsx](file:///e:/Documents/WorkSpace/TN/src/components/settings/SettingsPanel.tsx)
- （如需）[types.ts](file:///e:/Documents/WorkSpace/TN/src/types.ts) 只用于补齐 SettingsPanelProps 的类型导入。

## 验证
- Intel 混合机器：默认规则显示 P/E；选择后写入的 gameMask/systemMask 与 topology 的 P/E 掩码一致。
- AMD 双 CCD：默认规则显示 CCD0/CCD1；选择后掩码与 group_id 分组一致。
- 未识别机型：不显示错误标签，不强行 CCD/P/E。

确认后我会按以上修改并跑一次 `npm run build` + `cargo check` 验证编译通过。