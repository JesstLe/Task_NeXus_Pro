import React, { useState, useEffect } from 'react';
import { Zap, Cpu, MousePointer2, Settings, Layers, RefreshCw, Check, Hash, X } from 'lucide-react';
import { LogicalCore } from '../types';

const CoreTypeColors: Record<string, string> = {
    'Performance': 'border-blue-500 bg-blue-50 text-blue-700',
    'Efficiency': 'border-slate-400 bg-slate-100 text-slate-600',
    'VCache': 'border-emerald-500 bg-emerald-50 text-emerald-700',
    'Unknown': 'border-slate-200 bg-white text-slate-500'
};

const CoreTypeLabels: Record<string, string> = {
    'Performance': 'Performance Core',
    'Efficiency': 'Efficiency Core',
    'VCache': '3D V-Cache Core',
    'Unknown': 'Standard Core'
};

interface SmartAffinitySelectorProps {
    topology: LogicalCore[];
    currentAffinity?: string;
    initialCpuSets?: number[];
    primaryCore?: number | null;
    onApply: (mask: string, mode: 'hard' | 'soft', coreIds: number[]) => void;
    onClose: () => void;
}

export default function SmartAffinitySelector({
    topology = [],
    currentAffinity = "All",
    initialCpuSets,
    primaryCore = null,
    onApply,
    onClose
}: SmartAffinitySelectorProps) {
    const [hexMask, setHexMask] = useState("");
    const [loading, setLoading] = useState(false);
    const [affinityMode, setAffinityMode] = useState<'hard' | 'soft'>(
        (initialCpuSets && initialCpuSets.length > 0) ? 'soft' : 'hard'
    );

    const coreCount = topology.length || navigator.hardwareConcurrency || 16;

    const [selectedMask, setSelectedMask] = useState<bigint>(() => {
        if (initialCpuSets && initialCpuSets.length > 0) {
            let mask = 0n;
            initialCpuSets.forEach(id => {
                mask |= (1n << BigInt(id));
            });
            return mask;
        }

        try {
            if (!currentAffinity || currentAffinity === 'All') return (1n << BigInt(coreCount)) - 1n;
            return BigInt(currentAffinity.startsWith('0x') ? currentAffinity : '0x' + currentAffinity);
        } catch {
            return (1n << BigInt(coreCount)) - 1n;
        }
    });

    useEffect(() => {
        setHexMask(selectedMask.toString(16).toUpperCase());
    }, [selectedMask]);

    const isSelected = (id: number) => (selectedMask & (1n << BigInt(id))) !== 0n;

    const toggleCore = (id: number) => {
        const bit = 1n << BigInt(id);
        setSelectedMask(prev => (prev & bit) !== 0n ? (prev & ~bit) : (prev | bit));
    };

    const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setHexMask(val);
        try {
            if (val) setSelectedMask(BigInt('0x' + val));
        } catch { }
    };

    const selectCores = (filterFn: (c: LogicalCore) => boolean) => {
        let newMask = 0n;
        topology.forEach(core => {
            if (filterFn(core)) newMask |= (1n << BigInt(core.id));
        });
        setSelectedMask(newMask);
    };

    const hasECores = topology.some(c => c.core_type === 'Efficiency');
    const hasVCache = topology.some(c => c.core_type === 'VCache');

    return (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${affinityMode === 'hard' ? 'bg-violet-100 text-violet-600' : 'bg-blue-100 text-blue-600'}`}>
                            <Cpu size={20} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-slate-800">CPU 亲和性选择</h3>
                                <div className="flex bg-slate-100 p-0.5 rounded-lg border">
                                    <button
                                        onClick={() => setAffinityMode('hard')}
                                        className={`px-2 py-0.5 text-[10px] rounded-md ${affinityMode === 'hard' ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-400'}`}
                                    >
                                        强制 (Hard)
                                    </button>
                                    <button
                                        onClick={() => setAffinityMode('soft')}
                                        className={`px-2 py-0.5 text-[10px] rounded-md ${affinityMode === 'soft' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                                    >
                                        柔性 (Sets)
                                    </button>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-1 max-w-[300px] leading-relaxed">
                                {affinityMode === 'hard'
                                    ? "强制绑定 (Affinity Mask): 严格限制进程在选定核心运行，适用于独占场景。"
                                    : "柔性绑定 (CPU Sets): 优先选定核心，调度器更灵活，减少潜在的微卡顿风险。"}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    <div className="flex gap-4 mb-4 text-xs font-medium">
                        {['Performance', 'Efficiency', 'VCache', 'Unknown'].map(type => {
                            if (type === 'Efficiency' && !hasECores) return null;
                            if (type === 'VCache' && !hasVCache) return null;
                            const colors = CoreTypeColors[type] || CoreTypeColors.Unknown;
                            const bg = colors.split(' ').find(c => c.startsWith('bg-'));
                            const border = colors.split(' ').find(c => c.startsWith('border-'));
                            return (
                                <div key={type} className="flex items-center gap-1.5">
                                    <div className={`w-3 h-3 rounded border ${bg} ${border}`}></div>
                                    <span className="text-slate-600 truncate">{CoreTypeLabels[type]}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2">
                        {topology.map(core => (
                            <button
                                key={core.id}
                                onClick={() => toggleCore(core.id)}
                                className={`
                                    relative h-10 rounded-lg border flex items-center justify-center gap-1.5 transition-all
                                    ${isSelected(core.id)
                                        ? `${CoreTypeColors[core.core_type] || CoreTypeColors.Unknown} ring-2 ring-violet-500/30 font-bold`
                                        : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                                    }
                                    ${primaryCore === core.id ? 'ring-2 ring-orange-500 ring-offset-2' : ''}
                                `}
                            >
                                <span className="text-xs font-mono">{core.id}</span>
                                {core.core_type === 'VCache' && <Layers size={10} className="absolute top-1 right-1 opacity-50" />}
                                {core.core_type === 'Performance' && <Zap size={10} className="absolute top-1 right-1 opacity-50" />}
                                {primaryCore === core.id && (
                                    <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-orange-500 rounded-full border-2 border-white flex items-center justify-center shadow-sm">
                                        <Check size={8} className="text-white" strokeWidth={3} />
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="mt-6 flex flex-wrap gap-2">
                        {hasECores && (
                            <>
                                <button onClick={() => selectCores(c => c.core_type === 'Performance')} className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors">只选 P-Cores</button>
                                <button onClick={() => selectCores(c => c.core_type === 'Efficiency')} className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-200 transition-colors">只选 E-Cores</button>
                            </>
                        )}
                        {hasVCache && (
                            <>
                                <button onClick={() => selectCores(c => c.core_type === 'VCache')} className="px-3 py-1.5 text-xs bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100 hover:bg-emerald-100 transition-colors">只选 V-Cache</button>
                                <button onClick={() => selectCores(c => c.core_type === 'Performance')} className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors">只选高频核</button>
                            </>
                        )}
                        <div className="w-px h-6 bg-slate-200 mx-1 self-center"></div>
                        <button onClick={() => setSelectedMask((1n << BigInt(coreCount)) - 1n)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">全选</button>
                        <button onClick={() => setSelectedMask(0n)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">清除</button>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t flex justify-between items-center rounded-b-2xl">
                    <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200 focus-within:ring-2 focus-within:ring-violet-500/20 transition-all">
                        <Hash size={14} className="text-slate-400" />
                        <span className="text-xs font-mono text-slate-400">0x</span>
                        <input
                            type="text"
                            value={hexMask}
                            onChange={handleHexChange}
                            className="w-32 text-sm font-mono outline-none uppercase text-slate-700 bg-transparent placeholder:text-slate-300"
                            placeholder="FFFF"
                        />
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} disabled={loading} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 disabled:opacity-50 transition-colors">取消</button>
                        <button
                            disabled={loading || selectedMask === 0n}
                            onClick={async () => {
                                setLoading(true);
                                try {
                                    await onApply(selectedMask.toString(16), affinityMode, topology.filter(c => isSelected(c.id)).map(c => c.id));
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            className={`
                                px-6 py-2 text-sm font-bold text-white rounded-xl shadow-lg flex items-center gap-2 transition-all active:scale-95
                                ${loading || selectedMask === 0n
                                    ? 'bg-slate-300 shadow-none cursor-not-allowed'
                                    : (affinityMode === 'hard' ? 'bg-violet-600 hover:bg-violet-700 hover:shadow-violet-500/25' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/25')
                                }
                            `}
                        >
                            {loading ? <RefreshCw size={16} className="animate-spin" /> : null}
                            <span>应用</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
