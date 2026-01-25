import React, { useState, useEffect } from 'react';
import { Cpu, Check, Zap, Filter, MousePointer2, ListFilter } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { ProcessInfo, LogicalCore } from '../types';
import CoreGridSelector from './CoreGridSelector';

interface ManualOptimizerProps {
    processes: ProcessInfo[];
    topology: LogicalCore[];
    showToast: (msg: string, type?: any) => void;
    onScan: () => void;
}

export default function ManualOptimizer({ processes, topology, showToast, onScan }: ManualOptimizerProps) {
    const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState<'all' | 'high-cpu' | 'games'>('all');

    const filteredProcesses = processes.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;

        switch (filter) {
            case 'high-cpu': return (p.cpu_usage || 0) > 1;
            case 'games':
                // Simple heuristic for games
                const name = p.name.toLowerCase();
                return name.includes('game') || name.includes('engine') || name.includes('client') || (p.cpu_usage || 0) > 5;
            default: return true;
        }
    }).slice(0, 50); // Limit display

    const togglePid = (pid: number) => {
        setSelectedPids(prev => {
            const next = new Set(prev);
            if (next.has(pid)) next.delete(pid);
            else next.add(pid);
            return next;
        });
    };

    const handleBatchApply = async (maskHex: string, lockHeavy: boolean) => {
        if (selectedPids.size === 0) return;

        try {
            const result = await invoke<any>('batch_apply_affinity', {
                pids: Array.from(selectedPids),
                maskHex,
                lockHeavyThread: lockHeavy
            });

            if (result.success) {
                showToast(`批量优化成功: ${result.count} 个进程已更新`, 'success');
                setSelectedPids(new Set());
                setTimeout(onScan, 500);
            }
        } catch (e) {
            showToast(`应用失败: ${e}`, 'error');
        }
    };

    return (
        <div className="flex flex-col h-full gap-6">
            {/* Header Area */}
            <div className="glass rounded-2xl p-6 shadow-soft flex items-center justify-between border border-white/40">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Zap size={24} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">自定义线程序列调试</h2>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setFilter('all')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${filter === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            全部
                        </button>
                        <button
                            onClick={() => setFilter('high-cpu')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${filter === 'high-cpu' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            高负载
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 flex gap-6">
                {/* Left: Process List */}
                <div className="w-[300px] glass rounded-2xl p-4 shadow-soft flex flex-col border border-white/40">
                    <div className="flex items-center gap-2 mb-4 px-2">
                        <Filter size={14} className="text-slate-400" />
                        <input
                            type="text"
                            placeholder="搜索进程..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-transparent text-sm border-none focus:ring-0 w-full text-slate-700 placeholder:text-slate-400"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                        {filteredProcesses.map(p => (
                            <button
                                key={p.pid}
                                onClick={() => togglePid(p.pid)}
                                className={`w-full text-left p-3 rounded-xl transition-all border flex items-center justify-between group
                                    ${selectedPids.has(p.pid)
                                        ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                                        : 'bg-white/40 border-slate-100 hover:border-indigo-100 hover:bg-white'}
                                `}
                            >
                                <div className="min-w-0">
                                    <div className={`text-xs font-bold truncate ${selectedPids.has(p.pid) ? 'text-indigo-700' : 'text-slate-700'}`}>
                                        {p.name}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono">PID: {p.pid}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono font-bold text-slate-400 group-hover:text-indigo-500 transition-colors">
                                        {(p.cpu_usage || 0).toFixed(1)}%
                                    </span>
                                    {selectedPids.has(p.pid) && <Check size={14} className="text-indigo-500" />}
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <button
                            onClick={() => setSelectedPids(new Set(filteredProcesses.map(p => p.pid)))}
                            className="w-full text-center py-2 text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                            全选当前视图
                        </button>
                    </div>
                </div>

                {/* Right: Core Grid (Embedded Version) */}
                <div className="flex-1 glass rounded-2xl shadow-soft border border-white/40 overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-100 bg-white/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Cpu size={18} className="text-indigo-500" />
                            <span className="text-sm font-bold text-slate-700">手动核心分配</span>
                        </div>
                        <div className="text-xs text-slate-400 font-medium">
                            已选择 <span className="text-indigo-600 font-bold">{selectedPids.size}</span> 个基准进程
                        </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center p-8 bg-white/30">
                        {selectedPids.size > 0 ? (
                            <div className="w-full max-w-[480px] animate-in fade-in slide-in-from-right-4 duration-500">
                                <CoreGridSelector
                                    topology={topology}
                                    pids={Array.from(selectedPids)}
                                    onApply={handleBatchApply}
                                    onCancel={() => setSelectedPids(new Set())}
                                    isEmbedded={true}
                                />
                            </div>
                        ) : (
                            <div className="text-center flex flex-col items-center gap-4 text-slate-400">
                                <div className="w-16 h-16 rounded-3xl bg-slate-100 flex items-center justify-center animate-bounce duration-1000">
                                    <MousePointer2 size={32} />
                                </div>
                                <div className="max-w-[200px]">
                                    <p className="text-sm font-bold text-slate-500">请先在左侧列表中</p>
                                    <p className="text-xs">选择需要进行手动调优的进程</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
