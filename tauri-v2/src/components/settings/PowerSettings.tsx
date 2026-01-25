import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface PowerPlan {
    guid: string;
    name: string;
    active: boolean;
}

interface ListResult {
    success: boolean;
    plans: PowerPlan[];
}

interface CurrentResult {
    success: boolean;
    guid: string;
    name: string;
}

export function PowerPlanControl() {
    const [currentPlanGuid, setCurrentPlanGuid] = useState<string>('');
    const [plans, setPlans] = useState<PowerPlan[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchPlans = async () => {
        try {
            const listRes = await invoke<ListResult>('list_power_plans');
            const currentRes = await invoke<CurrentResult>('get_power_plan');

            if (listRes && listRes.plans) setPlans(listRes.plans);
            if (currentRes && currentRes.guid) setCurrentPlanGuid(currentRes.guid);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchPlans();
        const handleUpdate = () => fetchPlans();
        window.addEventListener('power-plan-update', handleUpdate);
        return () => {
            window.removeEventListener('power-plan-update', handleUpdate);
        }
    }, []);

    const switchPlan = async (guid: string) => {
        setLoading(true);
        try {
            await invoke('set_power_plan', { plan: guid });
            setCurrentPlanGuid(guid);
            await fetchPlans(); // 刷新以获取最新的 active 状态
        } catch (e) {
            console.error(e);
            alert('切换电源计划失败: ' + (e as string));
        }
        setLoading(false);
    };

    const openSettings = async () => {
        try {
            await invoke('open_power_settings');
        } catch (e) {
            console.error(e);
            alert('无法打开电源设置: ' + (e as string));
        }
    };

    const handleDelete = async (guid: string, name: string) => {
        // 防止删除当前正在使用的计划
        if (guid === currentPlanGuid) {
            alert('无法删除正在使用的电源计划');
            return;
        }

        if (confirm(`确定要删除电源计划 "${name}" 吗？`)) {
            try {
                const res = await invoke<any>('delete_power_plan', { guid });
                if (res.success) {
                    fetchPlans();
                }
            } catch (e) {
                console.error(e);
                alert('删除失败: ' + (e as string));
            }
        }
    };

    return (
        <div className="flex items-center gap-2 flex-wrap justify-end max-w-[300px]">
            {plans.map(p => (
                <button
                    key={p.guid}
                    onClick={() => switchPlan(p.guid)}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        handleDelete(p.guid, p.name);
                    }}
                    disabled={loading}
                    title={p.guid + " (右键删除)"}
                    className={`px-2.5 py-1 text-xs rounded-lg transition-all truncate max-w-[100px] ${currentPlanGuid === p.guid || p.active
                        ? 'bg-violet-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                >
                    {p.name.replace(' (Active)', '')}
                </button>
            ))}
            <button onClick={openSettings} className="px-2 py-1 text-xs bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200">⚙</button>
        </div>
    );
}

export function PowerPlanDropZone() {
    const [dragging, setDragging] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);

        const files = Array.from(e.dataTransfer.files);
        const powFile = files.find(f => f.name.endsWith('.pow'));

        if (!powFile) {
            setMessage({ type: 'error', text: '请拖放 .pow 文件' });
            setTimeout(() => setMessage(null), 3000);
            return;
        }

        try {
            // NOTE: powFile.path might not be available in browser sandbox, but Tauri allows getting path if configured.
            // In Tauri v2, we might need a better way if this is strictly sandboxed. 
            // Assuming it works for now as the previous Electron code used .path
            const result = await invoke<{ success: boolean, error?: string }>('import_power_plan', { path: (powFile as any).path });
            if (result.success) {
                setMessage({ type: 'success', text: '导入成功！' });
                window.dispatchEvent(new Event('power-plan-update'));
            } else {
                setMessage({ type: 'error', text: result.error || '导入失败' });
            }
        } catch (e) {
            setMessage({ type: 'error', text: '导入失败: ' + (e as string) });
        }
        setTimeout(() => setMessage(null), 3000);
    };

    return (
        <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`mt-3 p-3 border-2 border-dashed rounded-xl text-center text-xs transition-all ${dragging
                ? 'border-violet-400 bg-violet-50 text-violet-600'
                : 'border-slate-200 text-slate-400 hover:border-slate-300'
                }`}
        >
            {message ? (
                <span className={message.type === 'success' ? 'text-green-600' : 'text-red-500'}>
                    {message.text}
                </span>
            ) : (
                <span>拖放 .pow 文件到此处导入电源计划</span>
            )}
        </div>
    );
}
