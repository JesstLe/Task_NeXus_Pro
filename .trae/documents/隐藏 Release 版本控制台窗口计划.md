我将修复程序启动时出现的黑色命令行窗口问题。

### 问题原因
Rust 在 Windows 上默认编译为控制台应用程序（Console Subsystem），因此运行时会弹出一个命令行窗口。要构建纯 GUI 应用程序，需要指定 Windows 子系统。

### 修复方案
在 `src/main.rs` 的开头添加 `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` 属性。
这会让编译器在 Release 模式（非调试模式）下使用 Windows 子系统，从而隐藏控制台窗口；而在 Debug 模式下保留控制台，方便查看日志。

### 执行步骤
1.  **修改代码**：编辑 `src/main.rs`。
2.  **重新构建**：执行 `cargo build --release` 重新生成可执行文件。

我将立即执行修改。