# Task Nexus 代码安全审计报告

## 1. 总体结论

**安全等级：中等偏上 (B+)**

除已知的激活模块（硬编码密钥）风险外，核心代码安全性良好。
Tauri v2 的架构本身提供了很强的安全边界，Rust 后端的类型安全和内存安全特性消除了大量传统漏洞（如缓冲区溢出）。

但仍存在一些**配置不当**和**潜在风险点**，主要集中在 CSP（内容安全策略）缺失和部分高权限 API 的使用上。

---

## 2. 详细审计发现

### A. 严重风险 (Critical)
*   **CSP (Content Security Policy) 未启用**
    *   **位置**: `tauri.conf.json` -> `app.security.csp: null`
    *   **风险**: 如果前端受到 XSS 攻击（例如通过恶意的进程名注入），攻击者可以加载远程脚本并执行任意 Tauri 命令。
    *   **建议**: 必须配置严格的 CSP，禁止加载外部脚本。

### B. 中等风险 (Medium)
*   **命令注入风险 (Command Injection)**
    *   **位置**: `power.rs` -> `delete_power_plan`
    *   **代码**: `Command::new("powercfg").args(["/delete", &guid])`
    *   **分析**: 虽然有 `is_guid` 检查，但如果在调用前绕过检查，理论上存在注入风险。
    *   **建议**: 确保 `guid` 参数经过严格的正则验证 (`^[0-9a-fA-F-]{36}$`) 再传入命令。
*   **注册表操作风险**
    *   **位置**: `tweaks.rs`
    *   **代码**: 直接拼接 `reg add` 命令字符串。
    *   **风险**: 如果 `tweak` 的 ID 或参数来自用户输入，可能导致注册表被恶意篡改。目前看 ID 是硬编码的，风险较低，但建议改用 `winreg` crate 进行结构化操作，而非拼接 shell 命令。

### C. 低风险 (Low)
*   **Unsafe 代码块**
    *   **位置**: `governor.rs`, `monitor.rs` 等
    *   **分析**: 大量使用了 `unsafe` 块来调用 Windows API (Win32)。这是高性能系统工具的常态，且代码逻辑看起来是正确的，没有明显的内存泄漏或指针错误。
    *   **建议**: 保持现状，但在修改这些文件时需格外小心。
*   **前端 `dangerouslySetInnerHTML`**
    *   **位置**: 未发现。
    *   **分析**: 前端代码使用了 React 标准渲染，未发现直接操作 DOM 注入 HTML 的情况，XSS 风险较低（前提是开启 CSP）。

---

## 3. 改进建议清单

1.  **[必须] 启用 CSP**:
    在 `tauri.conf.json` 中设置：
    ```json
    "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: asset:;"
    ```

2.  **[建议] 增强输入验证**:
    在 `main.rs` 的 Tauri 命令入口处，对所有输入参数（如 PID、GUID、文件路径）进行严格的类型和格式校验。

3.  **[建议] 移除 Shell 命令拼接**:
    尽量使用 Rust 原生库（如 `winreg`）替代 `Command::new("reg").arg(...)`，减少被注入的攻击面。

4.  **[建议] 限制文件访问范围**:
    目前 `fs::write` (在 `config.rs` 中) 似乎没有严格限制写入路径。建议使用 Tauri 的 `fs` scope 功能，限制只能读写 `AppConfig` 目录。
