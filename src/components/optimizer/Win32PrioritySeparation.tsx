import React, { useState, useEffect } from 'react';
import { Settings, Check, Activity } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export function Win32PrioritySeparation() {
    const [currentValue, setCurrentValue] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    // Options from the image
    const options = [2, 20, 21, 22, 24, 25, 26, 36, 37, 38, 40, 41, 42];

    useEffect(() => {
        refreshValue();
    }, []);

    const refreshValue = async () => {
        try {
            const val = await invoke<number>('get_win32_priority_separation');
            setCurrentValue(val);
        } catch (e) {
            console.error('Failed to get Win32PrioritySeparation:', e);
        }
    };

    const handleSet = async (val: number) => {
        setLoading(true);
        try {
            await invoke('set_win32_priority_separation', { value: val });
            setCurrentValue(val);
        } catch (e) {
            console.error('Failed to set Win32PrioritySeparation:', e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass rounded-2xl p-6 shadow-soft flex flex-col h-full">
            <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-200">
                    <Activity size={24} className="text-white" />
                </div>
                <div>
                    <h3 className="font-semibold text-slate-700">处理器调度优化</h3>
                    <p className="text-xs text-slate-400">Win32PrioritySeparation 注册表微调</p>
                </div>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 mb-6 flex items-center justify-between border border-slate-800 shadow-inner">
                <span className="text-slate-400 font-mono text-sm tracking-wider">CurrentValue</span>
                <div className="font-mono text-3xl font-bold text-green-400 tracking-widest text-shadow-glow">
                    {currentValue !== null ? currentValue : '--'}
                </div>
            </div>

            <div className="flex-1">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Switch Options</h4>
                <div className="grid grid-cols-4 gap-2">
                    {options.map((val) => (
                        <button
                            key={val}
                            onClick={() => handleSet(val)}
                            disabled={loading}
                            className={`
                                relative p-2 rounded-lg border transition-all flex items-center justify-center gap-2
                                ${currentValue === val 
                                    ? 'bg-violet-500 border-violet-500 text-white shadow-md transform scale-105' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300 hover:bg-violet-50'
                                }
                            `}
                        >
                            <div className={`
                                w-3 h-3 rounded-full border flex items-center justify-center
                                ${currentValue === val ? 'bg-white border-white' : 'border-slate-300'}
                            `}>
                                {currentValue === val && <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
                            </div>
                            <span className="font-mono font-medium">{val}</span>
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-100">
                 <p className="text-[10px] text-slate-400 italic">
                    数值说明: 2 (默认), 26/40/42 (常见优化值), 38 (特定游戏优化)。更改即时生效。
                </p>
            </div>
        </div>
    );
}
