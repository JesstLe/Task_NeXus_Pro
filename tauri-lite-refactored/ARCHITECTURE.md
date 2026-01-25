# Task NeXus Lite (Refactored) 架构文档

本项目已从原 `tauri-lite` 目录重构，采用了分层架构（Layered Architecture），旨在实现高内聚、低耦合，同时严格保留了核心调度逻辑。

## 1. 核心设计原则

*   **模块化 (Modularity)**: 将功能划分为独立的模块，避免 God Class。
*   **单一职责 (SRP)**: UI 只负责渲染，Core 只负责业务逻辑。
*   **接口隔离 (Interface Segregation)**: 通过 Ports 定义能力边界。
*   **逻辑保留**: 核心调度算法（Governor, Thread Binding）与原版完全一致。

## 2. 目录结构

```
src/
├── core/               # 核心层：业务逻辑与系统能力
│   ├── mod.rs
│   ├── types.rs        # 通用类型定义 (LiteProcess, PriorityLevel)
│   ├── monitor.rs      # [NEW] 系统监控 (封装 sysinfo)
│   ├── topology.rs     # 硬件拓扑检测 (增强了分组逻辑)
│   ├── governor.rs     # 进程调度实现 (Win32 API)
│   ├── thread.rs       # 线程调度实现 (帧线程优化)
│   ├── config.rs       # 配置管理
│   └── ports.rs        # [NEW] 抽象接口定义
├── ui/                 # 展示层：界面与交互
│   ├── mod.rs          # 全局状态管理
│   ├── app.rs          # 主应用逻辑 (TNLiteApp)
│   ├── utils.rs        # [NEW] UI 辅助函数 (颜色、字体、图标)
│   └── tray.rs         # [NEW] 系统托盘逻辑
└── main.rs             # 入口：模块组装与启动
```

## 3. 关键重构点

### 3.1 系统监控解耦
原 `TNLiteApp` 直接持有 `sysinfo::System` 并在 `refresh_data` 中混合了数据获取、过滤、排序和 UI 转换逻辑。
**现架构**:
*   `src/core/monitor.rs`: `SystemMonitor` 结构体封装了 `sysinfo`。
*   `scan_processes` 方法接管了原 `refresh_data` 的所有**数据处理逻辑**。
*   UI 层只需调用 `monitor.scan_processes(query)` 即可获得处理好的 `Vec<LiteProcess>`。

### 3.2 UI 逻辑分离
原 `main.rs` 包含大量 UI 辅助代码（如加载字体、图标、颜色映射）。
**现架构**:
*   这些代码移至 `src/ui/utils.rs`。
*   `TNLiteApp` 瘦身，专注于界面布局和事件响应。

### 3.3 拓扑逻辑内聚
原 `get_grouped_cores` 散落在 App 中。
**现架构**:
*   移动到 `src/core/topology.rs` 作为 `CpuTopology` 的成员方法。

## 4. 扩展指南

*   **修改 UI**: 请在 `src/ui/` 目录下操作。
*   **修改调度算法**: 请在 `src/core/governor.rs` 或 `thread.rs` 中操作。
*   **添加新配置**: 请修改 `src/core/config.rs`。

此架构确保了 UI 的变动不会影响核心调度逻辑，反之亦然。
