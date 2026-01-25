import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Save, Trash2, Check, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';

export function RegistryCleaner() {
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [backups, setBackups] = useState<string[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);

    // Load existing backups and check admin on mount
    useEffect(() => {
        loadBackups();
        checkAdminStatus();
    }, []);

    const checkAdminStatus = async () => {
        try {
            const result = await invoke<boolean>('check_admin');
            setIsAdmin(result);
        } catch (e) {
            console.error('Failed to check admin status:', e);
        }
    };

    const loadBackups = async () => {
        try {
            const list = await invoke<string[]>('list_registry_backups');
            setBackups(list);
        } catch (e) {
            console.error('Failed to load backups:', e);
        }
    };

    const handleBackup = async () => {
        setIsBackingUp(true);
        setStatus({ type: 'info', message: '正在备份注册表...' });

        try {
            await invoke('create_full_backup');
            setStatus({ type: 'success', message: '注册表备份成功!' });
            loadBackups();
        } catch (e) {
            setStatus({ type: 'error', message: `备份失败: ${e}` });
        } finally {
            setIsBackingUp(false);
        }
    };

    const handleDeleteBackup = async (event: React.MouseEvent, name: string) => {
        event.stopPropagation();

        const confirmed = await ask(`确定要永久删除备份文件 "${name}" 吗？`, {
            title: '删除确认',
            kind: 'error',
            okLabel: '确定删除',
            cancelLabel: '取消'
        });

        if (!confirmed) {
            return;
        }

        try {
            await invoke('delete_backup_by_name', { name });
            setStatus({ type: 'success', message: '备份文件已成功删除' });
            loadBackups();
        } catch (e) {
            setStatus({ type: 'error', message: `删除失败: ${e}` });
        }
    };

    return (
        <div className="glass rounded-2xl p-6 shadow-soft flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-200">
                        <Save size={20} className="text-white" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-slate-700">注册表备份管理</h3>
                            {isAdmin ? (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-green-50 text-[10px] font-bold text-green-600 border border-green-100 uppercase tracking-tighter">
                                    <Shield size={10} />
                                    管理员模式
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-50 text-[10px] font-bold text-red-600 border border-red-100 uppercase tracking-tighter">
                                    <AlertTriangle size={10} />
                                    非管理员
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-400">
                            Windows 注册表备份管理
                        </p>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4 mb-6">
                <button
                    onClick={handleBackup}
                    disabled={isBackingUp}
                    className="flex-1 px-3 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-orange-200 transition-all flex flex-col items-center gap-2 group"
                >
                    <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-colors">
                        <Save size={16} />
                    </div>
                    <span className="text-xs font-semibold">{isBackingUp ? '正在备份...' : '备份注册表'}</span>
                </button>
            </div>

            {/* Status */}
            {status && (
                <div className={`mb-6 px-4 py-3 rounded-xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300 ${status.type === 'success' ? 'bg-green-50 text-green-600 border border-green-100' :
                    status.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100' :
                        'bg-blue-50 text-blue-600 border border-blue-100'
                    }`}>
                    {status.type === 'success' ? <Check size={14} /> :
                        status.type === 'info' ? <RefreshCw size={14} className="animate-spin" /> :
                            <AlertTriangle size={14} />}
                    <span className="font-medium">{status.message}</span>
                </div>
            )}

            {/* Recent Backups */}
            <div className="flex-1">
                <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5 uppercase tracking-wider">
                        <Save size={12} className="text-slate-400" />
                        最近备份
                    </div>
                </div>
                <div className="space-y-2 overflow-y-auto max-h-[260px] pr-1">
                    {backups.length === 0 ? (
                        <div className="text-center text-slate-400 py-10 border-2 border-dashed border-slate-100 rounded-xl text-xs">
                            暂无备份记录
                        </div>
                    ) : (
                        backups.map(b => (
                            <div
                                key={b}
                                onClick={() => invoke('open_backup_folder')}
                                title="点击打开本地备份文件夹"
                                className="group p-3 rounded-xl bg-slate-50/50 border border-slate-100 hover:border-orange-200 transition-all flex items-center justify-between cursor-pointer"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-orange-500 transition-colors">
                                        <Save size={14} />
                                    </div>
                                    <span className="text-xs font-medium text-slate-600 truncate max-w-[200px]">
                                        {b}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={(e) => handleDeleteBackup(e, b)}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 text-red-600 rounded-lg transition-all"
                                        title="删除此备份"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Hint */}
            <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 leading-relaxed italic">
                    提示: 在进行系统优化前建议先备份注册表。单击备份项可快速打开本地文件夹。
                </p>
            </div>
        </div>
    );
}
