import React, { useState, useEffect } from 'react';
import { Zap, Check, AlertTriangle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { RegistryCleaner } from './optimizer/RegistryCleaner';

interface Tweak {
    id: string;
    name: string;
    category: string;
}

export default function SystemOptimizer() {
    const [tweaks, setTweaks] = useState<Tweak[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    useEffect(() => {
        invoke<Tweak[]>('get_tweaks').then(data => {
            setTweaks(data);
            setSelectedIds(new Set(data.map(t => t.id)));
        }).catch(console.error);
    }, []);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const applyOptimization = async () => {
        if (selectedIds.size === 0) return;
        setLoading(true);
        setStatus(null);
        try {
            const result = await invoke<any>('apply_tweaks', { tweakIds: Array.from(selectedIds) });
            if (result.success) setStatus({ type: 'success', message: `成功优化了 ${result.applied} 个项目！` });
            else setStatus({ type: 'error', message: `部分优化失败: ${result.errors?.join(', ') || '未知错误'}` });
        } catch (err: any) {
            setStatus({ type: 'error', message: '执行出错: ' + (err?.message || err) });
        } finally { setLoading(false); }
    };

    const groupedTweaks = tweaks.reduce((acc, tweak) => {
        if (!acc[tweak.category]) acc[tweak.category] = [];
        acc[tweak.category].push(tweak);
        return acc;
    }, {} as Record<string, Tweak[]>);

    return (
        <div className="flex gap-6 h-full">
            {/* Left Panel - System Tweaks */}
            <div className="flex-1 glass rounded-2xl p-6 shadow-soft flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                        <Zap size={20} className="text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-700">系统极速优化</h3>
                        <p className="text-xs text-slate-400">一键调整底层参数 (需管理员权限)</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-6">
                    {Object.entries(groupedTweaks).map(([category, items]) => (
                        <div key={category}>
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{category}</h4>
                            <div className="space-y-2">
                                {items.map(tweak => (
                                    <div key={tweak.id} onClick={() => toggleSelect(tweak.id)} className={`p-3 rounded-xl border cursor-pointer ${selectedIds.has(tweak.id) ? 'bg-blue-50/50 border-blue-200' : 'bg-white/50 border-slate-100'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${selectedIds.has(tweak.id) ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300'}`}>
                                                {selectedIds.has(tweak.id) && <Check size={12} className="text-white" />}
                                            </div>
                                            <span className={`text-sm font-medium ${selectedIds.has(tweak.id) ? 'text-blue-700' : 'text-slate-600'}`}>{tweak.name}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-4 pt-4 border-t">
                    {status && (
                        <div className={`mb-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${status.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                            {status.type === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
                            {status.message}
                        </div>
                    )}
                    <button
                        onClick={applyOptimization}
                        disabled={loading || selectedIds.size === 0}
                        className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${loading || selectedIds.size === 0 ? 'bg-slate-100 text-slate-400' : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'}`}
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Zap size={18} />
                                <span>立即执行优化 ({selectedIds.size})</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Right Panel - Registry Cleaner */}
            <div className="flex-1">
                <RegistryCleaner />
            </div>
        </div>
    );
}
