我已在 `tauri-lite-refactored` 中确认使用了 `SetProcessAffinityMask`（硬限制）。根据您的要求，我将把该项目中的硬亲和性设置替换为软限制 `SetThreadIdealProcessor`（注：对于进程级别的设置，更准确的对应 API 是 `SetProcessDefaultCpuSets` 或遍历主线程设置理想处理器，但根据您的指示，我将尝试使用“理想处理器”的概念进行替换，不过需要说明 `SetThreadIdealProcessor` 是针对**线程**的，而 `SetProcessAffinityMask` 是针对**进程**的。为了实现对进程的“软限制”，通常的做法是遍历该进程的所有线程并分别设置，或者设置进程的默认 CPU 集）。

鉴于 `SetThreadIdealProcessor` 只能设置一个核心作为理想核心，而原有的 `SetProcessAffinityMask` 支持多核掩码（如 `0x0F` 表示前4核），直接的一对一替换在语义上是不等价的（硬限制可以是一组核心，理想核心只能是一个）。

**调整后的技术方案：**
为了符合“软限制”且支持多核选择的目标，最佳的 Win32 API 替代方案是 **`SetProcessDefaultCpuSets`**。它允许为进程设置一组“首选”核心，系统调度器会尽量遵守但允许溢出，完全符合“软建议”的定义。

但是，如果您坚持使用 `SetThreadIdealProcessor` 语义（即“第一优先核心”模式），那么对于多核选择的情况，我们将面临逻辑冲突（选了4个核，但理想核心只能设1个）。

**考虑到您之前的指令是“统一改成软限制 SetThreadIdealProcessor”**，我将采取以下策略：
1.  **智能转换**：当用户选择多个核心时，取**第一个核心**（或掩码中最低位的核心）作为 `SetThreadIdealProcessor` 的目标。
2.  **或者更优方案**：使用 **`SetProcessDefaultCpuSets`**（如果目标系统支持 Win10+）。这是真正的“多核软限制”。

**决定：**
为了最准确地实现您的意图（软限制、建议系统优先、忙不过来去别的），我将把 `set_process_affinity` 的实现逻辑修改为使用 **`SetProcessDefaultCpuSets`**。这能完美替代 `SetProcessAffinityMask` 的多核掩码功能，同时由“硬锁”变为“软建议”。

### 执行计划

1.  **Core 层修改 (`src/core/governor.rs`)**:
    *   修改 `set_process_affinity` 函数。
    *   移除 `SetProcessAffinityMask` 调用。
    *   引入 `SetProcessDefaultCpuSets` (需检查 `windows` crate 是否包含 `Win32_System_SystemInformation` 或相关 feature)。
    *   **逻辑转换**：将传入的十六进制掩码字符串解析为 `u32` 核心 ID 列表（CpuSet IDs），然后调用新 API。
    *   *备选*：如果 `SetProcessDefaultCpuSets` 不可用或依赖复杂，则退化为遍历进程线程并对主线程调用 `SetThreadIdealProcessor`（但这会丢失多核选择的意义）。我将优先尝试 CPU Sets。

2.  **验证**：
    *   确认编译通过。
    *   确认 UI 上的多核选择（如选择前4核）能正确转化为软限制。

**补充说明**：您提到的“模式1”已经实现了单线程的理想核心设置。现在的任务是将**整个进程**的亲和性设置（UI上的核心选择+应用）也改为软限制。

*修正*：用户明确说“统一改成软限制 SetThreadIdealProcessor”。如果我用 CpuSets 可能不符合字面要求，但符合功能要求。**如果用户坚持要 `SetThreadIdealProcessor`**，那么当用户在 UI 上选了多个核时，我只能对**所有线程**循环设置**同一个**理想核心（通常选第一个），这其实大大削弱了多核优化的能力。

**最终方案**：我将使用 `SetThreadIdealProcessor` 遍历设置进程中的关键线程（或所有线程），将它们“建议”分配到用户所选核心中的**某一个**（例如轮询分配，或者全部挤在第一个）。为了保持性能，**我建议实现为：将掩码中的第一个核心设为 ideal processor**。

**Update**: 仔细阅读需求，“技术原理：这对应的 Win32 API 是 SetThreadIdealProcessor... 点击模式1后先不执行...”。
现在用户的指令是：“检测lite版本中是否使用了SetProcessAffinityMask... 如果有，统一改成软限制SetThreadIdealProcessor”。
这意味着把原有的“应用亲和性”逻辑（硬锁）彻底废弃，改为软锁。

**实施步骤**:
1.  修改 `src/core/governor.rs`。
2.  重写 `set_process_affinity`。
3.  解析掩码，找到第一个被选中的核心 ID。
4.  遍历目标进程的所有线程（使用 `CreateToolhelp32Snapshot`）。
5.  对每个线程调用 `SetThreadIdealProcessor`，将其指向选中的那个核心。
    *   *优化*：如果用户选了多个核，可以尝试将线程分散建议到这些核上（Round-Robin），或者简单地全部建议到第一个核。为了简单可靠，我将实现**Round-Robin（轮询）分配**，即把线程均匀地“建议”到用户选定的那些核心上。

### 计划详情
1.  **修改 `src/core/governor.rs`**:
    *   引入 `Thread32First`, `Thread32Next`, `OpenThread`, `SetThreadIdealProcessor` 等 API。
    *   重构 `set_process_affinity`:
        *   解析 hex mask 为核心 ID 列表 `Vec<u32>`。
        *   获取进程线程列表。
        *   遍历线程，依次调用 `SetThreadIdealProcessor(thread_handle, core_ids[i % core_ids.len()])`。
        *   这样既实现了“软限制”，又保留了多核负载均衡的能力。

此方案完美符合“统一改成软限制 SetThreadIdealProcessor”的要求，且比单一核心绑定更合理。