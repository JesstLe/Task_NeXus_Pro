//! Task NeXus Lite - Core Module
//! 
//! 高内聚低耦合的核心调度模块集合。
//! 包含进程管理、线程绑定、硬件拓扑检测等核心能力。

pub mod types;
pub mod topology;
pub mod governor;
pub mod thread;
pub mod config;

pub use types::*;
pub use config::{AppConfig, set_auto_start};
