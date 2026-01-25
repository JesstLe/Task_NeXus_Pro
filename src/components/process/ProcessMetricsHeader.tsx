import React from 'react';
import { Search, Activity, GitBranch, Play, Pause } from 'lucide-react';
import { MiniGraph } from '../common/MiniGraph';

interface ProcessMetricsHeaderProps {
    history: { cpu: number[], memory: number[] };
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    showActiveOnly: boolean;
    setShowActiveOnly: (show: boolean) => void;
    treeViewMode: boolean;
    setTreeViewMode: (mode: boolean) => void;
    isPaused: boolean;
    setIsPaused: (paused: boolean) => void;
}

export const ProcessMetricsHeader: React.FC<ProcessMetricsHeaderProps> = ({
    history,
    searchTerm,
    setSearchTerm,
    showActiveOnly,
    setShowActiveOnly,
    treeViewMode,
    setTreeViewMode,
    isPaused,
    setIsPaused
}) => {
    return (
        <div className="min-h-20 bg-white/60 border-b border-slate-200 flex flex-wrap items-center gap-4 px-4 py-2">
            <div className="flex flex-col min-w-[100px]">
                <div className="text-[10px] uppercase font-bold text-slate-400">处理器占用</div>
                <div className="flex items-end gap-2">
                    <span className="text-2xl font-mono font-bold text-slate-700">{history.cpu[history.cpu.length - 1]?.toFixed(0)}%</span>
                    <MiniGraph data={history.cpu} color="#8b5cf6" width={80} height={24} />
                </div>
            </div>
            <div className="flex flex-col min-w-[100px]">
                <div className="text-[10px] uppercase font-bold text-slate-400">内存负载</div>
                <div className="flex items-end gap-2">
                    <span className="text-2xl font-mono font-bold text-slate-700">{history.memory[history.memory.length - 1]?.toFixed(0)}%</span>
                    <MiniGraph data={history.memory} color="#06b6d4" width={80} height={24} />
                </div>
            </div>
            <div className="flex-1 flex items-center justify-end gap-2 min-w-[220px]">
                <div className="relative w-full max-w-[200px]">
                    <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." className="w-full pl-8 pr-2 py-1.5 bg-slate-100 rounded-lg text-xs outline-none" />
                </div>
                <button onClick={() => setShowActiveOnly(!showActiveOnly)} className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${showActiveOnly ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'}`}><Activity size={12} /></button>
                <button onClick={() => setTreeViewMode(!treeViewMode)} className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${treeViewMode ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-500'}`}><GitBranch size={12} /></button>
                <button onClick={() => setIsPaused(!isPaused)} className={`p-1.5 rounded-lg transition-colors ${isPaused ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>{isPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}</button>
            </div>
        </div>
    );
};
