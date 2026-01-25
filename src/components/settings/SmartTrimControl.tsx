import React, { useState } from 'react';
import { SmartTrimSettings } from '../../types';

interface SmartTrimControlProps {
    settings?: SmartTrimSettings;
    onUpdate: (val: SmartTrimSettings) => void;
}

const DEFAULT_SETTINGS: SmartTrimSettings = {
    enabled: false,
    threshold: 80,
    mode: 'standby-only'
};

export function SmartTrimControl({ settings, onUpdate }: SmartTrimControlProps) {
    const currentSettings = settings || DEFAULT_SETTINGS;
    // Use a local state for the threshold to make slider movement smooth
    const [localThreshold, setLocalThreshold] = useState(currentSettings.threshold);

    const toggle = () => {
        onUpdate({
            ...currentSettings,
            enabled: !currentSettings.enabled
        });
    };

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalThreshold(parseInt(e.target.value));
    };

    const handleSliderCommit = () => {
        onUpdate({
            ...currentSettings,
            threshold: localThreshold
        });
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = parseInt(e.target.value);
        if (!isNaN(val)) {
            if (val < 1) val = 1;
            if (val > 100) val = 100;
            setLocalThreshold(val);
        }
    };

    const handleInputBlur = () => {
        let val = localThreshold;
        if (val < 20) val = 20;
        if (val > 95) val = 95;
        setLocalThreshold(val);
        onUpdate({
            ...currentSettings,
            threshold: val
        });
    };

    return (
        <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <span className="text-sm text-slate-600 font-medium">SmartTrim 自动优化</span>
                    <p className="text-xs text-slate-400">内存超过阈值时自动清理备用列表（不影响游戏）</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        checked={!!currentSettings.enabled}
                        onChange={toggle}
                        className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
                </label>
            </div>

            {settings?.enabled && (
                <div className="flex items-center gap-3 pl-1">
                    <span className="text-xs text-slate-500 whitespace-nowrap">触发阈值</span>
                    <div className="flex-1 flex items-center gap-2">
                        <input
                            type="range"
                            min="20"
                            max="95"
                            step="1"
                            value={localThreshold}
                            onChange={handleSliderChange}
                            onMouseUp={handleSliderCommit}
                            className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-500"
                        />
                        <div className="flex items-center relative">
                            <input
                                type="number"
                                value={localThreshold}
                                onChange={handleInputChange}
                                onBlur={handleInputBlur}
                                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                                className="w-10 text-xs text-center border-none bg-transparent font-medium text-slate-600 focus:ring-0"
                            />
                            <span className="text-xs text-slate-400 absolute right-0 pointer-events-none">%</span>
                        </div>
                    </div>
                </div>
            )}

            {settings?.enabled && (
                <div className="flex items-center gap-3 pl-1 mt-3">
                    <span className="text-xs text-slate-500 whitespace-nowrap">清理模式</span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => onUpdate({ ...currentSettings, mode: 'standby-only' })}
                            className={`px-2 py-1 text-xs rounded transition-colors ${(currentSettings.mode || 'standby-only') === 'standby-only'
                                ? 'bg-green-100 text-green-700 font-medium'
                                : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                                }`}
                            title="仅清理备用内存列表，无副作用 (推荐)"
                        >
                            安全 (Standby)
                        </button>
                        <button
                            onClick={() => onUpdate({ ...currentSettings, mode: 'working-set' })}
                            className={`px-2 py-1 text-xs rounded transition-colors ${currentSettings.mode === 'working-set'
                                ? 'bg-red-100 text-red-700 font-medium'
                                : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                                }`}
                            title="强制压缩后台进程内存，可能导致切换程序时轻微卡顿"
                        >
                            激进 (Working Set)
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
