import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ProcessScanner from './components/ProcessScanner';
import CoreGrid from './components/CoreGrid';
import ControlBar from './components/ControlBar';
import SettingsPanel from './components/settings/SettingsPanel';
import ManualOptimizer from './components/ManualOptimizer';
import AdvancedPanel from './components/AdvancedPanel';
import Toast, { ToastContainer } from './components/Toast';
import ActivationDialog from './components/ActivationDialog';
import OneClickOptimizer from './components/OneClickOptimizer';
import { Activity, Settings, Zap, SlidersHorizontal, AlertOctagon } from 'lucide-react';
import { getCpuArchitecture } from './data/cpuDatabase';
import { invoke } from '@tauri-apps/api/core';
import {
    CpuInfo,
    CpuArch,
    ProcessInfo,
    AppSettings,
    ToastInfo,
    ProcessProfile,
    LogicalCore,
    TimeBombStatus
} from './types';

function App() {
    const [cpuInfo, setCpuInfo] = useState<CpuInfo | null>(null);
    const [cpuArch, setCpuArch] = useState<CpuArch | null>(null);
    const [processes, setProcesses] = useState<ProcessInfo[]>([]);
    const [scanning, setScanning] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedPid, setSelectedPid] = useState<number | null>(null);
    const [selectedCores, setSelectedCores] = useState<number[]>([]);
    const [mode, setMode] = useState('dynamic');
    const [status, setStatus] = useState('standby');
    const [primaryCore, setPrimaryCore] = useState('auto');
    const [settings, setSettings] = useState<AppSettings>({});
    const [priority, setPriority] = useState('Normal');
    const [toasts, setToasts] = useState<ToastInfo[]>([]);
    const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set());
    const [topology, setTopology] = useState<LogicalCore[]>([]);

    useEffect(() => {
        invoke<LogicalCore[]>('get_cpu_topology').then(setTopology).catch(console.error);
    }, []);
    const [isActivated, setIsActivated] = useState(true);
    const [expirationStatus, setExpirationStatus] = useState<TimeBombStatus | null>(null);

    const showToast = (message: string, type: ToastInfo['type'] = 'success', duration = 3000) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type, duration }]);
    };

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    };

    const refreshSettings = async () => {
        try {
            const savedSettings = await invoke<AppSettings>('get_settings');
            setSettings(savedSettings || {});
            if (savedSettings?.mode) {
                setMode(savedSettings.mode);
            }
        } catch (err) {
            console.error('刷新设置失败:', err);
        }
    };

    useEffect(() => {
        async function init() {
            setLoading(true);
            setError(null);
            try {
                const info = await invoke<CpuInfo>('get_cpu_info');
                if (!info || !info.cores || info.cores <= 0) {
                    throw new Error('获取 CPU 信息失败');
                }
                setCpuInfo(info);

                const savedSettings = await invoke<AppSettings>('get_settings');
                setSettings(savedSettings || {});
                if (savedSettings?.mode) {
                    setMode(savedSettings.mode);
                }

                const licenseStatus = await invoke<{ activated: boolean }>('get_license_status');
                setIsActivated(licenseStatus.activated);

                // Run Time Bomb Check
                if (licenseStatus.activated) {
                    const bombStatus = await invoke<TimeBombStatus>('check_expiration');
                    if (bombStatus.is_expired) {
                        setExpirationStatus(bombStatus);
                        setLoading(false);
                        return; // Stop initialization
                    }
                }

                const arch = getCpuArchitecture(info.model);
                setCpuArch(arch);

                // Default: select physical cores
                const physicalCores = Array.from({ length: info.cores }, (_, i) => i).filter(i => i % 2 === 0);
                setSelectedCores(physicalCores);
            } catch (err) {
                console.error('初始化失败:', err);
                setError((err as any).message || '初始化失败');
            } finally {
                setLoading(false);
                handleScan();
            }
        }
        init();
    }, []);

    useEffect(() => {
        if (primaryCore !== 'auto' && selectedCores.length > 0) {
            const primaryIdx = parseInt(primaryCore, 10);
            if (!isNaN(primaryIdx) && !selectedCores.includes(primaryIdx)) {
                setPrimaryCore('auto');
            }
        }
    }, [selectedCores, primaryCore]);

    const handleScan = async () => {
        if (scanning) return;
        setScanning(true);
        setError(null);

        const timeoutId = setTimeout(() => {
            setScanning(false);
        }, 20000);

        try {
            const list = await invoke<ProcessInfo[]>('get_processes');
            const sorted = Array.isArray(list) ? list.sort((a, b) => (b.cpu_usage || 0) - (a.cpu_usage || 0)) : [];
            setProcesses(sorted);
        } catch (e) {
            console.error('扫描失败:', e);
            setProcesses([]);
        } finally {
            clearTimeout(timeoutId);
            setScanning(false);
        }
    };

    const toggleCore = (index: number) => {
        const maxCore = (cpuInfo?.cores || 16) - 1;
        if (index < 0 || index > maxCore) return;
        setSelectedCores(prev =>
            prev.includes(index)
                ? prev.filter(i => i !== index)
                : [...prev, index].sort((a, b) => a - b)
        );
    };

    const createCoreSelector = (filterFn: (i: number) => boolean) => () => {
        const count = cpuInfo?.cores || 16;
        if (count <= 0) return;
        setSelectedCores(Array.from({ length: count }, (_, i) => i).filter(filterFn));
    };

    const selectPhysical = createCoreSelector(i => i % 2 === 0);
    const selectSMT = createCoreSelector(i => i % 2 !== 0);
    const selectAll = createCoreSelector(() => true);
    const selectNone = () => setSelectedCores([]);

    const selectPartition0 = () => {
        const count = cpuInfo?.cores || 16;
        if (cpuArch?.type === 'INTEL_HYBRID' && cpuArch.isHybrid && cpuArch.pCores) {
            const pThreads = cpuArch.pCores * 2;
            setSelectedCores(Array.from({ length: pThreads }, (_, i) => i));
        } else {
            const halfCores = Math.floor(count / 2);
            setSelectedCores(Array.from({ length: halfCores }, (_, i) => i));
        }
    };

    const selectPartition1 = () => {
        const count = cpuInfo?.cores || 16;
        if (cpuArch?.type === 'INTEL_HYBRID' && cpuArch.isHybrid && cpuArch.pCores && cpuArch.eCores) {
            const pThreads = cpuArch.pCores * 2;
            setSelectedCores(Array.from({ length: cpuArch.eCores }, (_, i) => i + pThreads));
        } else {
            const halfCores = Math.floor(count / 2);
            setSelectedCores(Array.from({ length: halfCores }, (_, i) => i + halfCores));
        }
    };

    const handleSettingChange = async (key: string, value: any) => {
        setSettings(prev => ({ ...prev, [key]: value }));
        try {
            const result = await invoke<{ success: boolean }>('set_setting', { key, value });
            if (result.success) {
                const settingNames: Record<string, string> = {
                    launchOnStartup: '开机自启动',
                    closeToTray: '关闭时最小化',
                    defaultRules: '默认规则'
                };
                const settingName = settingNames[key] || key;

                // Special handling for autostart
                if (key === 'launchOnStartup') {
                    try {
                        await invoke('set_admin_autostart', { enable: value });
                    } catch (err) {
                        console.error('Failed to set autostart:', err);
                        showToast(`自启动设置失败: ${err}`, 'error');
                        return; // Stop if autostart setup failed
                    }
                }

                const isEnabled = typeof value === 'object' && value !== null ? !!value.enabled : !!value;
                showToast(`${settingName}已${isEnabled ? '启用' : '禁用'}`, 'success');
            }
        } catch (e) {
            console.error(e);
            showToast('设置失败', 'error');
        }
    };

    const handleApply = async () => {
        setError(null);
        if (!selectedPid) {
            showToast('请先选择目标程序', 'warning');
            return;
        }
        if (selectedCores.length === 0) {
            showToast('请至少选择一个核心', 'warning');
            return;
        }

        let primaryCoreValue: number | null = null;
        if (primaryCore !== 'auto') {
            const primaryIdx = parseInt(primaryCore, 10);
            if (selectedCores.includes(primaryIdx)) {
                primaryCoreValue = primaryIdx;
            } else {
                showToast('优先核心必须在已选择的核心中', 'warning');
                return;
            }
        }

        let mask = 0n;
        selectedCores.forEach(core => {
            mask |= (1n << BigInt(core));
        });

        try {
            const result = await invoke<{ success: boolean, error?: string }>('set_affinity', {
                pid: selectedPid,
                coreMask: mask.toString(),
                mode,
                primaryCore: primaryCoreValue
            });

            let prioritySuccess = true;
            try {
                await invoke('set_process_priority', { pid: selectedPid, priority });
            } catch (e) {
                console.error(`Priority set failed`, e);
                prioritySuccess = false;
            }

            if (result.success) {
                setStatus('active');
                const statusMsg = prioritySuccess ? ` | 优先级: ${priority}` : ' (优先级设置失败)';
                showToast(`已应用到进程 ${selectedPid}${statusMsg}，必须点击清理内存`, 'success', 5000);

                if (mode === 'dynamic') {
                    await invoke('clear_memory').catch(() => { });
                }
            } else {
                showToast(result.error || '设置失败', 'error');
            }
        } catch (err) {
            showToast((err as any).message || '应用失败', 'error');
        }
    };

    const handleSaveProfile = async () => {
        if (!selectedPid) {
            showToast('请选择目标程序', 'warning');
            return;
        }
        const process = processes.find(p => p.pid === selectedPid);
        if (!process) return;

        let primaryCoreValue: number | null = null;
        if (primaryCore !== 'auto') {
            const primaryIdx = parseInt(primaryCore, 10);
            if (selectedCores.includes(primaryIdx)) primaryCoreValue = primaryIdx;
        }

        let mask = 0n;
        selectedCores.forEach(core => {
            mask |= (1n << BigInt(core));
        });

        const profile: ProcessProfile = {
            name: process.name,
            affinity: mask.toString(),
            mode: mode,
            priority: priority,
            primaryCore: primaryCoreValue,
            timestamp: Date.now()
        };

        try {
            const result = await invoke<any>('add_profile', { profile });
            if (result && result.profiles) {
                setSettings(prev => ({ ...prev, profiles: result.profiles }));
            }
            setStatus('active');
            showToast(`策略已保存: ${process.name} `, 'success');
        } catch (err) {
            console.error(err);
            showToast('保存策略失败', 'error');
        }
    };

    const handleRemoveProfile = async (name: string) => {
        try {
            const result = await invoke<any>('remove_profile', { name });
            if (result && result.profiles) {
                setSettings(prev => ({ ...prev, profiles: result.profiles }));
            }
            showToast(`已删除策略: ${name} `, 'success');
        } catch (err) {
            console.error(err);
            showToast('删除策略失败', 'error');
        }
    };

    const coreCount = cpuInfo?.cores || 16;
    const cores = Array.from({ length: coreCount }, (_, i) => i);
    const [activeTab, setActiveTab] = useState('dashboard');

    if (loading) {
        return (
            <div className="flex flex-col h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-violet-50">
                <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-slate-400 mt-4 font-medium">正在初始化...</p>
            </div>
        );
    }

    if (error && !cpuInfo) {
        return (
            <div className="flex flex-col h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-violet-50">
                <div className="bg-white rounded-2xl p-8 shadow-soft text-center max-w-sm">
                    <div className="text-red-500 text-4xl mb-4">⚠️</div>
                    <h2 className="text-lg font-bold text-slate-700 mb-2">初始化失败</h2>
                    <p className="text-slate-500 text-sm mb-6">{error}</p>
                    <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-violet-500 text-white rounded-xl font-medium">重试</button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50 overflow-hidden">
            {expirationStatus?.is_expired && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center animate-in zoom-in duration-300">
                        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertOctagon size={40} className="text-red-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">内测版本已过期</h2>
                        <p className="text-slate-500 mb-6">
                            感谢您参与本次内测。该版本已于 <span className="font-bold text-slate-700">{expirationStatus.expiration_date}</span> 停止服务。
                            <br />请下载最新的正式版以继续使用。
                        </p>
                        <div className="bg-slate-50 rounded-xl p-4 mb-8 text-left text-xs text-slate-400 font-mono space-y-1">
                            <div className="flex justify-between">
                                <span>当前时间:</span>
                                <span>{expirationStatus.current_date}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>截止日期:</span>
                                <span>{expirationStatus.expiration_date}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>校验来源:</span>
                                <span>{expirationStatus.verification_source}</span>
                            </div>
                        </div>
                        <button
                            onClick={() => invoke('window_close')}
                            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl active:scale-95"
                        >
                            退出程序
                        </button>
                    </div>
                </div>
            )}
            {!isActivated && <ActivationDialog onActivated={() => setIsActivated(true)} />}
            <Header cpuModel={cpuInfo?.model} />

            <div className="flex justify-center mt-4 mb-2">
                <div className="bg-white/50 backdrop-blur-md p-1 rounded-xl flex gap-3 shadow-sm border border-slate-200/50">
                    <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-violet-500 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <Activity size={16} /><span>核心调度</span>
                    </button>
                    <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'settings' ? 'bg-violet-500 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <Settings size={16} /><span>设置</span>
                    </button>
                    <button onClick={() => setActiveTab('one_click')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'one_click' ? 'bg-violet-500 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <Zap size={16} /><span>一键优化</span>
                    </button>
                    {/* <button onClick={() => setActiveTab('optimizer')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'optimizer' ? 'bg-violet-500 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <SlidersHorizontal size={16} /><span>自定义线程序列调试</span>
                    </button> */}
                    {/* 暂时隐藏高级选项============================================================================================================== */}
                    {/* <button onClick={() => setActiveTab('advanced')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'advanced' ? 'bg-violet-500 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                        <SlidersHorizontal size={16} /><span>高级选项</span>
                    </button> */}
                </div>
            </div>

            <ToastContainer toasts={toasts} removeToast={removeToast} />

            <div className="flex-1 min-h-0 p-4 md:p-6 overflow-y-auto">
                <div className="max-w-6xl mx-auto flex flex-col space-y-6">
                    {activeTab === 'dashboard' && (
                        <>
                            <ProcessScanner
                                processes={processes}
                                selectedPid={selectedPid}
                                onSelect={setSelectedPid}
                                onScan={handleScan}
                                scanning={scanning}
                                selectedPids={selectedPids}
                                setSelectedPids={setSelectedPids}
                                showToast={showToast}
                                mode={mode}
                                setMode={setMode}
                                settings={settings}
                                onRefreshSettings={refreshSettings}
                            />
                            <CoreGrid
                                cores={cores}
                                selectedCores={selectedCores}
                                onToggleCore={toggleCore}
                                onSelectAll={selectAll}
                                onSelectNone={selectNone}
                                onSelectPhysical={selectPhysical}
                                onSelectSMT={selectSMT}
                                cpuArch={cpuArch}
                                onSelectPartition0={selectPartition0}
                                onSelectPartition1={selectPartition1}
                            />
                        </>
                    )}

                    {activeTab === 'settings' && (
                        <SettingsPanel
                            mode={mode}
                            onModeChange={setMode}
                            settings={settings}
                            onSettingChange={handleSettingChange}
                            onRemoveProfile={handleRemoveProfile}
                            processes={processes}
                        />
                    )}

                    {activeTab === 'one_click' && (
                        <OneClickOptimizer showToast={showToast} />
                    )}

                    {activeTab === 'optimizer' && (
                        <ManualOptimizer
                            processes={processes}
                            topology={topology as any}
                            showToast={showToast}
                            onScan={handleScan}
                        />
                    )}

                    {activeTab === 'advanced' && <AdvancedPanel />}
                </div>
            </div>

            {activeTab === 'dashboard' && (
                <div className="glass border-t border-slate-200/50 px-6 py-4 flex-shrink-0">
                    <div className="max-w-6xl mx-auto">
                        <ControlBar
                            status={status}
                            onApplyConfig={handleApply}
                            onStop={() => { setStatus('standby'); setPriority('Normal'); }}
                            onSaveProfile={handleSaveProfile}
                            cpuInfo={cpuInfo}
                            priority={priority}
                            onPriorityChange={setPriority}
                            showToast={showToast}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
