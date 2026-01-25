import React, { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';

interface Process {
    name: string;
    [key: string]: any;
}

interface ThrottleListEditorProps {
    items: string[];
    onUpdate: (items: string[]) => void;
    processes: Process[];
}

export function ThrottleListEditor({ items = [], onUpdate, processes = [] }: ThrottleListEditorProps) {
    const [selectedProcess, setSelectedProcess] = useState('');

    const uniqueProcessNames = useMemo(() => {
        const names = new Set(processes.map(p => p.name));
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    }, [processes]);

    const add = () => {
        if (selectedProcess && !items.includes(selectedProcess)) {
            onUpdate([...items, selectedProcess]);
            setSelectedProcess('');
        }
    };

    const remove = (item: string) => {
        onUpdate(items.filter(x => x !== item));
    };

    return (
        <div className="mt-2 space-y-2">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <select
                        value={selectedProcess}
                        onChange={(e) => setSelectedProcess(e.target.value)}
                        className="w-full appearance-none px-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 text-slate-700"
                    >
                        <option value="">选择进程...</option>
                        {uniqueProcessNames.map(name => (
                            <option key={name} value={name} disabled={items.includes(name)}>
                                {name} {items.includes(name) ? '(已添加)' : ''}
                            </option>
                        ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>
                <button
                    onClick={add}
                    disabled={!selectedProcess}
                    className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    添加
                </button>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
                {items.length === 0 && <div className="text-xs text-slate-400 text-center py-2">没有添加任何压制程序</div>}
                {items.map(item => (
                    <div key={item} className="flex items-center justify-between px-2 py-1 bg-red-50 rounded text-xs border border-red-100">
                        <span className="text-red-700">{item}</span>
                        <button onClick={() => remove(item)} className="text-red-300 hover:text-red-600">×</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
