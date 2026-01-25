# Process Monitor Refactor: Push Architecture & Virtual Scrolling

## 1. Backend Implementation (Rust)

### Goal
Switch from frontend polling to a backend "Push" model using a background thread and Tauri Events. Combine `sysinfo` for cross-platform basics with `windows-rs` for low-level details (Affinity, Priority).

### Data Structure (`lib.rs`)

Update `ProcessInfo` to match the required fields:

```rust
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_usage: u64, // Bytes, frontend formats to MB/GB
    pub priority: String,
    pub cpu_affinity: String, // "0-15" or hex mask string
    pub thread_count: u32,
    pub user: String,
    pub path: String,
}
```

### Monitoring Logic (`monitor.rs` / `governor.rs`)

1.  **Background Task**:
    - Spawn a `tokio` or `std::thread` loop on app startup.
    - Interval: 1000ms.
2.  **Data Collection**:
    - **Sysinfo**: PID, Name, CPU, Memory, User, Path.
    - **WinAPI**:
        - `OpenProcess` with `PROCESS_QUERY_INFORMATION`.
        - `GetPriorityClass` -> Priority.
        - `GetProcessAffinityMask` -> Affinity Map.
        - `GetProcessHandleCount` / `NtQueryInformationProcess` -> Thread Count (or use sysinfo's thread count if accurate enough).
        - *Optimization*: Only Query WinAPI for visible/active processes if performance drops, but for <1000 processes, full query every 1s is usually fine in Rust.
3.  **Event Emission**:
    - Use `app_handle.emit("process-update", payload)`.

## 2. Frontend Implementation (React)

### Dependencies
- `@tanstack/react-virtual`: For high-performance rendering of large lists.

### Component Design (`ProcessScanner.jsx`)

1.  **Event Listener**:
    - `listen('process-update', (event) => setProcesses(event.payload))` in `useEffect`.
2.  **Virtualizer**:
    - Use `useVirtualizer` hook on the process list container.
    - Render only visible rows.
3.  **Sorting**:
    - Maintain `sortConfig` state (key, direction).
    - Sort the `processes` array *before* passing it to the virtualizer.

### Step-by-Step Plan

1.  **Backend**:
    - [ ] Update `ProcessInfo` struct in `lib.rs`.
    - [ ] Create `src/monitor.rs` to handle the loop.
    - [ ] Integrate `monitor::start_monitoring(app_handle)` in `main.rs`.
2.  **Frontend**:
    - [ ] Install `@tanstack/react-virtual`.
    - [ ] Refactor `ProcessScanner.jsx` to use `listen()` instead of `setInterval`.
    - [ ] Implement `VirtualWindow` for the table body.

## 3. Formatting Standards

- **Memory**: Auto-scale (KB -> MB -> GB).
- **CPU**: Fixed point 1 decimal (e.g., "12.5%").
- **Affinity**: Show readable range if possible, or Hex for complex masks.
