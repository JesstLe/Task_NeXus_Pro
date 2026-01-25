import React from 'react';
import { Zap, Scale, Trash2, Download, Upload, Settings, AlertOctagon } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';

// Import split components
import { MemoryCleaner } from './MemoryCleaner';
import { PowerPlanControl, PowerPlanDropZone } from './PowerSettings';
import { TimerResolutionControl } from './TimerResolution';
import { SmartTrimControl } from './SmartTrimControl';
import { ThrottleListEditor } from './ThrottleListEditor';
import { GameListEditor } from './GameListEditor';
import { AppSettings, ProcessProfile, TimeBombStatus } from '../../types';

interface SettingsPanelProps {
    mode: string;
    onModeChange: (mode: string) => void;
    settings: AppSettings;
    onSettingChange: (key: string, value: any) => void;
    onRemoveProfile: (name: string) => void;
    processes: any[];
}

export default function SettingsPanel({
    mode,
    onModeChange,
    settings,
    onSettingChange,
    onRemoveProfile,
    processes = []
}: SettingsPanelProps) {
    const [bombStatus, setBombStatus] = React.useState<TimeBombStatus | null>(null);
    const [backupPath, setBackupPath] = React.useState<string>('');
    const [backingUp, setBackingUp] = React.useState(false);

    React.useEffect(() => {
        invoke<TimeBombStatus>('check_expiration').then(setBombStatus).catch(console.error);
        invoke<string>('get_backup_path').then(setBackupPath).catch(console.error);
    }, []);

    const handleBackupRegistry = async () => {
        setBackingUp(true);
        try {
            await invoke('create_full_backup');
            alert('注册表备份成功！');
        } catch (e) {
            alert('备份失败: ' + e);
        } finally {
            setBackingUp(false);
        }
    };

    const handleImport = async () => {
        if (!confirm("导入配置将覆盖当前的核心调优设置 (Profiles, SmartTrim, ProBalance 等)，确定继续吗？")) return;
        try {
            const path = await open({
                filters: [{ name: 'JSON Config', extensions: ['json'] }],
            });
            if (!path) return;

            await invoke('import_config_file', { path });
            alert("配置导入成功，即将刷新页面");
            window.location.reload();
        } catch (e) {
            console.error(e);
            alert("导入失败: " + (e as string));
        }
    };

    const handleExport = async () => {
        try {
            const path = await save({
                filters: [{ name: 'JSON Config', extensions: ['json'] }],
                defaultPath: 'task-nexus-config.json',
            });
            if (!path) return;
            await invoke('export_config_file', { path });
            alert("配置导出成功");
        } catch (e) {
            console.error(e);
            alert("导出失败: " + (e as string));
        }
    };

    const modes = [
        { id: 'dynamic', label: 'T mode1', icon: Zap },
        { id: 'd2', label: 'T mode2', icon: Scale, note: '笔记本可用' },
        { id: 'd3', label: 'T mode3', icon: Zap },
        { id: 'custom', label: '自定义', icon: Settings, note: '高级配置' },
    ];

    return (
        <div className="space-y-4">
            {/* Beta Expiration Info */}
            {bombStatus && (
                <div className="glass rounded-2xl p-4 shadow-soft border border-orange-100 bg-orange-50/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                            <AlertOctagon size={20} />
                        </div>
                        <div>
                            <h4 className="font-medium text-slate-700 text-sm">内测版有效期</h4>
                            <p className="text-xs text-slate-500">
                                截止日期: <span className="font-mono font-bold text-orange-600">{bombStatus.expiration_date}</span>
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-slate-700 font-mono">{bombStatus.days_remaining}</div>
                        <p className="text-[10px] text-slate-400">剩余天数</p>
                    </div>
                </div>
            )}

            {/* 自动化策略 */}
            <div className="glass rounded-2xl p-5 shadow-soft">
                <h4 className="font-medium text-slate-700 mb-4">自动化策略</h4>

                {!settings.profiles || settings.profiles.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-sm bg-slate-50/50 rounded-xl border border-slate-100 border-dashed">
                        暂无已保存的自动化策略
                        <div className="mt-1 text-xs opacity-70">在控制栏点击“保存策略”添加</div>
                    </div>
                ) : (
                    <div className="space-y-2.5">
                        {settings.profiles.map((profile) => (
                            <div key={profile.name} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl group hover:border-violet-200 transition-colors">
                                <div>
                                    <div className="font-medium text-slate-700 text-sm">{profile.name}</div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500">
                                            {modes.find(m => m.id === profile.mode)?.label || profile.mode}
                                        </span>
                                        {profile.priority && (
                                            <span className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-500">
                                                优先级: {profile.priority}
                                            </span>
                                        )}
                                        <span className="text-[10px] text-slate-400">
                                            {new Date(profile.timestamp).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onRemoveProfile(profile.name)}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                    title="删除策略"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 默认规则 */}
            <div className="glass rounded-2xl p-5 shadow-soft">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h4 className="font-medium text-slate-700">默认规则</h4>
                        <p className="text-xs text-slate-400 mt-0.5">自动管理进程核心分配</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!!settings.defaultRules?.enabled}
                            onChange={(e) => onSettingChange('defaultRules', {
                                ...settings.defaultRules,
                                enabled: e.target.checked
                            })}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                    </label>
                </div>

                {settings.defaultRules?.enabled && (
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-3 text-sm">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-slate-600">游戏进程 → P-Core / CCD0 (高优先级)</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span className="text-slate-600">其他进程 → E-Core / CCD1 (低优先级)</span>
                        </div>
                        <div className="pt-2 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-slate-500">游戏列表</span>
                            </div>
                            <GameListEditor
                                games={settings.gameList || []}
                                onUpdate={(list) => onSettingChange('gameList', list)}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* ProBalance */}
            <div className="glass rounded-2xl p-5 shadow-soft">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h4 className="font-medium text-slate-700">ProBalance</h4>
                        <p className="text-xs text-slate-400 mt-0.5">当游戏运行时，自动压制高负载后台进程</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!!settings.proBalance?.enabled}
                            onChange={(e) => onSettingChange('proBalance', {
                                ...settings.proBalance,
                                enabled: e.target.checked
                            })}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                    </label>
                </div>

                {settings.proBalance?.enabled && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                        <span className="text-xs text-slate-500 whitespace-nowrap">触发阈值 (CPU %)</span>
                        <div className="flex-1 flex items-center gap-2">
                            <input
                                type="range"
                                min="5"
                                max="50"
                                step="1"
                                value={settings.proBalance?.cpuThreshold || 20}
                                onChange={(e) => onSettingChange('proBalance', {
                                    ...settings.proBalance,
                                    cpuThreshold: parseInt(e.target.value)
                                })}
                                className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-500"
                            />
                            <span className="w-8 text-xs text-right font-mono text-slate-600">
                                {settings.proBalance?.cpuThreshold || 20}%
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* 内存优化 */}
            <div className="glass rounded-2xl p-5 shadow-soft">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-slate-700">内存优化</h4>
                    <MemoryCleaner />
                </div>
                <SmartTrimControl
                    settings={settings.smartTrim}
                    onUpdate={(val) => onSettingChange('smartTrim', val)}
                />
            </div>

            {/* 电源计划 */}
            <div className="glass rounded-2xl p-5 shadow-soft">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-slate-700">电源计划</h4>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">拖入.pow导入</span>
                        <PowerPlanControl />
                    </div>
                </div>
                <PowerPlanDropZone />
            </div>

            {/* 后台压制 */}
            <div className="glass rounded-2xl p-5 shadow-soft">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-slate-700">后台进程压制</h4>
                </div>
                <ThrottleListEditor
                    items={settings.throttleList || []}
                    onUpdate={(list) => onSettingChange('throttleList', list)}
                    processes={processes}
                />
            </div>

            {/* 高精度定时器 */}
            <div className="glass rounded-2xl p-5 shadow-soft">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="font-medium text-slate-700">高精度定时器</h4>
                        <p className="text-xs text-slate-400 mt-0.5">降低输入延迟</p>
                    </div>
                    <TimerResolutionControl />
                </div>
            </div>

            {/* 注册表备份 */}
            <div className="glass rounded-2xl p-5 shadow-soft">
                <h4 className="font-medium text-slate-700 mb-4">注册表备份</h4>
                <div className="space-y-3">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="text-xs text-slate-500 mb-2">备份保存路径：</div>
                        <div className="text-xs font-mono text-slate-600 break-all bg-white p-2 rounded border border-slate-200">
                            {backupPath || '加载中...'}
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleBackupRegistry}
                            disabled={backingUp}
                            className="flex-1 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                        >
                            {backingUp ? '备份中...' : <React.Fragment><Download size={14} /> 立即备份注册表</React.Fragment>}
                        </button>
                        <button
                            onClick={() => invoke('open_backup_folder')}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-2"
                        >
                            <Settings size={14} /> 打开文件夹
                        </button>
                    </div>
                </div>
            </div>

            {/* 系统设置 */}
            <div className="glass rounded-2xl p-5 shadow-soft">
                <h4 className="font-medium text-slate-700 mb-4">系统设置</h4>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h5 className="font-medium text-slate-700">开机自启动</h5>
                            <p className="text-xs text-slate-400">系统启动时自动运行程序</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!settings.launchOnStartup}
                                onChange={(e) => onSettingChange('launchOnStartup', e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <h5 className="font-medium text-slate-700">关闭时最小化</h5>
                            <p className="text-xs text-slate-400">点击关闭按钮时隐藏到托盘</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!settings.closeToTray}
                                onChange={(e) => onSettingChange('closeToTray', e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between">
                        <div>
                            <h5 className="font-medium text-slate-700">启动时最小化</h5>
                            <p className="text-xs text-slate-400">程序启动时自动隐藏到托盘</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!!settings.startMinimized}
                                onChange={(e) => onSettingChange('startMinimized', e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                        </label>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex gap-3">
                        <button
                            onClick={handleImport}
                            className="flex-1 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <Download size={16} />
                            导入配置
                        </button>
                        <button
                            onClick={handleExport}
                            className="flex-1 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <Upload size={16} />
                            导出配置
                        </button>
                    </div>

                    <div className="pt-4 text-center">
                        <div className="p-3 bg-violet-50 rounded-xl border border-violet-100 inline-block">
                            <p className="text-sm font-bold text-violet-700 flex items-center gap-2 justify-center">
                                <span>反馈及获取更新群聊：</span>
                                <span className="text-lg">629474892</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
