import React from 'react';

interface HeaderProps {
    cpuModel?: string;
}

export default function Header({ cpuModel }: HeaderProps) {
    return (
        <div className="relative w-full py-2 bg-white border-b border-slate-100 select-none overflow-hidden leading-none">
            <div className="flex flex-col items-center justify-center gap-1">
                {/* Logo and Title Section */}
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
                        <span className="text-white font-black text-sm tracking-tighter">TN</span>
                    </div>
                    <h1 className="text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent tracking-tight">
                        Task Nexus
                    </h1>
                </div>

                {/* Sub-info Section: Group Chat */}
                <div className="flex items-center gap-1.5 opacity-60">
                    <div className="w-1 h-1 rounded-full bg-violet-400 animate-pulse" />
                    <span className="text-[10px] font-semibold text-slate-500 tracking-wide">
                        反馈及获取更新群：629474892
                    </span>
                </div>
            </div>
        </div>
    );
}
