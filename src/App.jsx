
import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ProcessScanner from './components/ProcessScanner';
import CoreGrid from './components/CoreGrid';
import ControlBar from './components/ControlBar';
import SettingsPanel from './components/SettingsPanel';
import SystemOptimizer from './components/SystemOptimizer';
import Toast, { ToastContainer } from './components/Toast';
import ActivationDialog from './components/ActivationDialog';
import { Activity, Settings, Zap } from 'lucide-react';
import { getCpuArchitecture } from './data/cpuDatabase';

function App() {
  const [cpuInfo, setCpuInfo] = useState(null);
  const [cpuArch, setCpuArch] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPid, setSelectedPid] = useState(null);
  const [selectedCores, setSelectedCores] = useState([]);
  const [mode, setMode] = useState('dynamic');
  const [status, setStatus] = useState('standby');
  const [primaryCore, setPrimaryCore] = useState('auto');
  const [settings, setSettings] = useState({});
  const [priority, setPriority] = useState('Normal');
  const [toasts, setToasts] = useState([]);
  const [selectedPids, setSelectedPids] = useState(new Set());
  const [isActivated, setIsActivated] = useState(true); // Default true for smoother UX

  const showToast = (message, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);
      try {
        if (window.electron) {
          const info = await window.electron.getCpuInfo();
          if (!info || !info.cores || info.cores <= 0) {
            throw new Error('获取 CPU 信息失败');
          }
          setCpuInfo(info);

          const savedSettings = await window.electron.getSettings();
          setSettings(savedSettings || {});

          // 检查许可证状态
          const licenseStatus = await window.electron.getLicenseStatus();
          setIsActivated(licenseStatus.activated);

          // 检测 CPU 架构（AMD CCD 或 Intel 混合架构）
          const arch = getCpuArchitecture(info.model);
          setCpuArch(arch);

          const physicalCores = Array.from({ length: info.cores }, (_, i) => i).filter(i => i % 2 === 0);
          setSelectedCores(physicalCores);
        } else {
          // 预览模式 - 模拟双CCD处理器
          const mockInfo = { model: 'AMD Ryzen 9 7950X3D (Preview)', cores: 16 };
          setCpuInfo(mockInfo);
          const arch = getCpuArchitecture(mockInfo.model);
          setCpuArch(arch);
          setSelectedCores([0, 2, 4, 6, 8, 10, 12, 14]);
        }
      } catch (err) {
        console.error('初始化失败:', err);
        setError(err.message || '初始化失败');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // 当核心选择改变时，检查优先核心是否仍然有效
  useEffect(() => {
    if (primaryCore !== 'auto' && selectedCores.length > 0) {
      const primaryIdx = parseInt(primaryCore, 10);
      if (!isNaN(primaryIdx) && !selectedCores.includes(primaryIdx)) {
        // 优先核心不在新的选择列表中，重置为自动
        setPrimaryCore('auto');
      }
    }
  }, [selectedCores, primaryCore]);

  const handleScan = async () => {
    // Prevent concurrent scans - if already scanning, do nothing
    if (scanning) return;

    setScanning(true);
    setError(null);

    // Timeout protection - reset scanning state after 20 seconds max
    const timeoutId = setTimeout(() => {
      console.warn('Scan timeout - resetting state');
      setScanning(false);
    }, 20000);

    try {
      if (window.electron) {
        const list = await window.electron.getProcesses();
        // Sort by CPU usage descending (highest first)
        const sorted = Array.isArray(list) ? list.sort((a, b) => (b.cpu || 0) - (a.cpu || 0)) : [];
        setProcesses(sorted);
      } else {
        await new Promise(r => setTimeout(r, 500));
        setProcesses([
          { pid: 1234, name: 'cs2.exe', cpu: 45.2 },
          { pid: 5678, name: 'chrome.exe', cpu: 12.8 },
          { pid: 9101, name: 'steam.exe', cpu: 3.5 },
          { pid: 1122, name: 'discord.exe', cpu: 1.2 },
          { pid: 3344, name: 'obs64.exe', cpu: 8.7 },
        ]);
      }
    } catch (e) {
      console.error('扫描失败:', e);
      setProcesses([]);
    } finally {
      clearTimeout(timeoutId);
      setScanning(false);
    }
  };

  const toggleCore = (index) => {
    const maxCore = (cpuInfo?.cores || 16) - 1;
    if (index < 0 || index > maxCore) return;
    setSelectedCores(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index].sort((a, b) => a - b)
    );
  };

  const createCoreSelector = (filterFn) => () => {
    const count = cpuInfo?.cores || 16;
    if (count <= 0) return;
    setSelectedCores(Array.from({ length: count }, (_, i) => i).filter(filterFn));
  };

  const selectPhysical = createCoreSelector(i => i % 2 === 0);
  const selectSMT = createCoreSelector(i => i % 2 !== 0);
  const selectAll = createCoreSelector(() => true);
  const selectNone = () => setSelectedCores([]);

  // CCD/混合架构分区选择
  const selectPartition0 = () => {
    const count = cpuInfo?.cores || 16;
    if (cpuArch?.type === 'INTEL_HYBRID' && cpuArch.isHybrid) {
      // Intel: 选择 P-Core (前 pCores*2 个线程)
      const pThreads = cpuArch.pCores * 2;
      setSelectedCores(Array.from({ length: pThreads }, (_, i) => i));
    } else {
      // AMD 或其他: 选择前半部分
      const halfCores = Math.floor(count / 2);
      setSelectedCores(Array.from({ length: halfCores }, (_, i) => i));
    }
  };

  const selectPartition1 = () => {
    const count = cpuInfo?.cores || 16;
    if (cpuArch?.type === 'INTEL_HYBRID' && cpuArch.isHybrid) {
      // Intel: 选择 E-Core (从 pCores*2 开始)
      const pThreads = cpuArch.pCores * 2;
      const eThreads = cpuArch.eCores;
      setSelectedCores(Array.from({ length: eThreads }, (_, i) => i + pThreads));
    } else {
      // AMD 或其他: 选择后半部分
      const halfCores = Math.floor(count / 2);
      setSelectedCores(Array.from({ length: halfCores }, (_, i) => i + halfCores));
    }
  };

  const handleSettingChange = async (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    if (window.electron) {
      const result = await window.electron.setSetting(key, value);
      if (result.success) {
        const settingNames = {
          launchOnStartup: '开机自启动',
          closeToTray: '关闭时最小化'
        };
        const settingName = settingNames[key] || key;
        showToast(`${settingName}已${value ? '启用' : '禁用'} `, 'success');
      }
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

    // 优先核心必须在已选择的核心中
    let coresToUse = [...selectedCores];

    // 如果指定了优先核心，验证它是否在已选择的核心中
    let primaryCoreValue = null;
    if (primaryCore !== 'auto') {
      const primaryIdx = parseInt(primaryCore, 10);
      if (coresToUse.includes(primaryIdx)) {
        primaryCoreValue = primaryIdx;
      } else {
        showToast('优先核心必须在已选择的核心中', 'warning');
        return;
      }
    }

    let mask = 0n;
    coresToUse.forEach(core => {
      mask |= (1n << BigInt(core));
    });

    try {
      if (window.electron) {
        // 1. 设置 CPU 亲和性（传递优先核心）
        const result = await window.electron.setAffinity(selectedPid, mask.toString(), mode, primaryCoreValue);

        // 2. 设置进程优先级
        let prioritySuccess = true;
        try {
          await window.electron.setProcessPriority(selectedPid, priority);
        } catch (e) {
          console.error(`Priority set failed for ${selectedPid}`, e);
          prioritySuccess = false;
        }

        if (result.success) {
          setStatus('active');
          const statusMsg = prioritySuccess ? ` | 优先级: ${priority}` : ' (优先级设置失败)';
          showToast(`已应用到进程 ${selectedPid}${statusMsg}，建议点击清理内存`, 'success', 5000);

          // Auto-trigger aggressive memory cleanup when using 'dynamic' mode (silent)
          if (mode === 'dynamic' && window.electron?.clearMemory) {
            window.electron.clearMemory().catch(() => { }); // Silent, no toast
          }
        } else {
          showToast(result.error || '设置失败', 'error');
        }
      } else {
        console.log(`Affinity: PID = ${selectedPid}, Mask = ${mask}, Mode = ${mode}, Priority = ${priority} `);
        setStatus('active');
        showToast(`已应用到进程 ${selectedPid} `, 'success');
      }
    } catch (err) {
      showToast(err.message || '应用失败', 'error');
    }
  };

  const handleSaveProfile = async () => {
    setError(null);
    if (!selectedPid) {
      showToast('请选择目标程序', 'warning');
      return;
    }
    if (selectedCores.length === 0) {
      showToast('请至少选择一个核心', 'warning');
      return;
    }

    const process = processes.find(p => p.pid === selectedPid);
    if (!process) {
      showToast('进程已结束或无效', 'error');
      return;
    }

    // 优先核心必须在已选择的核心中
    let coresToUse = [...selectedCores];

    // 验证优先核心
    let primaryCoreValue = null;
    if (primaryCore !== 'auto') {
      const primaryIdx = parseInt(primaryCore, 10);
      if (coresToUse.includes(primaryIdx)) {
        primaryCoreValue = primaryIdx;
      }
    }

    let mask = 0n;
    coresToUse.forEach(core => {
      mask |= (1n << BigInt(core));
    });

    const profile = {
      name: process.name,
      affinity: mask.toString(),
      mode: mode,
      priority: priority, // 保存优先级
      primaryCore: primaryCoreValue // 保存优先核心
    };

    try {
      if (window.electron) {
        const result = await window.electron.addProfile(profile);
        if (result.success) {
          setSettings(prev => ({ ...prev, profiles: result.profiles }));
          setStatus('active');
          showToast(`策略已保存: ${process.name} `, 'success');
        } else {
          showToast(result.error || '保存策略失败', 'error');
        }
      } else {
        console.log('Mock Save Profile:', profile);
        const newProfiles = [...(settings.profiles || []), { ...profile, timestamp: Date.now() }];
        setSettings(prev => ({ ...prev, profiles: newProfiles }));
        showToast(`策略已保存: ${process.name} `, 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('保存策略失败', 'error');
    }
  };

  const handleRemoveProfile = async (name) => {
    try {
      if (window.electron) {
        const result = await window.electron.removeProfile(name);
        if (result.success) {
          setSettings(prev => ({ ...prev, profiles: result.profiles }));
          showToast(`已删除策略: ${name} `, 'success');
        } else {
          showToast('删除策略失败', 'error');
        }
      } else {
        const newProfiles = (settings.profiles || []).filter(p => p.name !== name);
        setSettings(prev => ({ ...prev, profiles: newProfiles }));
        showToast(`已删除策略: ${name} `, 'success');
      }
    } catch (err) {
      console.error(err);
      showToast('删除策略失败', 'error');
    }
  };

  const handleStop = () => {
    setStatus('standby');
    setPriority('Normal'); // 重置优先级
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
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-violet-500 text-white rounded-xl font-medium hover:bg-violet-600 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50 overflow-hidden">
      {/* Activation Dialog - shown when not activated */}
      {!isActivated && (
        <ActivationDialog onActivated={() => setIsActivated(true)} />
      )}

      <Header cpuModel={cpuInfo?.model} />

      {/* Tab Navigation */}
      <div className="flex justify-center mt-4 mb-2">
        <div className="bg-white/50 backdrop-blur-md p-1 rounded-xl flex gap-3 shadow-sm border border-slate-200/50">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'dashboard'
              ? 'bg-violet-500 text-white shadow-md shadow-violet-500/20'
              : 'text-slate-500 hover:bg-slate-100'
              }`}
          >
            <Activity size={16} />
            <span>核心调度</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'settings'
              ? 'bg-violet-500 text-white shadow-md shadow-violet-500/20'
              : 'text-slate-500 hover:bg-slate-100'
              }`}
          >
            <Settings size={16} />
            <span>游戏模式</span>
          </button>
          <button
            onClick={() => setActiveTab('optimizer')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'optimizer'
              ? 'bg-violet-500 text-white shadow-md shadow-violet-500/20'
              : 'text-slate-500 hover:bg-slate-100'
              }`}
          >
            <Zap size={16} />
            <span>一键优化</span>
          </button>
        </div>
      </div>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* 主内容区 */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        <div className="max-w-4xl mx-auto space-y-4 h-full flex flex-col">

          {/* Dashboard Tab */}
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

          {/* Settings / Game Mode Tab */}
          {activeTab === 'settings' && (
            <SettingsPanel
              mode={mode}
              onModeChange={setMode}
              primaryCore={primaryCore}
              onPrimaryCoreChange={setPrimaryCore}
              coreCount={coreCount}
              selectedCores={selectedCores}
              settings={settings}
              onSettingChange={handleSettingChange}
              onRemoveProfile={handleRemoveProfile}
              processes={processes}
            />
          )}

          {/* System Optimizer Tab */}
          {activeTab === 'optimizer' && (
            <SystemOptimizer />
          )}

        </div>
      </div>

      {/* 底部控制栏 (仅在 Dashboard 显示) */}
      {activeTab === 'dashboard' && (
        <div className="glass border-t border-slate-200/50 px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <ControlBar
              status={status}
              onApplyConfig={handleApply}
              onStop={handleStop}
              onSaveProfile={handleSaveProfile}
              cpuInfo={cpuInfo}
              priority={priority}
              onPriorityChange={setPriority}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
