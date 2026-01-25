import React from 'react';
import { SlidersHorizontal, Shield, Cpu, Activity, Cpu as CpuIcon, Layers, Zap } from 'lucide-react';

export default function AdvancedPanel() {
    const features = [
        {
            title: "核心隔离 (Core Isolation)",
            desc: "完全隔离特定核心，仅供指定高性能应用独占使用。",
            icon: Shield,
            status: "开发中",
            color: "text-blue-500",
            bg: "bg-blue-50"
        },
        {
            title: "中断定向 (Interrupt Affinity)",
            desc: "将网卡、显卡等硬件中断映射到特定的能效核心，减少对大核的干扰。",
            icon: Activity,
            status: "规划中",
            color: "text-emerald-500",
            bg: "bg-emerald-50"
        },
        {
            title: "三级缓存分析 (L3 Cache Analysis)",
            desc: "实时监控 L3 缓存命中率与延迟，优化缓存敏感型任务。",
            icon: Layers,
            status: "占位",
            color: "text-purple-500",
            bg: "bg-purple-50"
        },
        {
            title: "自定义电压曲线 (Voltage Curve)",
            desc: "为特定进程申请临时的电压或频率调优 (需驱动支持)。",
            icon: Zap,
            status: "规划中",
            color: "text-orange-500",
            bg: "bg-orange-50"
        }
    ];

    return (
        <div className="glass rounded-2xl p-6 shadow-soft h-full flex flex-col space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                    <SlidersHorizontal size={20} className="text-white" />
                </div>
                <div>
                    <h3 className="font-semibold text-slate-700">高级选项工具箱</h3>
                    <p className="text-xs text-slate-400">底层参数深度调优，适合高级用户 (实验性功能)</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                {features.map((feature, idx) => (
                    <div key={idx} className="p-4 rounded-2xl border border-slate-100 bg-white/50 hover:border-violet-200 transition-all group relative overflow-hidden">
                        <div className="flex items-start gap-4">
                            <div className={`p-3 rounded-xl ${feature.bg} ${feature.color}`}>
                                <feature.icon size={24} />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-bold text-slate-700 text-sm">{feature.title}</h4>
                                    <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">
                                        {feature.status}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                    {feature.desc}
                                </p>
                            </div>
                        </div>
                        {/* Overlay for "Under Construction" feel */}
                        <div className="absolute inset-0 bg-slate-50/20 backdrop-blur-[1px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="bg-slate-900 text-white text-[10px] px-3 py-1 rounded-full font-bold shadow-lg">
                                COMING SOON
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3 items-start">
                <CpuIcon size={18} className="text-amber-600 mt-0.5" />
                <div className="text-xs text-amber-700 leading-relaxed">
                    <span className="font-bold block mb-1">免责声明</span>
                    高级功能涉及系统内核级参数调整，不当设置可能导致系统不稳定或蓝屏。请确保您了解每项参数的含义。
                </div>
            </div>
        </div>
    );
}
