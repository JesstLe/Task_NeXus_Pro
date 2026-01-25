import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function TimerResolutionControl() {
    const [resolution, setResolution] = useState(0);
    const [loading, setLoading] = useState(false);
    const [inputVal, setInputVal] = useState('1.0');

    const fetchResolution = async () => {
        try {
            const res = await invoke<number>('get_timer_resolution');
            setResolution(res);
            if (res > 0 && inputVal === '1.0') setInputVal(res.toString());
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchResolution();
    }, []);

    const handleSet = async () => {
        setLoading(true);
        const val = parseFloat(inputVal);
        if (!isNaN(val)) {
            try {
                const actual = await invoke<number>('set_timer_resolution', { resMs: val });
                setResolution(actual);
            } catch (e) {
                console.error(e);
                alert('设置失败: ' + (e as string));
            }
        }
        setLoading(false);
    };

    const handleDisable = async () => {
        setLoading(true);
        try {
            const actual = await invoke<number>('set_timer_resolution', { resMs: 0 });
            setResolution(actual);
        } catch (e) {
            console.error(e);
            alert('关闭失败: ' + (e as string));
        }
        setLoading(false);
    };

    return (
        <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition-all ${resolution > 0 ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-slate-50'
                }`}>
                <input
                    type="text"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    placeholder="ms"
                    className="w-12 bg-transparent text-xs text-center focus:outline-none"
                    disabled={loading}
                />
                <span className="text-xs text-slate-400">ms</span>
            </div>

            <button
                onClick={handleSet}
                disabled={loading}
                className="px-2 py-1 text-xs bg-violet-500 text-white rounded-lg hover:bg-violet-600 disabled:opacity-50"
            >
                应用
            </button>

            {resolution > 0 && (
                <button
                    onClick={handleDisable}
                    disabled={loading}
                    className="px-2 py-1 text-xs bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200"
                >
                    关闭
                </button>
            )}

            {resolution > 0 && (
                <span className="text-xs text-green-600 ml-1 font-mono">
                    当前: {resolution.toFixed(4).replace(/\.?0+$/, '')}ms
                </span>
            )}
        </div>
    );
}
