import React, { useState, useEffect } from 'react';
import { Zap, Lock, Scale, Leaf, ChevronDown, Trash2, HardDrive, RefreshCw, Download, Upload } from 'lucide-react';

// 内存清理组件
function MemoryCleaner() {
  const [memInfo, setMemInfo] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState(null);

  const fetchMemInfo = async () => {
    if (window.electron?.getMemoryInfo) {
      const info = await window.electron.getMemoryInfo();
      setMemInfo(info);
    }
  };

  useEffect(() => {
    fetchMemInfo();
    // Removed: 5-second polling was causing excessive subprocess spawning
    // Memory info now only updates on component mount and after clear
  }, []);

  const handleClear = async () => {
    setCleaning(true);
    setResult(null);
    try {
      if (window.electron?.clearMemory) {
        const res = await window.electron.clearMemory();
        setResult(res);
        await fetchMemInfo();
      }
    } catch (e) {
      setResult({ success: false, message: '清理失败' });
    }
    setCleaning(false);
  };

  return (
    <div className="flex items-center gap-4">
      {memInfo && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <HardDrive size={14} className="text-slate-400" />
            <span className="text-sm text-slate-600">
              {memInfo.used} / {memInfo.total} GB
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${memInfo.percent > 80 ? 'bg-red-100 text-red-600' :
              memInfo.percent > 60 ? 'bg-orange-100 text-orange-600' :
                'bg-green-100 text-green-600'
              }`}>
              {memInfo.percent}%
            </span>
          </div>
          <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${memInfo.percent > 80 ? 'bg-red-500' :
                memInfo.percent > 60 ? 'bg-orange-500' :
                  'bg-green-500'
                }`}
              style={{ width: `${memInfo.percent}%` }}
            ></div>
          </div>
        </div>
      )}

      <button
        onClick={handleClear}
        disabled={cleaning}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${cleaning
          ? 'bg-slate-100 text-slate-400 cursor-wait'
          : 'bg-violet-50 text-violet-600 hover:bg-violet-100'
          }`}
      >
        <RefreshCw size={14} className={cleaning ? 'animate-spin' : ''} />
        {cleaning ? '清理中...' : '清理内存'}
      </button>

      {result && (
        <span className={`text-xs ${result.success ? 'text-green-600' : 'text-slate-500'}`}>
          {result.message}
        </span>
      )}
    </div>
  );
}

// 电源计划控制组件 - 动态获取 + 事件刷新
function PowerPlanControl() {
  const [currentPlanGuid, setCurrentPlanGuid] = useState('');
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchPlans = async () => {
    if (window.electron?.listPowerPlans && window.electron?.getPowerPlan) {
      const listRes = await window.electron.listPowerPlans();
      const currentRes = await window.electron.getPowerPlan();

      if (listRes.success) setPlans(listRes.plans);
      if (currentRes.success) setCurrentPlanGuid(currentRes.guid);
    }
  };

  useEffect(() => {
    fetchPlans();
    // 监听更新事件 (由 DropZone 触发)
    window.addEventListener('power-plan-update', fetchPlans);
    // Removed: 10-second polling was spawning PowerShell repeatedly
    return () => {
      window.removeEventListener('power-plan-update', fetchPlans);
    }
  }, []);

  const switchPlan = async (guid) => {
    setLoading(true);
    if (window.electron?.setPowerPlan) {
      // 通过 GUID 找到名称 (用于兼容 setPowerPlan 接口)
      const plan = plans.find(p => p.guid === guid);
      // 注意：现有的 set-power-plan IPC 可能只支持预置名称，需要更新或直接传 GUID
      // 这里假设 IPC 已经被修改为支持 GUID 或者名称
      // 为了安全，我们传递名称如果在预置列表中，或者扩展 IPC

      // 实际上之前的 set-power-plan 只支持固定名称。
      // 我们需要修改后端 IPC 吗？查看之前代码，set-power-plan 需要 planName 查表。
      // 这意味着如果你导入了新计划，旧 IPC 无法切换。
      // 为了支持新计划，我们需要一个新的 IPC 'set-power-plan-guid' 或者修改现有的。
      // 这里为了最小修改，我们传递 key 如果是预置的，否则... 问题来了。

      // 让我们假设我们将在下一步修改后端 set-power-plan 接受 GUID。
      // 先传递 GUID 试试，并在后端做兼容。
      await window.electron.setPowerPlan(guid);
      await fetchPlans();
    }
    setLoading(false);
  };

  const openSettings = () => {
    window.electron?.openPowerSettings?.();
  };

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end max-w-[300px]">
      {plans.map(p => (
        <button
          key={p.guid}
          onClick={() => switchPlan(p.guid)}
          disabled={loading}
          title={p.guid}
          className={`px-2.5 py-1 text-xs rounded-lg transition-all truncate max-w-[100px] ${currentPlanGuid === p.guid || p.active
            ? 'bg-violet-500 text-white'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
        >
          {p.name.replace(' (Active)', '')}
        </button>
      ))}
      <button onClick={openSettings} className="px-2 py-1 text-xs bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200">⚙</button>
    </div>
  );
}

// 电源计划拖放导入组件
function PowerPlanDropZone() {
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState(null);

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const powFile = files.find(f => f.name.endsWith('.pow'));

    if (!powFile) {
      setMessage({ type: 'error', text: '请拖放 .pow 文件' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (window.electron?.importPowerPlan) {
      const result = await window.electron.importPowerPlan(powFile.path);
      if (result.success) {
        setMessage({ type: 'success', text: '导入成功！' });
        // 触发列表刷新
        window.dispatchEvent(new Event('power-plan-update'));
      } else {
        setMessage({ type: 'error', text: result.error || '导入失败' });
      }
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`mt-3 p-3 border-2 border-dashed rounded-xl text-center text-xs transition-all ${dragging
        ? 'border-violet-400 bg-violet-50 text-violet-600'
        : 'border-slate-200 text-slate-400 hover:border-slate-300'
        }`}
    >
      {message ? (
        <span className={message.type === 'success' ? 'text-green-600' : 'text-red-500'}>
          {message.text}
        </span>
      ) : (
        <span>拖放 .pow 文件到此处导入电源计划</span>
      )}
    </div>
  );
}

// 定时器分辨率控制组件 - 支持自定义精度
function TimerResolutionControl() {
  const [resolution, setResolution] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (window.electron?.getTimerResolution) {
      window.electron.getTimerResolution().then(r => setResolution(r.resolution || 0));
    }
  }, []);

  const setRes = async (ms) => {
    setLoading(true);
    if (window.electron?.setTimerResolution) {
      await window.electron.setTimerResolution(ms);
      const r = await window.electron.getTimerResolution();
      setResolution(r.resolution || 0);
    }
    setLoading(false);
  };

  const [inputVal, setInputVal] = useState('1.0');

  useEffect(() => {
    if (window.electron?.getTimerResolution) {
      window.electron.getTimerResolution().then(r => {
        const res = r.resolution || 0;
        setResolution(res);
        if (res > 0) setInputVal(res.toString());
      });
    }
  }, []);

  const handleSet = async () => {
    const val = parseFloat(inputVal);
    if (!isNaN(val) && val > 0) {
      setRes(val);
    }
  };

  const handleDisable = async () => {
    setRes(0);
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition-all ${resolution > 0 ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-slate-50'
        }`}>
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="ms"
          className="w-12 bg-transparent text-xs text-center focus:outline-none"
          disabled={loading}
        />
        <span className="text-xs text-slate-400">ms</span>
      </div>

      <button
        onClick={handleSet}
        disabled={loading}
        className="px-2 py-1 text-xs bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-50"
      >
        应用
      </button>

      {resolution > 0 && (
        <button
          onClick={handleDisable}
          disabled={loading}
          className="px-2 py-1 text-xs bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200"
        >
          关闭
        </button>
      )}

      {resolution > 0 && (
        <span className="text-xs text-green-600 ml-1 font-mono">
          当前: {resolution.toFixed(4).replace(/\.?0+$/, '')}ms
        </span>
      )}
    </div>
  );
}

// 智能内存优化控制组件
function SmartTrimControl({ settings, onUpdate }) {
  const [threshold, setThreshold] = useState(settings?.threshold || 80);

  const toggle = () => {
    onUpdate({
      ...settings,
      enabled: !settings?.enabled
    });
  };

  const handleSliderChange = (e) => {
    setThreshold(parseInt(e.target.value));
  };

  const handleSliderCommit = () => {
    onUpdate({
      ...settings,
      threshold: threshold
    });
  };

  const handleInputChange = (e) => {
    let val = parseInt(e.target.value);
    if (!isNaN(val)) {
      if (val < 1) val = 1;
      if (val > 100) val = 100;
      setThreshold(val);
    }
  };

  const handleInputBlur = () => {
    let val = threshold;
    if (val < 50) val = 50; // 最小值限制
    if (val > 95) val = 95; // 最大值限制
    setThreshold(val);
    onUpdate({
      ...settings,
      threshold: val
    });
  };

  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm text-slate-600 font-medium">SmartTrim 自动优化</span>
          <p className="text-xs text-slate-400">内存超过阈值时自动清理备用列表（不影响游戏）</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={!!settings?.enabled}
            onChange={toggle}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
        </label>
      </div>

      {settings?.enabled && (
        <div className="flex items-center gap-3 pl-1">
          <span className="text-xs text-slate-500 whitespace-nowrap">触发阈值</span>
          <div className="flex-1 flex items-center gap-2">
            <input
              type="range"
              min="50"
              max="95"
              step="1"
              value={threshold}
              onChange={handleSliderChange}
              onMouseUp={handleSliderCommit}
              className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-500"
            />
            <div className="flex items-center relative">
              <input
                type="number"
                value={threshold}
                onChange={handleInputChange}
                onBlur={handleInputBlur} // 失去焦点时保存
                onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                className="w-10 text-xs text-center border-none bg-transparent font-medium text-slate-600 focus:ring-0"
              />
              <span className="text-xs text-slate-400 absolute right-0 pointer-events-none">%</span>
            </div>
          </div>
        </div>
      )}

      {/* Mode Selector */}
      {settings?.enabled && (
        <div className="flex items-center gap-3 pl-1 mt-3">
          <span className="text-xs text-slate-500 whitespace-nowrap">清理模式</span>
          <div className="flex gap-2">
            <button
              onClick={() => onUpdate({ ...settings, mode: 'standby-only' })}
              className={`px-2 py-1 text-xs rounded transition-colors ${(settings.mode || 'standby-only') === 'standby-only'
                ? 'bg-green-100 text-green-700 font-medium'
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              title="仅清理备用内存列表，无副作用 (推荐)"
            >
              安全 (Standby)
            </button>
            <button
              onClick={() => onUpdate({ ...settings, mode: 'working-set' })}
              className={`px-2 py-1 text-xs rounded transition-colors ${settings.mode === 'working-set'
                ? 'bg-red-100 text-red-700 font-medium'
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              title="强制压缩后台进程内存，可能导致切换程序时轻微卡顿"
            >
              激进 (Working Set)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 压制列表编辑器组件 - 改为下拉选择
function ThrottleListEditor({ items = [], onUpdate, processes = [] }) {
  const [selectedProcess, setSelectedProcess] = useState('');

  // 提取唯一的进程名并排序
  const uniqueProcessNames = React.useMemo(() => {
    const names = new Set(processes.map(p => p.name));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [processes]);

  const add = () => {
    if (selectedProcess && !items.includes(selectedProcess)) {
      onUpdate([...items, selectedProcess]);
      setSelectedProcess('');
    }
  };

  const remove = (item) => {
    onUpdate(items.filter(x => x !== item));
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <select
            value={selectedProcess}
            onChange={(e) => setSelectedProcess(e.target.value)}
            className="w-full appearance-none px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 text-slate-700"
          >
            <option value="">选择进程...</option>
            {uniqueProcessNames.map(name => (
              <option key={name} value={name} disabled={items.includes(name)}>
                {name} {items.includes(name) ? '(已添加)' : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
        </div>
        <button
          onClick={add}
          disabled={!selectedProcess}
          className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          添加
        </button>
      </div>
      <div className="max-h-32 overflow-y-auto space-y-1">
        {items.length === 0 && <div className="text-xs text-slate-400 text-center py-2">没有添加任何压制程序</div>}
        {items.map(item => (
          <div key={item} className="flex items-center justify-between px-2 py-1 bg-red-50 rounded text-xs border border-red-100">
            <span className="text-red-700">{item}</span>
            <button onClick={() => remove(item)} className="text-red-300 hover:text-red-600">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// 游戏列表编辑器组件
function GameListEditor({ games = [], onUpdate }) {
  const [newGame, setNewGame] = useState('');
  const [expanded, setExpanded] = useState(false);

  const addGame = () => {
    const name = newGame.trim().toLowerCase();
    if (name && !games.includes(name)) {
      onUpdate([...games, name]);
      setNewGame('');
    }
  };

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)} className="text-xs text-violet-500 hover:underline">
        {expanded ? '收起' : `查看全部 (${games.length})`}
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newGame}
              onChange={(e) => setNewGame(e.target.value)}
              placeholder="game.exe"
              className="flex-1 px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              onKeyDown={(e) => e.key === 'Enter' && addGame()}
            />
            <button onClick={addGame} className="px-3 py-1.5 text-sm bg-violet-500 text-white rounded-lg hover:bg-violet-600">添加</button>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {games.slice(0, 15).map(g => (
              <div key={g} className="flex items-center justify-between px-2 py-1 bg-slate-50 rounded text-xs">
                <span className="text-slate-600">{g}</span>
                <button onClick={() => onUpdate(games.filter(x => x !== g))} className="text-slate-400 hover:text-red-500">×</button>
              </div>
            ))}
            {games.length > 15 && <div className="text-xs text-slate-400 text-center">...还有 {games.length - 15} 个</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPanel({
  mode,
  onModeChange,
  primaryCore,
  onPrimaryCoreChange,
  coreCount = 16,
  selectedCores = [],
  settings = {},
  onSettingChange = () => { },
  onRemoveProfile = () => { },
  processes = []
}) {
  // 优先核心只能从已选择的核心中选择
  const availableCores = selectedCores.length > 0 ? selectedCores.sort((a, b) => a - b) : [];

  const modes = [
    { id: 'dynamic', label: 'T mode1', icon: Zap },
    { id: 'd2', label: 'T mode2', icon: Scale, note: '笔记本可用' },
    { id: 'd3', label: 'T mode3', icon: Zap },
  ];

  return (
    <div className="space-y-4">
      {/* 优先核心选择 - 已隐藏 */}
      {/* 模式选择 */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <h4 className="font-medium text-slate-700 mb-4">调度模式</h4>
        <div className="grid grid-cols-3 gap-3">
          {modes.map((m) => {
            const isActive = mode === m.id;
            const Icon = m.icon;

            return (
              <button
                key={m.id}
                onClick={() => onModeChange(m.id)}
                className={`relative p-4 rounded-xl text-center transition-all duration-200 ${isActive
                  ? 'bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-glow'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
              >
                <Icon size={18} className={`mx-auto ${isActive ? 'text-white' : 'text-violet-500'}`} />
                <div className={`font-medium text-sm mt-2 ${isActive ? 'text-white' : 'text-slate-700'}`}>
                  {m.label}
                </div>
                {m.note && (
                  <div className={`text-xs mt-0.5 ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
                    ({m.note})
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 自动化策略 */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <h4 className="font-medium text-slate-700 mb-4">自动化策略</h4>

        {!settings.profiles || settings.profiles.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-sm bg-slate-50/50 rounded-xl border border-slate-100 border-dashed">
            暂无已保存的自动化策略
            <div className="mt-1 text-xs opacity-70">在控制栏点击“保存策略”添加</div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {settings.profiles.map((profile) => (
              <div key={profile.name} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl group hover:border-violet-200 transition-colors">
                <div>
                  <div className="font-medium text-slate-700 text-sm">{profile.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500">
                      {modes.find(m => m.id === profile.mode)?.label || profile.mode}
                    </span>
                    {profile.priority && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500">
                        优先级: {profile.priority}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      {new Date(profile.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onRemoveProfile(profile.name)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  title="删除策略"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 默认规则 (Process Lasso 风格) */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="font-medium text-slate-700">默认规则</h4>
            <p className="text-xs text-slate-400 mt-0.5">自动管理进程核心分配</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={!!settings.defaultRules?.enabled}
              onChange={(e) => onSettingChange('defaultRules', {
                ...settings.defaultRules,
                enabled: e.target.checked
              })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
          </label>
        </div>

        {settings.defaultRules?.enabled && (
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-slate-600">游戏进程 → P-Core / CCD0 (高优先级)</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-slate-600">其他进程 → E-Core / CCD1 (低优先级)</span>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">游戏列表</span>
              </div>
              <GameListEditor
                games={settings.gameList || []}
                onUpdate={(list) => onSettingChange('gameList', list)}
              />
            </div>
          </div>
        )}
      </div>

      {/* ProBalance */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="font-medium text-slate-700">ProBalance</h4>
            <p className="text-xs text-slate-400 mt-0.5">当游戏运行时，自动压制高负载后台进程 (防止卡顿)</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={!!settings.proBalance?.enabled}
              onChange={(e) => onSettingChange('proBalance', {
                ...settings.proBalance,
                enabled: e.target.checked
              })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
          </label>
        </div>

        {/* Threshold Slider */}
        {settings.proBalance?.enabled && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500 whitespace-nowrap">触发阈值 (CPU %)</span>
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min="5"
                max="50"
                step="1"
                value={settings.proBalance?.cpuThreshold || 20}
                onChange={(e) => onSettingChange('proBalance', {
                  ...settings.proBalance,
                  cpuThreshold: parseInt(e.target.value)
                })}
                className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
              <span className="w-8 text-xs text-right font-mono text-slate-600">
                {settings.proBalance?.cpuThreshold || 20}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 内存清理 */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-slate-700">内存优化</h4>
          <MemoryCleaner />
        </div>
        <SmartTrimControl
          settings={settings.smartTrim}
          onUpdate={(val) => onSettingChange('smartTrim', val)}
        />
      </div>

      {/* 电源计划 */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium text-slate-700">电源计划</h4>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">拖入.pow导入</span>
            <PowerPlanControl />
          </div>
        </div>
        <PowerPlanDropZone />
      </div>

      {/* 后台压制 (Throttle List) */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="font-medium text-slate-700">后台进程压制</h4>
            <p className="text-xs text-slate-400">游戏运行时，强制将列表中的程序降级为 IDLE (最低) 优先级</p>
          </div>
        </div>
        <ThrottleListEditor
          items={settings.throttleList || []}
          onUpdate={(list) => onSettingChange('throttleList', list)}
          processes={processes}
        />
      </div>

      {/* 定时器分辨率 */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-slate-700">高精度定时器</h4>
            <p className="text-xs text-slate-400 mt-0.5">降低输入延迟，仅对调度进程生效</p>
          </div>
          <TimerResolutionControl />
        </div>
      </div>

      {/* 系统设置 */}
      <div className="glass rounded-2xl p-5 shadow-soft">
        <h4 className="font-medium text-slate-700 mb-4">系统设置</h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h5 className="font-medium text-slate-700">开机自启动</h5>
              <p className="text-xs text-slate-400">系统启动时自动运行程序</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.launchOnStartup}
                onChange={(e) => onSettingChange('launchOnStartup', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h5 className="font-medium text-slate-700">关闭时最小化</h5>
              <p className="text-xs text-slate-400">点击关闭按钮时隐藏到托盘</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!settings.closeToTray}
                onChange={(e) => onSettingChange('closeToTray', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
            </label>
          </div>

          <div className="pt-4 border-t border-slate-100 flex gap-3">
            <button
              onClick={async () => {
                const res = await window.electron.exportConfig();
                if (res.success) {
                  // Ideally show toast
                  console.log('Export success', res.filePath);
                }
              }}
              className="flex-1 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Download size={16} />
              导出配置
            </button>
            <button
              onClick={async () => {
                if (!confirm("导入配置将覆盖当前的核心调优设置 (Profiles, SmartTrim, ProBalance 等)，确定继续吗？")) return;
                const res = await window.electron.importConfig();
                if (res.success) {
                  console.log('Import success');
                  window.location.reload(); // Reload to apply all settings
                }
              }}
              className="flex-1 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Upload size={16} />
              导入配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
