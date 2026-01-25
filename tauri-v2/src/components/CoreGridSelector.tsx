import React, { useState } from 'react';
import { LogicalCore } from '../types';
import { X, Check, Zap, Cpu, MousePointer2, ArrowRight } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface Props {
    topology: LogicalCore[]; // 从 Rust 传来的 CPU 拓扑
    pids: number[];          // 选中的进程 PID 列表
    onApply: (maskHex: string, lockHeavy: boolean) => void;
    onCancel: () => void;
    isEmbedded?: boolean;
}

export default function CoreGridSelector({ topology, pids, onApply, onCancel, isEmbedded }: Props) {
    // 选中的核心 ID 集合
    const [selectedCores, setSelectedCores] = useState<Set<number>>(new Set());
    const [lockHeavy, setLockHeavy] = useState(false);
    const [isSequenceMode, setIsSequenceMode] = useState(false);
    const [coreQueue, setCoreQueue] = useState<number[]>([]); // 有序队列

    // 辅助函数：根据核心类型返回颜色类名
    const getCoreStyles = (core: LogicalCore) => {
        const isSelected = selectedCores.has(core.id);

        switch (core.core_type) {
            case 'VCache':
                return isSelected
                    ? 'bg-green-500 border-green-600 text-white shadow-lg shadow-green-500/30'
                    : 'bg-green-50/50 border-green-100 text-green-600 hover:bg-green-100';
            case 'Performance':
                return isSelected
                    ? 'bg-blue-500 border-blue-600 text-white shadow-lg shadow-blue-500/30'
                    : 'bg-blue-50/50 border-blue-100 text-blue-600 hover:bg-blue-100';
            case 'Efficiency':
                return isSelected
                    ? 'bg-slate-500 border-slate-600 text-white shadow-lg shadow-slate-500/30'
                    : 'bg-slate-50/50 border-slate-100 text-slate-600 hover:bg-slate-100';
            default:
                return isSelected
                    ? 'bg-indigo-500 border-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                    : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100';
        }
    };

    const toggleCore = (id: number) => {
        if (isSequenceMode) {
            // 序列模式：追加或移除
            if (coreQueue.includes(id)) {
                setCoreQueue(q => q.filter(c => c !== id)); // 移除
                const newSet = new Set(selectedCores);
                newSet.delete(id);
                setSelectedCores(newSet);
            } else {
                setCoreQueue(q => [...q, id]); // 追加到末尾
                const newSet = new Set(selectedCores);
                newSet.add(id);
                setSelectedCores(newSet);
            }
        } else {
            // 普通模式
            const newSet = new Set(selectedCores);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            setSelectedCores(newSet);
        }
    };

    const selectByType = (type: LogicalCore['core_type']) => {
        const newSet = new Set(selectedCores);
        topology.forEach(c => {
            if (c.core_type === type) newSet.add(c.id);
        });
        setSelectedCores(newSet);
    };

    const clearAll = () => {
        setSelectedCores(new Set());
        setCoreQueue([]);
    };
    const selectAll = () => {
        const allIds = topology.map(c => c.id);
        setSelectedCores(new Set(allIds));
        if (isSequenceMode) {
            setCoreQueue(allIds);
        }
    };

    const handleApply = async () => {
        if (selectedCores.size === 0) {
            alert("请至少选择一个核心");
            return;
        }

        if (isSequenceMode && coreQueue.length > 0) {
            // 如果是序列模式，且选中了进程，逐个应用级联映射
            try {
                for (const pid of pids) {
                    await invoke('apply_cascading_affinity', { pid, priorityCores: coreQueue });
                }
                onCancel(); // 关闭
                return;
            } catch (e) {
                console.error("Cascading Affinity Error:", e);
                alert(`级联映射失败: ${e}`);
            }
        }

        // 回滚到普通掩码模式
        let mask = 0n;
        selectedCores.forEach(id => {
            mask |= 1n << BigInt(id);
        });

        onApply(mask.toString(16), lockHeavy);
    };

    const mainContent = (
        <div className={`relative flex flex-col overflow-hidden ${isEmbedded ? 'max-h-[600px]' : 'glass rounded-3xl shadow-2xl border border-white/40 w-full max-w-[540px] max-h-[85vh] animate-in fade-in zoom-in-95 duration-200'}`}>
            {/* Header - Hidden in embedded mode */}
            {!isEmbedded && (
                <div className="flex-none px-6 py-5 border-b border-slate-100 bg-white/80 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
                            <Cpu size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">批量手动核心选择</h3>
                            <p className="text-xs text-slate-400 mt-0.5">已选中 {pids.length} 个进程</p>
                        </div>
                    </div>

                    <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
                        <X size={20} />
                    </button>
                </div>
            )}

            <div className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar ${isEmbedded ? 'p-0' : 'p-6 bg-white/50'}`}>
                <div className="p-1"> {/* Extra padding to avoid clipping internal shadow-inner */}
                    {/* 1. 模式切换器 (Segmented Control) */}
                    <div className="flex bg-slate-100/80 backdrop-blur-sm p-1 rounded-2xl mb-6 shadow-inner border border-slate-200/50">
                        <button
                            onClick={() => {
                                setIsSequenceMode(false);
                                setCoreQueue([]);
                                setSelectedCores(new Set());
                            }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-300
                            ${!isSequenceMode
                                    ? 'bg-white shadow-soft text-slate-800 border border-slate-100'
                                    : 'text-slate-400 hover:text-slate-600'}
                        `}
                        >
                            <MousePointer2 size={16} />
                            集合选择 (Set)
                        </button>
                        <button
                            onClick={() => {
                                setIsSequenceMode(true);
                                setCoreQueue([]);
                                setSelectedCores(new Set());
                            }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-300
                            ${isSequenceMode
                                    ? 'bg-amber-100 text-amber-700 shadow-soft ring-1 ring-amber-200 border border-white'
                                    : 'text-slate-400 hover:text-slate-600'}
                        `}
                        >
                            <Zap size={16} className={isSequenceMode ? 'animate-pulse' : ''} />
                            序列优先 (Sequence)
                        </button>
                    </div>

                    {/* 2. 序列模式专属：可视化轨道 (The Sequence Track) */}
                    {isSequenceMode && (
                        <div className="mb-6 p-4 bg-amber-50/50 border border-amber-100 rounded-2xl animate-in slide-in-from-top-2 duration-300">
                            <div className="text-[10px] font-bold text-amber-800/60 mb-3 uppercase tracking-wider flex justify-between items-center">
                                <span className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-ping" />
                                    优先级队列 (从左至右负载递减)
                                </span>
                                <button
                                    onClick={clearAll}
                                    className="text-amber-600 hover:text-amber-700 hover:underline transition-all"
                                >
                                    重置队列
                                </button>
                            </div>

                            <div className="flex items-center gap-2 overflow-x-auto min-h-[48px] pb-1 custom-scrollbar scroll-smooth">
                                {coreQueue.length === 0 ? (
                                    <div className="flex items-center gap-2 text-slate-400 text-sm italic pl-1 opacity-70">
                                        <MousePointer2 size={14} />
                                        <span>请按顺序点击下方核心...</span>
                                    </div>
                                ) : (
                                    coreQueue.map((id, index) => (
                                        <div key={`${id}-${index}`} className="flex items-center animate-in zoom-in duration-200">
                                            {/* 核心气泡 */}
                                            <div
                                                className="flex flex-col items-center justify-center min-w-[48px] h-12 bg-white border-2 border-amber-400 rounded-xl shadow-sm text-amber-700 font-bold relative group cursor-pointer hover:border-red-400 transition-all hover:-translate-y-0.5"
                                                onClick={() => toggleCore(id)}
                                            >
                                                <span className="text-xs">#{id}</span>
                                                <span className="text-[8px] opacity-50 font-mono">Rank {index + 1}</span>
                                                {/* 悬浮显示移除 */}
                                                <div className="absolute inset-0 bg-red-500 rounded-xl text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <X size={16} strokeWidth={3} />
                                                </div>
                                            </div>

                                            {/* 箭头 (除了最后一个) */}
                                            {index < coreQueue.length - 1 && (
                                                <ArrowRight size={14} className="text-amber-300 mx-1 flex-shrink-0 animate-pulse" />
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                    {/* Legend & Quick Select */}
                    <div className="flex flex-wrap gap-2 mb-6">
                        <button
                            onClick={() => selectByType('VCache')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-600 border border-green-100 hover:bg-green-100 transition-all flex items-center gap-1.5"
                        >
                            <div className="w-2 h-2 rounded-full bg-green-500" /> V-Cache
                        </button>
                        <button
                            onClick={() => selectByType('Performance')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-1.5"
                        >
                            <div className="w-2 h-2 rounded-full bg-blue-500" /> P-Core
                        </button>
                        <button
                            onClick={() => selectByType('Efficiency')}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-50 text-slate-600 border border-slate-100 hover:bg-slate-100 transition-all flex items-center gap-1.5"
                        >
                            <div className="w-2 h-2 rounded-full bg-slate-500" /> E-Core
                        </button>
                        <div className="flex-1" />
                        <button onClick={selectAll} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition-all">全选</button>
                        <button onClick={clearAll} className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-all">清空</button>
                    </div>

                    {/* Core Grid */}
                    <div className={`grid gap-3 mb-8 ${isEmbedded ? 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8' : 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8'}`}>
                        {topology.map((core) => (
                            <button
                                key={core.id}
                                onClick={() => toggleCore(core.id)}
                                className={`
                                relative h-11 w-full flex flex-col items-center justify-center rounded-xl text-[10px] font-bold transition-all duration-300
                                border-2 
                                ${getCoreStyles(core)}
                                ${selectedCores.has(core.id) ? 'scale-105 shadow-md z-10' : (isSequenceMode ? 'opacity-20 grayscale-[0.5]' : 'opacity-60')}
                                ${isSequenceMode && coreQueue.includes(core.id) ? 'ring-2 ring-amber-400 ring-offset-2' : ''}
                            `}
                            >
                                <span className="opacity-80 text-xs">{core.id}</span>
                                {core.core_type === 'VCache' && <span className="text-[8px] transform -translate-y-0.5">X3D</span>}

                                {isSequenceMode && coreQueue.includes(core.id) && (
                                    <span className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-amber-500 text-white rounded-full text-[10px] flex items-center justify-center shadow-md animate-in zoom-in ring-2 ring-white">
                                        {coreQueue.indexOf(core.id) + 1}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Advanced Strategy */}
                    <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 mb-2">
                        <label className="flex items-center justify-between cursor-pointer group">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-100 text-amber-600 rounded-lg group-hover:scale-110 transition-transform">
                                    <Zap size={18} />
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-slate-700">强制锁定最忙线程</div>
                                    <p className="text-[10px] text-slate-400">将核心负载最高的线程定向锁定到选中的第一颗核</p>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={lockHeavy}
                                onChange={(e) => setLockHeavy(e.target.checked)}
                                className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer"
                            />
                        </label>
                    </div>
                </div>
            </div>

            {/* Actions Footer */}
            {!isEmbedded && (
                <div className="flex-none px-6 py-5 border-t border-slate-100 bg-slate-50/50 flex gap-4">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-6 py-3 rounded-2xl text-sm font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={selectedCores.size === 0}
                        className={`flex-1 px-6 py-3 rounded-2xl text-sm font-bold text-white shadow-xl transition-all flex items-center justify-center gap-2
                            ${selectedCores.size > 0
                                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-indigo-500/25 hover:scale-[1.02] active:scale-[0.98]'
                                : 'bg-slate-300 cursor-not-allowed'}
                        `}
                    >
                        <Check size={18} />
                        应用至所选进程
                    </button>
                </div>
            )}

            {/* Action for Embedded Mode */}
            {isEmbedded && (
                <div className="flex-none px-6 py-4 border-t border-slate-100 bg-white/50">
                    <button
                        onClick={handleApply}
                        disabled={selectedCores.size === 0}
                        className={`w-full px-6 py-3 rounded-2xl text-sm font-bold text-white shadow-xl transition-all flex items-center justify-center gap-2
                            ${selectedCores.size > 0
                                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-indigo-500/25 hover:scale-[1.02] active:scale-[0.98]'
                                : 'bg-slate-300 cursor-not-allowed'}
                        `}
                    >
                        <Check size={18} />
                        应用至所选进程
                    </button>
                </div>
            )}
        </div>
    );

    if (isEmbedded) return mainContent;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onCancel} />
            {mainContent}
        </div>
    );
}
