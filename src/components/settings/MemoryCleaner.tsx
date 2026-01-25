import React, { useState, useEffect } from 'react';
import { HardDrive, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface MemoryInfo {
    used: string;
    total: string;
    percent: number;
}

interface Result {
    success: boolean;
    message: string;
}

export function MemoryCleaner() {
    const [memInfo, setMemInfo] = useState<MemoryInfo | null>(null);
    const [cleaning, setCleaning] = useState(false);
    const [result, setResult] = useState<Result | null>(null);

    const fetchMemInfo = async () => {
        try {
            const info = await invoke<MemoryInfo>('get_memory_info');
            if (info) setMemInfo(info);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchMemInfo();
    }, []);

    const handleClear = async () => {
        setCleaning(true);
        setResult(null);
        try {
            await invoke('clear_memory');
            setResult({ success: true, message: '系统内存已清理' });
            await fetchMemInfo();
        } catch (e) {
            setResult({ success: false, message: '清理失败: ' + (e as string) });
        }
        setCleaning(false);
    };

    return (
        <div className="flex items-center gap-4">
            {memInfo && (
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <HardDrive size={14} className="text-slate-400" />
                        <span className="text-sm text-slate-600">
                            {memInfo.used} / {memInfo.total} GB
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${memInfo.percent > 80 ? 'bg-red-100 text-red-600' :
                            memInfo.percent > 60 ? 'bg-orange-100 text-orange-600' :
                                'bg-green-100 text-green-600'
                            }`}>
                            {memInfo.percent}%
                        </span>
                    </div>
                    <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className={`h-full transition-all duration-300 ${memInfo.percent > 80 ? 'bg-red-500' :
                                memInfo.percent > 60 ? 'bg-orange-500' :
                                    'bg-green-500'
                                }`}
                            style={{ width: `${memInfo.percent}%` }}
                        ></div>
                    </div>
                </div>
            )}

            <button
                onClick={handleClear}
                disabled={cleaning}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${cleaning
                    ? 'bg-slate-100 text-slate-400 cursor-wait'
                    : 'bg-violet-50 text-violet-600 hover:bg-violet-100'
                    }`}
            >
                <RefreshCw size={14} className={cleaning ? 'animate-spin' : ''} />
                {cleaning ? '清理中...' : '清理内存'}
            </button>

            {result && (
                <span className={`text-xs ${result.success ? 'text-green-600' : 'text-slate-500'}`}>
                    {result.message}
                </span>
            )}
        </div>
    );
}
