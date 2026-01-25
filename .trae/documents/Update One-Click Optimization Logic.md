我将更新 `src-tauri/src/optimizer.rs` 中的优化逻辑，以整合您提供的全面调整内容。这将涉及扩展现有的优化功能，以包含新的键盘、鼠标、系统和网络优化。

### 计划详情

**1. 更新 `src-tauri/src/optimizer.rs`**
我将重构后端逻辑，将您提供的脚本映射到“第三页”（一键优化）上的三个现有类别中：

*   **系统延迟优化 (`optimize_latency`)**:
    *   **添加键盘优化**: 应用 `KeyboardSpeed`, `KeyboardDelay`, `BounceTime` 等注册表项。
    *   **添加鼠标优化**: 应用 `MouseThreshold`, `MouseSpeed`, `TIPC`, `mouhid` 等注册表项。
    *   **更新系统调整**:
        *   添加 `bcdedit /set useplatformtick yes`。
        *   设置 `SystemResponsiveness` 为 0。
        *   禁用 **Spectre 和 Meltdown** 缓解措施（注册表项）。
        *   禁用 **进程缓解 (Process Mitigations)** (DEP, SEHOP 等，通过 PowerShell)。

*   **网络协议栈优化 (`optimize_network`)**:
    *   **添加通用网络调整**: 执行 `ipconfig /flushdns`, `netsh winsock reset` 等。
    *   **添加省电调整**: 通过 PowerShell 禁用 USB 和以太网的省电功能。
    *   **添加禁用遥测 (Telemetry)**: 应用您提供的全面的遥测相关注册表项。

*   **电源与 GPU 策略 (`optimize_power_gpu`)**:
    *   保留现有的逻辑（高性能计划、核心停车），因为它与通用的“一键优化”目标一致，同时确保没有冲突。

**2. 实施策略**
*   我将使用 Rust 的 `std::process::Command` 来执行 `reg add`, `powershell`, 和 `bcdedit` 命令，确保与提供的脚本格式兼容。
*   我将尽可能实现“还原” (`enable: false`) 逻辑，将值设置回 Windows 默认值（例如 `KeyboardDelay=1`，重新启用缓解措施），以确保“恢复默认设置”按钮能够安全工作。

**3. 验证**
*   我将验证代码是否编译成功。
*   “第三页”的 UI 将保持不变，但底层的“一键优化”按钮现在将触发这些更强大的脚本。
