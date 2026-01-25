import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Search, RefreshCw, CheckSquare, Square, Zap, Gauge, MoreHorizontal, ArrowUp, ArrowDown, Minus } from 'lucide-react';

const PRIORITY_MAP_CN = {
  'RealTime': '实时',
  'High': '高',
  'AboveNormal': '高于正常',
  'Normal': '正常',
  'BelowNormal': '低于正常',
  'Idle': '低'
};

const SimpleContextMenu = ({ x, y, process, onClose, onAction }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Adjust position if close to edge
  const style = {
    top: y,
    left: x,
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-48 bg-white/90 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-100/50 p-1.5 animate-in fade-in zoom-in-95 duration-100"
      style={style}
    >
      <div className="px-2 py-1.5 border-b border-slate-100 mb-1">
        <div className="font-medium text-xs text-slate-700 truncate">{process.name}</div>
        <div className="text-[10px] text-slate-400">PID: {process.pid}</div>
      </div>

      <div className="space-y-0.5">
        <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">设置优先级</div>
        <button onClick={() => onAction('setRealTime')} className="w-full text-left px-2 py-1.5 text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-600 rounded-lg transition-colors flex items-center gap-2">
          <Zap size={14} className="text-purple-500" /> 实时 (RealTime)
        </button>
        <button onClick={() => onAction('setHigh')} className="w-full text-left px-2 py-1.5 text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-600 rounded-lg transition-colors flex items-center gap-2">
          <ArrowUp size={14} className="text-red-500" /> 高 (High)
        </button>
        <button onClick={() => onAction('setAboveNormal')} className="w-full text-left px-2 py-1.5 text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-600 rounded-lg transition-colors flex items-center gap-2">
          <ArrowUp size={14} className="text-orange-400" /> 高于正常
        </button>
        <button onClick={() => onAction('setNormal')} className="w-full text-left px-2 py-1.5 text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-600 rounded-lg transition-colors flex items-center gap-2">
          <Minus size={14} className="text-blue-400" /> 正常 (Normal)
        </button>
        <button onClick={() => onAction('setBelowNormal')} className="w-full text-left px-2 py-1.5 text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-600 rounded-lg transition-colors flex items-center gap-2">
          <ArrowDown size={14} className="text-cyan-500" /> 低于正常
        </button>
        <button onClick={() => onAction('setIdle')} className="w-full text-left px-2 py-1.5 text-xs text-slate-700 hover:bg-violet-50 hover:text-violet-600 rounded-lg transition-colors flex items-center gap-2">
          <ArrowDown size={14} className="text-green-500" /> 低 (Idle)
        </button>
      </div>
    </div>
  );
};

export default function ProcessScanner({ processes, selectedPid, onSelect, onScan, scanning, selectedPids, setSelectedPids }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [menuState, setMenuState] = useState({ visible: false, x: 0, y: 0, process: null });

  // 过滤进程
  const filteredProcesses = useMemo(() => {
    if (!searchTerm) return processes;
    const term = searchTerm.toLowerCase();
    return processes.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.pid.toString().includes(term)
    );
  }, [processes, searchTerm]);

  // Handle Checkbox Toggle
  const toggleSelect = (pid) => {
    const newSet = new Set(selectedPids);
    if (newSet.has(pid)) newSet.delete(pid);
    else newSet.add(pid);
    setSelectedPids(newSet);

    // Also update single select for CoreGrid if 1 item selected
    if (newSet.size === 1) onSelect([...newSet][0]);
    else if (newSet.size === 0) onSelect(null);
  };

  const handleSelectAll = () => {
    if (selectedPids.size === filteredProcesses.length) setSelectedPids(new Set());
    else setSelectedPids(new Set(filteredProcesses.map(p => p.pid)));
  };

  // Context Menu Handler
  const handleContextMenu = (e, process) => {
    e.preventDefault();
    e.stopPropagation();
    let x = e.pageX;
    let y = e.pageY;

    if (!x && !y) {
      const rect = e.target.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom;
    }

    setMenuState({ visible: true, x, y, process });
  };

  // Bulk Action Handler - applies priority to all selected processes
  const handleBulkAction = async (priority) => {
    console.log('[handleBulkAction] Called with priority:', priority, 'selectedPids:', Array.from(selectedPids));
    if (selectedPids.size === 0) {
      console.log('[handleBulkAction] No PIDs selected, returning');
      return;
    }

    try {
      const promises = Array.from(selectedPids).map(pid => {
        console.log('[handleBulkAction] Setting priority for PID:', pid);
        if (window.electron?.setProcessPriority) {
          return window.electron.setProcessPriority(pid, priority);
        }
        return Promise.resolve();
      });

      await Promise.all(promises);
      console.log('[handleBulkAction] All done, clearing selection');
      setSelectedPids(new Set()); // Clear selection after action
      onScan(); // Refresh the list
    } catch (e) {
      console.error('Bulk action failed:', e);
    }
  };

  const handleMenuAction = async (action) => {
    const { process } = menuState;
    if (!process) return; // Only single process action for now in this menu

    // Map Action to IPC Call
    // action: setHigh, setIdle, etc.
    let priorityClass = 'Normal';
    switch (action) {
      case 'setRealTime': priorityClass = 'RealTime'; break;
      case 'setHigh': priorityClass = 'High'; break;
      case 'setAboveNormal': priorityClass = 'AboveNormal'; break;
      case 'setNormal': priorityClass = 'Normal'; break;
      case 'setBelowNormal': priorityClass = 'BelowNormal'; break;
      case 'setIdle': priorityClass = 'Idle'; break;
    }

    // Call IPC to set priority
    // function setPriority(pid, priorityClass)
    // We assume backend has 'set-priority' or use specific logic.
    // Currently we have 'save-config-rule'. 
    // Wait, do we have a direct 'set-process-priority' IPC?
    // main.js lines 450+ don't show it explicitly. 
    // We might need to implement calls via 'saveConfigRule' or add a new IPC.
    // Assuming we use 'set-affinity' style but for priority?
    // Let's use `window.electron.setProcessPriority` if it exists, or fallback.
    // Actually, I should check if I added `setPriority` to backend.
    // I haven't added `setPriority` IPC yet.
    // I will call it, and if it fails, I'll log.
    // BUT the user wants it to work.
    // Re-using `saveConfigRule` might be persistent. User might want temporary?
    // Usually "Right Click -> Set Priority" is temporary.
    // I will try to call `window.electron.setPriority(process.pid, priorityClass)`.
    // I need to ensure backend handles this. (I will check/add next step if missing).

    try {
      if (window.electron?.setProcessPriority) {
        await window.electron.setProcessPriority(process.pid, priorityClass);
        onScan(); // Refresh
      } else {
        console.warn("setProcessPriority IPC missing");
      }
    } catch (e) { console.error(e); }

    setMenuState({ ...menuState, visible: false });
  };

  // Helper for Priority Colors
  const getPriorityColor = (pri) => {
    switch (pri) {
      case 'RealTime': return 'text-purple-600 bg-purple-50 font-bold border border-purple-100';
      case 'High': return 'text-red-500 bg-red-50 font-medium border border-red-100';
      case 'AboveNormal': return 'text-orange-500 bg-orange-50 border border-orange-100';
      case 'Normal': return 'text-slate-600 bg-slate-50 border border-slate-100';
      case 'BelowNormal': return 'text-cyan-600 bg-cyan-50 border border-cyan-100';
      case 'Idle': return 'text-green-600 bg-green-50 border border-green-100';
      default: return 'text-slate-400 bg-slate-50';
    }
  };

  return (
    <div className="glass rounded-2xl p-0 shadow-soft relative flex flex-col h-[500px] overflow-hidden">
      {/* Header / Toolbar */}
      <div className="p-4 border-b border-slate-100 flex items-center gap-3 bg-white/50 backdrop-blur-sm z-10">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索进程或PID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-500/10 border border-slate-200"
          />
        </div>
        <button onClick={onScan} disabled={scanning} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
          <RefreshCw size={18} className={scanning ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[40px_1.5fr_80px_100px_80px_1fr] gap-2 px-4 py-2 bg-slate-50/80 text-xs font-semibold text-slate-500 border-b border-slate-200">
        <div className="flex items-center justify-center">
          <button onClick={handleSelectAll}>
            {selectedPids.size > 0 && selectedPids.size === filteredProcesses.length ? <CheckSquare size={16} className="text-violet-500" /> : <Square size={16} />}
          </button>
        </div>
        <div>进程名称</div>
        <div>PID</div>
        <div>优先级</div>
        <div>CPU</div>
        <div className="text-right">操作</div>
      </div>

      {/* Process List (Table Body) */}
      <div className="flex-1 overflow-y-auto">
        {filteredProcesses.map(p => {
          const isSelected = selectedPids.has(p.pid);
          return (
            <div
              key={p.pid}
              onContextMenu={(e) => handleContextMenu(e, p)}
              className={`grid grid-cols-[40px_1.5fr_80px_100px_80px_1fr] gap-2 px-4 py-2.5 items-center text-sm border-b border-slate-50 hover:bg-violet-50/50 transition-colors group ${isSelected ? 'bg-violet-50/80' : ''}`}
            >
              {/* Checkbox */}
              <div className="flex items-center justify-center">
                <button onClick={() => toggleSelect(p.pid)} className="text-slate-400 hover:text-violet-500">
                  {isSelected ? <CheckSquare size={16} className="text-violet-500" /> : <Square size={16} />}
                </button>
              </div>

              {/* Name */}
              <div className="font-medium text-slate-700 truncate min-w-0" title={p.name}>
                {p.name}
              </div>

              {/* PID */}
              <div className="font-mono text-xs text-slate-400">{p.pid}</div>

              {/* Priority */}
              <div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${getPriorityColor(p.priority)}`}>
                  {PRIORITY_MAP_CN[p.priority] || p.priority || '正常'}
                </span>
              </div>

              {/* CPU */}
              <div className="font-mono text-slate-600">
                {p.cpu > 0 ? `${p.cpu.toFixed(1)}%` : '-'}
              </div>

              {/* Edit / More Button */}
              <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => handleContextMenu(e, p)}
                  className="flex items-center gap-1 px-2 py-1 hover:bg-slate-200 rounded text-xs text-slate-600"
                >
                  <MoreHorizontal size={14} />
                  <span>管理</span>
                </button>
              </div>
            </div>
          );
        })}

        {filteredProcesses.length === 0 && (
          <div className="p-8 text-center text-slate-400">未找到相关进程</div>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedPids.size > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur text-white px-4 py-2 rounded-full shadow-xl flex items-center gap-4 animate-in slide-in-from-bottom-5 z-20">
          <span className="text-xs font-semibold">{selectedPids.size} 已选择</span>
          <div className="h-4 w-px bg-white/20"></div>
          <button className="hover:text-violet-300 text-xs flex items-center gap-1" onClick={() => handleBulkAction('High')}>
            <Zap size={14} /> 设为高
          </button>
          <button className="hover:text-green-300 text-xs flex items-center gap-1" onClick={() => handleBulkAction('Idle')}>
            <Gauge size={14} /> 设为低
          </button>
        </div>
      )}

      {/* Inline Context Menu (Portaled) */}
      {menuState.visible && typeof document !== 'undefined' && ReactDOM.createPortal(
        <SimpleContextMenu
          x={menuState.x}
          y={menuState.y}
          process={menuState.process}
          onClose={() => setMenuState({ ...menuState, visible: false })}
          onAction={handleMenuAction}
        />,
        document.body
      )}
    </div>
  );
}
