import React, { useState, useEffect } from 'react';
import { Cpu } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { CpuArch } from '../types';

interface CoreGridProps {
    cores: number[];
    selectedCores: number[];
    onToggleCore: (index: number) => void;
    onSelectAll: () => void;
    onSelectNone: () => void;
    onSelectPhysical: () => void;
    onSelectSMT: () => void;
    cpuArch: CpuArch | null;
    onSelectPartition0: () => void;
    onSelectPartition1: () => void;
}

export default function CoreGrid({
    cores,
    selectedCores,
    onToggleCore,
    onSelectAll,
    onSelectNone,
    onSelectPhysical,
    onSelectSMT,
    cpuArch,
    onSelectPartition0,
    onSelectPartition1
}: CoreGridProps) {
    const isDualPartition = (cpuArch?.type === 'AMD_CCD' && (cpuArch as any).isDualCcd) ||
        (cpuArch?.type === 'INTEL_HYBRID' && cpuArch.isHybrid);

    let partition0Label = 'P0', partition1Label = 'P1', partition0Color = 'blue', partition1Color = 'purple', partition0Count = 0;

    if (cpuArch?.type === 'AMD_CCD' && (cpuArch as any).isDualCcd) {
        partition0Label = 'CCD0';
        partition1Label = 'CCD1';
        partition0Color = 'blue';
        partition1Color = 'purple';
        partition0Count = Math.floor(cores.length / 2);
    } else if (cpuArch?.type === 'INTEL_HYBRID' && cpuArch.isHybrid && cpuArch.pCores) {
        partition0Label = 'P-Core';
        partition1Label = 'E-Core';
        partition0Color = 'emerald';
        partition1Color = 'orange';
        partition0Count = cpuArch.pCores * 2;
    }

    const [cpuLoads, setCpuLoads] = useState<number[]>([]);

    useEffect(() => {
        let unlisten: any;
        async function setup() {
            unlisten = await listen('cpu-load-update', (event) => {
                if (Array.isArray(event.payload)) setCpuLoads(event.payload);
            });
            invoke<number[]>('get_cpu_loads').then(setCpuLoads).catch(console.error);
        }
        setup();
        return () => { if (unlisten) unlisten(); };
    }, [cores.length]);

    const renderCore = (coreIndex: number) => {
        const isSelected = selectedCores.includes(coreIndex);
        const load = cpuLoads[coreIndex] || 0;

        let heatOverlayColor = 'transparent';
        if (load > 80) heatOverlayColor = 'rgba(239, 68, 68, 0.2)';
        else if (load > 40) heatOverlayColor = 'rgba(234, 179, 8, 0.15)';
        else if (load > 10) heatOverlayColor = 'rgba(34, 197, 94, 0.1)';

        return (
            <button
                key={coreIndex}
                onClick={() => onToggleCore(coreIndex)}
                title={`Core ${coreIndex} - ${(load).toFixed(0)}% Util`}
                className={`relative w-10 h-10 rounded-lg text-xs font-medium transition-all flex items-center justify-center border overflow-hidden ${isSelected ? 'bg-violet-500 text-white border-violet-600 shadow-md' : 'text-slate-600 border-slate-200 bg-slate-50 hover:border-slate-300'}`}
            >
                <div
                    className="absolute inset-x-0 bottom-0 transition-all duration-500"
                    style={{
                        backgroundColor: isSelected ? (load > 80 ? 'rgba(255, 255, 255, 0.35)' : load > 40 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.15)') : heatOverlayColor,
                        height: `${Math.max(load > 0 ? 10 : 0, load)}%`,
                    }}
                />
                <span className="relative z-10">{coreIndex}</span>
                {cpuLoads.length > 0 && <div className={`absolute bottom-0.5 right-0.5 text-[8px] ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>{load > 0 ? Math.round(load) : ''}</div>}
            </button>
        );
    };

    const getCustomStyles = (color: string) => {
        if (color === 'emerald') return { color: '#059669', backgroundColor: '#d1fae5', borderColor: '#6ee7b7' };
        if (color === 'blue') return { color: '#2563eb', backgroundColor: '#dbeafe', borderColor: '#93c5fd' };
        if (color === 'orange') return { color: '#ea580c', backgroundColor: '#ffedd5', borderColor: '#fdba74' };
        if (color === 'purple') return { color: '#9333ea', backgroundColor: '#f3e8ff', borderColor: '#d8b4fe' };
        return {};
    };

    return (
        <div className="glass rounded-2xl p-6 shadow-soft">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                        <Cpu size={20} className="text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-700">处理器调度中心</h3>
                        <p className="text-xs text-slate-400">{cores.length} 个逻辑核心</p>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                    {isDualPartition && (
                        <>
                            <button onClick={onSelectPartition0} className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border" style={getCustomStyles(partition0Color)}>{partition0Label}</button>
                            <button onClick={onSelectPartition1} className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border" style={getCustomStyles(partition1Color)}>{partition1Label}</button>
                            <div className="w-px h-6 bg-slate-200 mx-1"></div>
                        </>
                    )}
                    <button onClick={onSelectAll} className="px-3 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg">全选</button>
                    <button onClick={onSelectPhysical} className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg">物理核</button>
                    <button onClick={onSelectSMT} className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg">逻辑线程</button>
                    <button onClick={onSelectNone} className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-100 rounded-lg">清空</button>
                </div>
            </div>

            {isDualPartition ? (
                <div className="space-y-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getCustomStyles(partition0Color).color }}></div>
                            <span className="text-xs font-medium text-slate-500">{partition0Label} ({partition0Count} Cores)</span>
                        </div>
                        <div className="grid grid-cols-8 gap-2">{cores.slice(0, partition0Count).map((_, i) => renderCore(i))}</div>
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getCustomStyles(partition1Color).color }}></div>
                            <span className="text-xs font-medium text-slate-500">{partition1Label} ({cores.length - partition0Count} Cores)</span>
                        </div>
                        <div className="grid grid-cols-8 gap-2">{cores.slice(partition0Count).map((_, i) => renderCore(partition0Count + i))}</div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-8 gap-2">{cores.map((_, i) => renderCore(i))}</div>
            )}

            <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                    <span className="font-medium text-violet-500">{selectedCores.length}</span> 核心已选
                </div>
            </div>
        </div>
    );
}
