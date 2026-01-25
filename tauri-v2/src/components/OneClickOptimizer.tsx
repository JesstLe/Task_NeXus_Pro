import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Zap, Wifi, Monitor, CheckCircle2, XCircle, RotateCcw, Play } from 'lucide-react';

interface OneClickOptimizerProps {
    showToast: (msg: string, type?: any) => void;
}

export default function OneClickOptimizer({ showToast }: OneClickOptimizerProps) {
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [status, setStatus] = useState<Record<string, boolean>>({
        latency: false,
        network: false,
        power: false,
        hags: false
    });

    const handleOptimize = async (type: 'latency' | 'network' | 'power', enable: boolean) => {
        setLoading(prev => ({ ...prev, [type]: true }));
        try {
            if (type === 'latency') {
                await invoke('optimize_latency', { enable });
            } else if (type === 'network') {
                await invoke('optimize_network', { enable });
            } else if (type === 'power') {
                await invoke('optimize_power_gpu', { enable, hags: status.hags });
            }

            setStatus(prev => ({ ...prev, [type]: enable }));
            showToast(`${enable ? '优化' : '还原'}成功: ${getLabel(type)}`, 'success');
        } catch (err) {
            console.error(err);
            showToast(`操作失败: ${err}`, 'error');
        } finally {
            setLoading(prev => ({ ...prev, [type]: false }));
        }
    };

    const getLabel = (type: string) => {
        switch (type) {
            case 'latency': return '系统延迟优化';
            case 'network': return '网络协议栈优化';
            case 'power': return '电源与GPU策略';
            default: return type;
        }
    };

    const toggleHags = () => {
        setStatus(prev => ({ ...prev, hags: !prev.hags }));
    }

    return (
        <div className="h-full overflow-y-auto custom-scrollbar p-1">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Latency Card */}
                <div className="glass rounded-2xl p-6 shadow-soft flex flex-col border border-white/40 group hover:border-violet-200 transition-all">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-400 to-red-400 flex items-center justify-center shadow-lg shadow-orange-500/20 text-white">
                            <Zap size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">系统延迟与输入优化</h3>
                            <p className="text-xs text-slate-400">System Latency</p>
                        </div>
                    </div>
                    <div className="space-y-3 flex-1 mb-6">
                        <ul className="text-xs text-slate-500 space-y-2 list-disc list-inside">
                            <li>禁用动态时钟 (Tickless Kernel)</li>
                            <li>禁用 HPET (高精度事件计时器)</li>
                            <li>禁用 USB 选择性暂停</li>
                            <li>Win32PrioritySeparation 响应提权</li>
                        </ul>
                    </div>
                    <div className="flex gap-3 mt-auto">
                        <button
                            onClick={() => handleOptimize('latency', true)}
                            disabled={loading.latency}
                            className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                        >
                            {loading.latency ? '执行中...' : <><Play size={14} /> 一键优化</>}
                        </button>
                        <button
                            onClick={() => handleOptimize('latency', false)}
                            disabled={loading.latency}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all active:scale-95"
                            title="恢复默认设置"
                        >
                            <RotateCcw size={14} />
                        </button>
                    </div>
                </div>

                {/* Network Card */}
                <div className="glass rounded-2xl p-6 shadow-soft flex flex-col border border-white/40 group hover:border-violet-200 transition-all">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
                            <Wifi size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">网络协议栈优化</h3>
                            <p className="text-xs text-slate-400">Network Stack</p>
                        </div>
                    </div>
                    <div className="space-y-3 flex-1 mb-6">
                        <ul className="text-xs text-slate-500 space-y-2 list-disc list-inside">
                            <li>禁用 TCP Nagle 算法 (NoDelay)</li>
                            <li>TcpAckFrequency = 1 (降低 Ping 值)</li>
                            <li>NetworkThrottlingIndex (解除限速)</li>
                            <li>关闭网卡中断节流 (Interrupt Moderation)</li>
                            <li>关闭流控制与节能以太网</li>
                        </ul>
                    </div>
                    <div className="flex gap-3 mt-auto">
                        <button
                            onClick={() => handleOptimize('network', true)}
                            disabled={loading.network}
                            className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                        >
                            {loading.network ? '执行中...' : <><Play size={14} /> 一键优化</>}
                        </button>
                        <button
                            onClick={() => handleOptimize('network', false)}
                            disabled={loading.network}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all active:scale-95"
                            title="恢复默认设置"
                        >
                            <RotateCcw size={14} />
                        </button>
                    </div>
                </div>

                {/* Power & GPU Card */}
                <div className="glass rounded-2xl p-6 shadow-soft flex flex-col border border-white/40 group hover:border-violet-200 transition-all">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-white">
                            <Monitor size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">电源与 GPU 策略</h3>
                            <p className="text-xs text-slate-400">Power & GPU</p>
                        </div>
                    </div>
                    <div className="space-y-3 flex-1 mb-6">
                        <ul className="text-xs text-slate-500 space-y-2 list-disc list-inside">
                            <li>激活“卓越性能”电源计划</li>
                            <li>禁止 CPU 核心休眠 (Core Parking)</li>
                            <li>NVIDIA P-State P0 (强制最高频率)</li>
                            <li>禁用 NVIDIA PowerMizer 降频</li>
                            <li>禁用 AMD Ulps (超低功耗状态)</li>
                        </ul>
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-600">HAGS (硬件加速GPU计划)</span>
                            <button
                                onClick={toggleHags}
                                className={`w-12 h-6 rounded-full transition-colors relative ${status.hags ? 'bg-emerald-500' : 'bg-slate-200'}`}
                            >
                                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${status.hags ? 'translate-x-6' : ''}`} />
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">
                            {status.hags ? '建议 3A 大作/DLSS 3 开启' : '建议 CS2/Valorant 关闭'}
                        </p>
                    </div>
                    <div className="flex gap-3 mt-auto">
                        <button
                            onClick={() => handleOptimize('power', true)}
                            disabled={loading.power}
                            className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                        >
                            {loading.power ? '执行中...' : <><Play size={14} /> 一键优化</>}
                        </button>
                        <button
                            onClick={() => handleOptimize('power', false)}
                            disabled={loading.power}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all active:scale-95"
                            title="恢复默认设置"
                        >
                            <RotateCcw size={14} />
                        </button>
                    </div>
                </div>

                <div className="col-span-full mt-4">
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3 items-start">
                        <div className="mt-0.5 text-amber-600">
                            <Zap size={18} />
                        </div>
                        <div className="text-xs text-amber-700 leading-relaxed">
                            <span className="font-bold block mb-1">风险提示</span>
                            以上优化涉及注册表、电源计划及底层硬件参数的修改。虽然提供了还原功能，但不同硬件环境可能产生兼容性差异。建议在执行优化前，前往“设置”页面手动备份注册表。
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
