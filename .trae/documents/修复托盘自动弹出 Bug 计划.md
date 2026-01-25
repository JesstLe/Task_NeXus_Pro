我已定位到 bug 原因：在 `src/ui/tray.rs` 中，托盘事件监听器**未过滤事件类型**，导致鼠标悬停（`Enter`/`Move` 事件）也会触发"显示窗口"逻辑。

### 修复计划

1.  **引入事件类型**：
    在 `src/ui/tray.rs` 中引入 `tray_icon::TrayIconEvent` 和 `tray_icon::MouseButton`。

2.  **添加事件过滤**：
    修改托盘事件监听循环，使用 `match` 语句只响应 **左键点击 (Click)** 和 **左键双击 (DoubleClick)** 事件。忽略鼠标悬停、移动等其他干扰事件。

    ```rust
    // 修复逻辑示意
    match event {
        TrayIconEvent::Click { button: MouseButton::Left, .. } | 
        TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } => {
            // 执行显示窗口逻辑
        }
        _ => {} // 忽略悬停等其他事件
    }
    ```

3.  **验证**：
    虽然我无法直接操作鼠标验证，但从代码逻辑上，此修改将从根本上切断"悬停触发"的路径。

此修复仅涉及 `src/ui/tray.rs` 一个文件，符合最小修改原则。