---
description: Build and release portable EXE to tn_new folder
---

# Task_NeXus Release Build Workflow

## Versioning Rule

- **Initial Version**: V3.0.0
- **Increment Rule**: 满10进1 (Decimal-like versioning)
  - Patch (Z in X.Y.Z): 0-9, when reaching 10, reset to 0 and increment Minor.
  - Minor (Y in X.Y.Z): 0-9, when reaching 10, reset to 0 and increment Major.
  - Example: `3.0.9` → `3.1.0` → `3.1.9` → `3.2.0` → ... → `3.9.9` → `4.0.0`

## Current Version

**V3.0.9** (Released 2026-01-04)

## Build Steps

1. **Update version in Cargo.toml** (if needed):
   ```powershell
   # Edit e:\Documents\WorkSpace\Task_NeXus\Task_NeXus\tauri-v2\src-tauri\Cargo.toml
   # Change: version = "X.Y.Z"
   ```

2. **Build Release**:
   // turbo
   ```powershell
   cd e:\Documents\WorkSpace\Task_NeXus\Task_NeXus\tauri-v2
   npm run tauri build
   ```

3. **Copy Portable EXE to Output Folder**:
   // turbo
   ```powershell
   $version = "3.0.0"
   $src = "e:\Documents\WorkSpace\Task_NeXus\Task_NeXus\tauri-v2\src-tauri\target\release\task-nexus.exe"
   $dest = "E:\Documents\WorkSpace\tn_new"
   if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force }
   Copy-Item $src "$dest\Task_NeXus_V$version.exe" -Force
   ```

4. **Update this file** with the new current version after each release.

## Output Location

`E:\Documents\WorkSpace\tn_new\Task_NeXus_V{version}.exe`
