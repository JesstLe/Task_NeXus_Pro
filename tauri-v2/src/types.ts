export interface CpuInfo {
    model: string;
    vendor?: string;
    cores: number;
    logical_cores?: number;
    physical_cores?: number;
    speed?: number;
}

export interface CpuArch {
    type: string;
    isHybrid?: boolean;
    pCores?: number;
    eCores?: number;
}

export interface TopologyCore {
    id: number;
    core_type: string;
    cpus: number[];
}

export interface LogicalCore {
    id: number;
    core_type: 'Performance' | 'Efficiency' | 'VCache' | 'Unknown';
    physical_id: number;
    group_id: number;
}

export interface ProcessInfo {
    pid: number;
    name: string;
    user?: string;
    priority?: string;
    cpu_usage?: number;
    memory_usage?: number;
    cpu_affinity?: string;
    path?: string;
    parent_pid?: number;
}

export interface ProcessProfile {
    name: string;
    affinity: string;
    mode: string;
    priority: string;
    primaryCore: number | null;
    timestamp: number;
}

export interface SmartTrimSettings {
    enabled: boolean;
    threshold: number;
    mode: 'standby-only' | 'working-set';
}

export interface AppSettings {
    profiles?: ProcessProfile[];
    defaultRules?: {
        enabled: boolean;
    };
    gameList?: string[];
    proBalance?: {
        enabled: boolean;
        cpuThreshold: number;
    };
    smartTrim?: SmartTrimSettings;
    throttleList?: string[];
    launchOnStartup?: boolean;
    closeToTray?: boolean;
    startMinimized?: boolean;
    mode?: string;
}

export interface ToastInfo {
    id: number;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
    duration?: number;
}

export interface TimeBombStatus {
    is_expired: boolean;
    expiration_date: string;
    current_date: string;
    days_remaining: number;
    verification_source: string;
}
