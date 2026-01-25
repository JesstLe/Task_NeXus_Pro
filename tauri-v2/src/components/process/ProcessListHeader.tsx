import React from 'react';
import { ArrowUp, ArrowDown, CheckSquare, Square } from 'lucide-react';
import { ProcessInfo } from '../../types';

const GRID_COLS_CLASS = "grid grid-cols-[3.5%_22%_10%_8%_8%_7%_8%_8%_25.5%]";

interface ProcessListHeaderProps {
    selectedPids: Set<number>;
    processTreeData: any[]; // Extended ProcessInfo with tree data
    sortedProcesses: ProcessInfo[];
    treeViewMode: boolean;
    onToggleSelectAll: () => void;
    sortConfig: { key: string, direction: 'asc' | 'desc' };
    setSortConfig: React.Dispatch<React.SetStateAction<{ key: string, direction: 'asc' | 'desc' }>>;
}

export const ProcessListHeader: React.FC<ProcessListHeaderProps> = ({
    selectedPids,
    processTreeData,
    sortedProcesses,
    treeViewMode,
    onToggleSelectAll,
    sortConfig,
    setSortConfig
}) => {
    return (
        <div className={`${GRID_COLS_CLASS} gap-px bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase pr-2 sticky top-0 z-10`}>
            <div
                className="p-2 flex items-center justify-center cursor-pointer hover:bg-slate-200 transition-colors"
                onClick={onToggleSelectAll}
            >
                {selectedPids.size > 0 && selectedPids.size >= (treeViewMode ? processTreeData.length : sortedProcesses.length)
                    ? <CheckSquare size={12} className="text-violet-600" />
                    : selectedPids.size > 0
                        ? <div className="w-3 h-3 bg-violet-400 rounded-sm flex items-center justify-center"><div className="w-2 h-0.5 bg-white" /></div>
                        : <Square size={12} />}
            </div>
            {[
                { label: '名称', key: 'name' },
                { label: '用户', key: 'user' },
                { label: 'PID', key: 'pid' },
                { label: '优先级', key: 'priority' },
                { label: '亲和性', key: 'cpu_affinity' },
                { label: 'CPU', key: 'cpu' },
                { label: '内存', key: 'memory' },
                { label: '路径', key: 'path' }
            ].map(col => {
                const isSorted = sortConfig.key === col.key;
                return (
                    <div
                        key={col.key}
                        className={`p-2 flex items-center gap-1 cursor-pointer hover:bg-slate-200 transition-colors group ${isSorted ? 'text-violet-600 bg-violet-50/50' : ''}`}
                        onClick={() => setSortConfig(prev => ({
                            key: col.key,
                            direction: prev.key === col.key && prev.direction === 'desc' ? 'asc' : 'desc'
                        }))}
                    >
                        {col.label}
                        {isSorted ? (
                            sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                        ) : (
                            <ArrowUp size={10} className="opacity-0 group-hover:opacity-30" />
                        )}
                    </div>
                );
            })}
        </div>
    );
};
