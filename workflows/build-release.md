---
description: 构建并发布便携版 EXE 到输出目录
---

# Task_NeXus 发布构建流程

## 版本号规则

- 初始版本：V3.0.0
- 递增规则：满 10 进 1（类十进制版本号）
  - Patch（X.Y.Z 的 Z）：0-9，到 10 归零并将 Minor +1
  - Minor（X.Y.Z 的 Y）：0-9，到 10 归零并将 Major +1
  - 示例：`3.0.9` → `3.3.0` → `3.3.9` → `3.4.0` → … → `3.9.9` → `4.0.0`

## 当前版本

**V3.4.0**（发布于 2026-01-26）

## 构建步骤

1. 更新版本号（如需）：
   ```powershell
   # 编辑 e:\Documents\WorkSpace\TN\src-tauri\Cargo.toml
   # 修改：version = "X.Y.Z"
   ```

2. 构建 Release：
   ```powershell
   cd e:\Documents\WorkSpace\TN
   npm run tauri:build
   ```

3. 复制便携版 EXE 到输出目录：
   ```powershell
   $version = "3.4.0"
   $src = "e:\Documents\WorkSpace\TN\src-tauri\target\release\task-nexus.exe"
   $dest = "E:\Documents\WorkSpace\tn_new"
   if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force }
   Copy-Item $src "$dest\Task_NeXus_V$version.exe" -Force
   ```

4. 每次发布后，更新本文件的“当前版本”。

## 输出位置

`E:\Documents\WorkSpace\tn_new\Task_NeXus_V{version}.exe`
