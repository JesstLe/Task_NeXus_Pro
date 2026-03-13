# Task Nexus Pro

一款专为电竞游戏优化的 Windows 桌面应用，通过智能 CPU 核心调度、进程优先级管理和内存优化，帮助玩家获得更流畅的游戏体验。

## 功能特性

- **智能核心调度** - 自动识别 Intel P-Core/E-Core 和 AMD 处理器架构，优化线程分配
- **进程管理** - 实时监控进程资源占用，快速调整进程优先级和 CPU 亲和性
- **内存优化** - 一键清理工作集内存，减少内存碎片
- **游戏模式** - 自动检测游戏进程，动态优化系统资源分配
- **硬件适配** - 支持 Intel 大小核、AMD X3D、NVIDIA/AMD 显卡等多种硬件配置
- **自定义配置** - 保存游戏/应用配置文件，实现一键优化

## 技术栈

| 技术 | 版本 |
|------|------|
| Tauri | v2 |
| React | 18 |
| TypeScript | 5.x |
| Vite | 5.x |
| TailwindCSS | 3.x |
| Rust | 1.70+ |

## 开发环境要求

- Windows 10/11
- Node.js >= 18
- Rust >= 1.70
- Visual Studio Build Tools (Windows SDK)

## 快速开始

```bash
# 安装依赖
npm install

# 安装 Tauri CLI
npm install -g @tauri-apps/cli

# 开发模式
npm run tauri:dev

# 构建生产版本
npm run tauri:build
```

## 项目结构

```
Task_NeXus_Pro/
├── src/                    # React 前端源码
│   ├── components/        # UI 组件
│   ├── data/              # CPU 数据库
│   ├── hooks/             # 自定义 Hooks
│   └── types.ts           # TypeScript 类型定义
├── src-tauri/             # Rust 后端源码
│   ├── src/               # Rust 核心模块
│   └── tauri.conf.json    # Tauri 配置
├── docs/                  # 项目文档
└── workflows/             # 游戏配置文件
```

## 核心模块

- **Governor Engine** - 进程管理与调度核心
- **Hardware Detection** - 硬件拓扑检测
- **Game Watchdog** - 游戏模式监控
- **System Tweaks** - 系统优化配置

## 系统要求

- Windows 10 2004+ 或 Windows 11
- 64位处理器
- 管理员权限（用于进程调度）

## 许可证

MIT License

---

*Task Nexus Pro 是 Task NeXus 的专业版本，采用 Tauri v2 架构重构，性能更优、资源占用更低。*
