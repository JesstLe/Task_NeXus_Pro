import React, { useState, useEffect } from 'react';
import { Shield, Zap, Info, Check, AlertTriangle, Terminal } from 'lucide-react';

export default function SystemOptimizer() {
    const [tweaks, setTweaks] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: '' }

    useEffect(() => {
        // Fetch available tweaks
        if (window.electron?.getTweaks) {
            window.electron.getTweaks().then(data => {
                setTweaks(data);
                // Default select all safe tweaks
                setSelectedIds(new Set(data.map(t => t.id)));
            });
        }
    }, []);

    const toggleSelect = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleExpand = (id, e) => {
        e.stopPropagation();
        setExpandedId(expandedId === id ? null : id);
    };

    const applyOptimization = async () => {
        if (selectedIds.size === 0) return;
        setLoading(true);
        setStatus(null);

        try {
            const result = await window.electron.applyTweaks(Array.from(selectedIds));
            if (result.success) {
                setStatus({ type: 'success', message: `成功优化了 ${result.applied} 个项目！` });
            } else {
                setStatus({ type: 'error', message: `部分优化失败: ${result.errors.join(', ')}` });
            }
        } catch (err) {
            setStatus({ type: 'error', message: '执行出错: ' + err.message });
        }
        setLoading(false);
    };

    // Group by category
    const groupedTweaks = tweaks.reduce((acc, tweak) => {
        if (!acc[tweak.category]) acc[tweak.category] = [];
        acc[tweak.category].push(tweak);
        return acc;
    }, {});

    return (
        <div className="glass rounded-2xl p-6 shadow-soft h-full flex flex-col">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                    <Zap size={20} className="text-white" />
                </div>
                <div>
                    <h3 className="font-semibold text-slate-700">系统极速优化</h3>
                    <p className="text-xs text-slate-400">一键调整底层参数，降低延迟 (需管理员权限)</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                {Object.entries(groupedTweaks).map(([category, items]) => (
                    <div key={category}>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">{category}</h4>
                        <div className="space-y-2">
                            {items.map(tweak => (
                                <div
                                    key={tweak.id}
                                    onClick={() => toggleSelect(tweak.id)}
                                    className={`relative p-3 rounded-xl border transition-all cursor-pointer ${selectedIds.has(tweak.id)
                                        ? 'bg-blue-50/50 border-blue-200'
                                        : 'bg-white/50 border-slate-100 hover:border-blue-100'
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${selectedIds.has(tweak.id)
                                            ? 'bg-blue-500 border-blue-500'
                                            : 'bg-white border-slate-300'
                                            }`}>
                                            {selectedIds.has(tweak.id) && <Check size={12} className="text-white" />}
                                        </div>

                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <span className={`text-sm font-medium ${selectedIds.has(tweak.id) ? 'text-blue-700' : 'text-slate-600'}`}>
                                                    {tweak.name}
                                                </span>
                                            </div>
                                            {/* Description and details hidden for commercial protection */}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100">
                {status && (
                    <div className={`mb-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${status.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                        }`}>
                        {status.type === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
                        {status.message}
                    </div>
                )}

                <button
                    onClick={applyOptimization}
                    disabled={loading || selectedIds.size === 0}
                    className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${loading || selectedIds.size === 0
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 active:scale-[0.98]'
                        }`}
                >
                    {loading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>正在优化...</span>
                        </>
                    ) : (
                        <>
                            <Zap size={18} />
                            <span>立即执行优化 ({selectedIds.size})</span>
                        </>
                    )}
                </button>
                <p className="text-[10px] text-center text-slate-400 mt-2">
                    注意：部分优化可能需要重启系统才能完全生效
                </p>
            </div>
        </div>
    );
}
