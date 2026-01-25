我将实施以下计划，在 `tauri-lite-refactored` 中支持 AMD 双 CCD 拓扑的分组显示：

### 1. 核心层 (Core Layer) 修改

*   **修改 `src/core/types.rs`**:
    *   在 `CpuTopology` 结构体中新增 `ccd_groups: Vec<Vec<usize>>` 字段，用于存储 CCD 分组信息（每个内部 `Vec` 是一个 CCD 包含的逻辑核心 ID 列表）。

*   **修改 `src/core/topology.rs`**:
    *   在 `get_cpu_topology` 函数中，利用现有的 `l3_cache_map` 和 `core_group_map` 逻辑，解析出 CCD 分组信息。
    *   **逻辑**：遍历所有唯一的 L3 缓存掩码（即 `core_group_map` 的 value 集合），将每个掩码对应的核心 ID 收集起来，按核心 ID 排序，形成 CCD 列表。

### 2. UI 层 (UI Layer) 修改

*   **修改 `src/ui/app.rs`**:
    *   在“核心选择”分组显示区域，新增“CCD 分组”显示逻辑。
    *   **条件渲染**：**严格判断** `ccd_groups.len() > 1`。只有在多 CCD (如 7950X, 5900X) 时才启用新布局；单 CCD (如 7800X3D, Intel CPU) 保持**完全原样**。
    *   **双 CCD 布局实现**：
        *   当检测到双 CCD 时，不再使用单纯的“物理核心 / SMT”两行布局。
        *   改为按 CCD 迭代：
            ```
            CCD 0 (物理): [0 2 4 6]  SMT: [1 3 5 7]
            CCD 1 (物理): [8 10 12 14] SMT: [9 11 13 15]
            ```
        *   或者更紧凑的方式（符合图二位置）：保持“物理核心”一行，“SMT”一行，但在中间插入明显的分隔符（如 `|` 或大间距）。
    *   **最终UI方案**：
        *   保留“物理核心”和“SMT超线程”两行标签。
        *   在渲染核心按钮循环中，检查当前核心所属的 CCD ID。
        *   如果 `current_core_ccd != previous_core_ccd`，插入一个 `ui.separator()` 或 `ui.add_space(30.0)`，并在视觉上将两个 CCD 的核心区隔开。
        *   这样既保留了原有布局的紧凑性，又直观展示了分组。

### 3. 执行步骤

1.  **Core**: 更新 `CpuTopology` 结构体和 `get_cpu_topology` 实现。
2.  **UI**: 更新 `app.rs` 中的核心渲染循环，加入基于 CCD 变化的视觉分隔逻辑。

此方案无需引入新依赖，且完全复用了现有的 L3 缓存检测逻辑（AMD 的 CCD 本质上就是 L3 共享域）。