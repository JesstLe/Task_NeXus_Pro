import React, { useState, useRef, useEffect } from 'react';
import {
    ChevronRight, Zap, CheckSquare, Cpu, XCircle
} from 'lucide-react';
import { ProcessInfo } from '../../types';

const PRIORITY_MAP_CN: Record<string, string> = {
    'RealTime': '实时',
    'High': '高',
    'AboveNormal': '高于正常',
    'Normal': '正常',
    'BelowNormal': '低于正常',
    'Idle': '低'
};

interface ContextMenuItemProps {
    label: string;
    icon?: any;
    shortcut?: string;
    subMenu?: React.ReactNode;
    onClick?: () => void;
    danger?: boolean;
}

const ContextMenuItem = ({ label, icon: Icon, shortcut, subMenu, onClick, danger }: ContextMenuItemProps) => {
    const [showSub, setShowSub] = useState(false);
    const [subPos, setSubPos] = useState({ top: 0, left: '100%' });
    const timerRef = useRef<any>(null);
    const subRef = useRef<HTMLDivElement>(null);

    const handleMouseEnter = (e: React.MouseEvent) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setShowSub(true);

        // Calculate sub-menu position after it's rendered
        setTimeout(() => {
            if (subRef.current) {
                const rect = subRef.current.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                let left = '100%';
                let top = 0;

                // Check right boundary
                if (rect.right > viewportWidth) {
                    left = '-100%'; // Flip to left
                }

                // Check bottom boundary
                if (rect.bottom > viewportHeight) {
                    top = viewportHeight - rect.bottom - 10; // Shift up
                }

                setSubPos({ top, left });
            }
        }, 0);
    };

    const handleMouseLeave = () => {
        timerRef.current = setTimeout(() => {
            setShowSub(false);
        }, 200);
    };

    return (
        <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
            <button
                onClick={onClick}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors
          ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-violet-50 hover:text-violet-600'}
        `}
            >
                {Icon && <Icon size={14} className={danger ? 'text-red-500' : 'text-slate-400'} />}
                <span className="flex-1">{label}</span>
                {shortcut && <span className="text-slate-400 text-[10px]">{shortcut}</span>}
                {subMenu && <ChevronRight size={12} className="text-slate-400" />}
            </button>

            {subMenu && showSub && (
                <div
                    ref={subRef}
                    className="absolute min-w-[10rem] w-max bg-white/95 backdrop-blur-xl rounded-lg shadow-xl border border-slate-200/60 p-1 z-50 animate-in fade-in slide-in-from-left-2 duration-100"
                    style={{ left: subPos.left, top: subPos.top, marginLeft: subPos.left === '100%' ? '4px' : '-4px' }}
                >
                    {subMenu}
                </div>
            )}
        </div>
    );
};

export const ThreadBindingSelector = ({ process, initialCore, onBind }: { process: ProcessInfo, initialCore?: number | null, onBind: (core: number) => void }) => {
    const coreCount = navigator.hardwareConcurrency || 16;
    const [selectedCore, setSelectedCore] = useState(initialCore ?? 0);

    return (
        <div className="p-2 w-64">
            <div className="text-xs font-bold text-slate-500 mb-2">选择目标核心 (绑定帧线程)</div>
            <div className="grid grid-cols-4 gap-1 mb-2 max-h-32 overflow-y-auto">
                {Array.from({ length: coreCount }).map((_, i) => (
                    <button
                        key={i}
                        onClick={(e) => { e.stopPropagation(); setSelectedCore(i); }}
                        className={`h-8 rounded text-[10px] font-mono transition-colors ${selectedCore === i ? 'bg-green-500 text-white shadow-sm' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                    >
                        {i}
                    </button>
                ))}
            </div>
            <button
                onClick={() => onBind(selectedCore)}
                className="w-full py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors shadow-sm"
            >
                绑定帧线程 → Core {selectedCore}
            </button>
        </div>
    );
};

interface ProcessContextMenuProps {
    x: number;
    y: number;
    process: ProcessInfo;
    onClose: () => void;
    onAction: (cmd: string, args: any) => void;
    initialPrimaryCore?: number | null;
}

export const ProcessContextMenu = ({ x, y, process, onClose, onAction, initialPrimaryCore }: ProcessContextMenuProps) => {
    const [position, setPosition] = useState({ top: y, left: x });
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            let newTop = y;
            let newLeft = x;
            if (y + rect.height > viewportHeight) newTop = y - rect.height;
            if (x + rect.width > viewportWidth) newLeft = viewportWidth - rect.width - 10;
            setPosition({ top: newTop, left: newLeft });
        }
    }, [x, y]);

    return (
        <div
            ref={menuRef}
            className="fixed z-[9999] w-56 bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-slate-200/60 p-1.5 animate-in fade-in zoom-in-95 duration-100"
            style={position}
            onMouseLeave={onClose}
        >
            <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <div className="font-bold text-xs text-slate-800 truncate">{process.name}</div>
                <div className="text-[10px] text-slate-500 font-mono">PID: {process.pid}</div>
            </div>
            <div className="py-1 space-y-0.5">
                <ContextMenuItem
                    label="优先级 (Priority)"
                    icon={Zap}
                    subMenu={
                        <>
                            <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase">选择等级</div>
                            {['RealTime', 'High', 'AboveNormal', 'Normal', 'BelowNormal', 'Idle'].map(p => (
                                <ContextMenuItem
                                    key={p}
                                    label={`${PRIORITY_MAP_CN[p]} (${p})`}
                                    onClick={() => { onAction('set_process_priority', { pid: process.pid, priority: p }); onClose(); }}
                                    icon={p === process.priority ? CheckSquare : undefined}
                                />
                            ))}
                        </>
                    }
                />
                <ContextMenuItem
                    label="CPU 亲和性 (智能调优)"
                    icon={Cpu}
                    onClick={() => { onAction('open_affinity_modal', { process }); onClose(); }}
                />
                <ContextMenuItem
                    label="线程绑定 (帧线程优化)"
                    icon={Zap}
                    subMenu={
                        <ThreadBindingSelector
                            process={process}
                            initialCore={initialPrimaryCore}
                            onBind={(targetCore) => { onAction('bind_heaviest_thread', { pid: process.pid, targetCore }); onClose(); }}
                        />
                    }
                />
                <div className="my-1 border-t border-slate-100"></div>
                <ContextMenuItem label="结束进程" icon={XCircle} danger onClick={() => { onAction('terminate_process', { pid: process.pid }); onClose(); }} />
            </div>
        </div>
    );
};
