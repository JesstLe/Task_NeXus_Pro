我将执行**隔离重构**方案，在全新目录 `tauri-lite-refactored` 中构建模块化版本，确保原项目 `tauri-lite` 毫发无损。

### 1. 隔离环境搭建 (Isolation Setup)
*   **创建新项目根目录**: `e:\Documents\WorkSpace\Task_NeXus\Task_NeXus\tauri-lite-refactored`
*   **配置迁移**: 复制 `Cargo.toml`，将项目名称修改为 `tn-lite-refactored`，保持所有依赖版本一致。
*   **资源迁移**: 复制 `icon.ico` 等静态资源到新目录。

### 2. 核心层重构 (Core Layer Refactoring)
*   **直接迁移模块**: 将 `governor.rs`, `thread.rs`, `config.rs` 从原项目复制到新项目的 `src/core/`。
*   **Types 增强**: 复制 `types.rs`，并将原 `main.rs` 中的 `LiteProcess` 结构体移动至此。
*   **Monitor 模块 (新)**: 创建 `src/core/monitor.rs`，封装 `sysinfo`。将原 `refresh_data` 的**全部逻辑**（含排序、过滤、计算）原样移植到 `SystemMonitor::scan_processes` 中。
*   **Topology 增强**: 复制 `topology.rs`，并将原 `main.rs` 中的 `get_grouped_cores` 逻辑移植为 `CpuTopology` 的方法。

### 3. UI 层构建 (UI Layer Construction)
*   **UI 模块化**: 创建 `src/ui/` 目录。
*   **App 逻辑迁移**: 将 `TNLiteApp` 结构体及 `impl eframe::App` 逻辑从原 `main.rs` 移植到 `src/ui/app.rs`。
    *   *改动*: 将内部直接调用的 `self.sys` 替换为 `self.monitor` 接口调用。
*   **Utils 提取**: 将 `get_core_type_color`, `load_system_font` 等纯 UI 逻辑提取到 `src/ui/utils.rs`。

### 4. 入口与文档 (Entry & Docs)
*   **新入口**: 编写极简的 `src/main.rs`，仅负责模块组装与启动。
*   **文档更新**: 在新目录下创建 `ARCHITECTURE.md`，详细说明新的分层架构、模块职责边界及扩展指南。

### 5. 验证 (Verification)
*   在不影响原项目的情况下，尝试编译新项目 `cargo check`。
*   验证新架构的代码结构是否符合 SOLID 原则。

此方案完全满足"隔离"、"不修改逻辑"、"更新文档"的所有要求。