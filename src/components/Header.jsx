import React, { useState, useEffect } from 'react';
import { Minus, X, Sparkles, Square, Copy } from 'lucide-react';

export default function Header({ cpuModel }) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (window.electron?.onMaximizedStateChange) {
      // 监听窗口状态变化
      window.electron.onMaximizedStateChange((state) => setIsMaximized(state));
    }
  }, []);

  const handleMinimize = () => window.electron?.minimize();
  const handleToggleMaximize = () => window.electron?.toggleMaximize();
  // 关闭窗口（由设置决定是否隐藏到托盘）
  const handleClose = () => window.electron?.close();

  return (
    <div className="flex items-center justify-between px-6 py-4 drag bg-white/50 backdrop-blur-md border-b border-slate-200/50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center shadow-glow">
          <span className="text-white font-bold text-xs tracking-tight">TN</span>
        </div>
        <div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-violet-600 to-pink-600 bg-clip-text text-transparent">Task Nexus</h1>
          <p className="text-xs text-slate-400">智能任务调度器</p>
        </div>
      </div>

      <div className="flex items-center gap-1 no-drag relative z-50">
        <button
          onClick={handleMinimize}
          className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all flex items-center justify-center"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleToggleMaximize}
          className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all flex items-center justify-center"
        >
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all inline-flex items-center justify-center"
          style={{ lineHeight: 0 }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
