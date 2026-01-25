import React, { useState } from 'react';
import { Play, Square, Activity, Save, ChevronDown, Zap } from 'lucide-react';

export default function ControlBar({ status, onApplyConfig, onStop, onSaveProfile, cpuInfo, priority = 'Normal', onPriorityChange }) {
  const isRunning = status === 'active';
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);

  const priorities = [
    { value: 'Low', label: '低', color: 'text-slate-500' },
    { value: 'BelowNormal', label: '低于正常', color: 'text-blue-500' },
    { value: 'Normal', label: '正常', color: 'text-green-500' },
    { value: 'AboveNormal', label: '高于正常', color: 'text-orange-500' },
    { value: 'High', label: '高', color: 'text-red-500' },
    { value: 'RealTime', label: '实时', color: 'text-purple-500' }
  ];

  const currentPriority = priorities.find(p => p.value === priority) || priorities[2];

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${isRunning ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'
          }`}>
          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></div>
          <span className="text-sm font-medium">{isRunning ? '运行中' : '待机'}</span>
        </div>
        {cpuInfo && (
          <span className="text-xs text-slate-400 hidden sm:inline">
            {cpuInfo.cores} 核心 · {cpuInfo.model}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Priority Selector */}
        <div className="relative">
          <button
            onClick={() => setShowPriorityMenu(!showPriorityMenu)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all font-medium flex items-center gap-2 text-sm"
          >
            <Zap size={14} className={currentPriority.color} />
            <span>{currentPriority.label}</span>
            <ChevronDown size={14} className="text-slate-400" />
          </button>

          {showPriorityMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowPriorityMenu(false)}></div>
              <div className="absolute bottom-full right-0 mb-2 w-32 bg-white rounded-xl shadow-lg border border-slate-100 p-1 z-20 flex flex-col gap-0.5">
                {priorities.map(p => (
                  <button
                    key={p.value}
                    onClick={() => {
                      onPriorityChange(p.value);
                      setShowPriorityMenu(false);
                    }}
                    className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${priority === p.value ? 'bg-violet-50 text-violet-600' : 'hover:bg-slate-50 text-slate-600'
                      }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${p.color.replace('text-', 'bg-')}`}></div>
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {isRunning && (
          <>
            <button
              onClick={onSaveProfile}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-violet-50 hover:text-violet-600 hover:border-violet-200 transition-all font-medium flex items-center gap-2 text-sm"
            >
              <Save size={14} />
              <span className="hidden sm:inline">保存策略</span>
            </button>
            <button
              onClick={onStop}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all font-medium flex items-center gap-2 text-sm"
            >
              <Square size={14} fill="currentColor" />
              <span className="hidden sm:inline">停止</span>
            </button>
          </>
        )}

        <button
          onClick={onApplyConfig}
          className="px-6 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all duration-200 bg-gradient-to-r from-violet-500 to-pink-500 text-white shadow-glow hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
        >
          {isRunning ? (
            <>
              <Activity size={16} />
              <span>更新配置</span>
            </>
          ) : (
            <>
              <Play size={16} fill="currentColor" />
              <span>启动调度</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
