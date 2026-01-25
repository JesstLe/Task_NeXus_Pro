# Task NeXus - Tauri v2 重构实施计划

电竞性能优化工具从 Electron 迁移到 Tauri v2 的完整技术方案。

## 背景与目标

将现有的 **Electron + Node.js** 架构重构为 **Tauri v2 + Rust** 后端，实现：
- **零开销进程监控**：所有高频操作在 Rust 侧完成
- **WinAPI 直调**：使用 `windows-rs` 直接调用 NT API
- **硬件普适性**：自动适配 Intel 大小核 / AMD X3D / N/A 显卡

## 项目结构

在项目目录下创建 `tauri-v2/` 子文件夹进行开发，保留原有 Electron 代码以便对照。

```
Task_NeXus/
├── electron/                     # 保留: 原 Electron 代码
├── src/                          # 保留: 原 React 前端
├── tauri-v2/                     # 新增: Tauri v2 项目
│   ├── docs/
│   │   └── implementation_plan.md
│   ├── src/                      # 复制并修改的 React 前端
│   ├── src-tauri/                # Rust 后端
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── main.rs
│   │       ├── governor.rs
│   │       ├── hardware.rs
│   │       ├── watchdog.rs
│   │       ├── tweaks.rs
│   │       ├── power.rs
│   │       └── config.rs
│   ├── package.json
│   └── vite.config.js
```

## 模块概览

### 模块 1: 项目初始化
- Tauri v2 项目结构
- Cargo.toml 依赖配置
- 核心数据结构定义

### 模块 2: Governor Engine (进程管理)
- NtQuerySystemInformation 进程快照
- SetPriorityClass / SetProcessAffinityMask
- EmptyWorkingSet 内存优化

### 模块 3: 硬件拓扑检测
- GetLogicalProcessorInformationEx
- Intel P-Core/E-Core 识别
- AMD CCD/X3D 检测

### 模块 4: 游戏模式 Watchdog
- 后台检测线程
- 电源计划切换
- 进程隔离调度

### 模块 5: 系统优化 Tweaks
- 网络延迟优化
- HPET/动态时钟
- 定时器分辨率

### 模块 6: 前端适配
- 替换 window.electron → @tauri-apps/api
- 保留现有 UI 组件
