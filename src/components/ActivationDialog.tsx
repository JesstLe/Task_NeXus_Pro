import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Key, Copy, Check, AlertCircle, ExternalLink, Loader } from 'lucide-react';
import { clsx } from 'clsx';

interface ActivationDialogProps {
    onActivated: () => void;
}

export default function ActivationDialog({ onActivated }: ActivationDialogProps) {
    const [machineCode, setMachineCode] = useState<string>('加载中...');
    const [licenseKey, setLicenseKey] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [activating, setActivating] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState<boolean>(false);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const status: any = await invoke('get_license_status');
                setMachineCode(status.machineCode);
            } catch (e) {
                console.error('Failed to fetch machine code', e);
                setMachineCode('ERROR');
            } finally {
                setLoading(false);
            }
        };
        fetchStatus();
    }, []);

    const handleActivate = async () => {
        if (!licenseKey.trim()) return;
        setActivating(true);
        setError(null);
        try {
            const success = await invoke<boolean>('activate_license', { key: licenseKey.trim() });
            if (success) {
                onActivated();
            }
        } catch (e: any) {
            setError(e.toString());
        } finally {
            setActivating(false);
        }
    };

    const copyMachineCode = () => {
        navigator.clipboard.writeText(machineCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#3c2a85]/90 backdrop-blur-sm p-4">
            <div className="w-full max-w-[480px] bg-white rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="p-10">
                    <div className="flex items-center gap-4 mb-10">
                        <div className="w-16 h-16 bg-gradient-to-br from-[#a855f7] to-[#ec4899] rounded-[1.2rem] flex items-center justify-center shadow-lg shadow-purple-500/20">
                            <Key className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h2 className="text-[22px] font-bold text-[#1e293b]">软件激活</h2>
                            <p className="text-[#64748b] text-sm">请输入激活码以解锁全部功能</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2.5">
                            <label className="text-base font-semibold text-[#1e293b] ml-1">
                                机器码 <span className="text-[#64748b] font-normal">(发送给卖家)</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={machineCode}
                                    className="flex-1 bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl px-5 py-4 text-[#475569] font-mono text-lg focus:outline-none"
                                />
                                <button
                                    onClick={copyMachineCode}
                                    className="p-4 bg-[#f1f5f9] hover:bg-[#e2e8f0] rounded-2xl text-[#64748b] transition-all active:scale-90"
                                >
                                    {copied ? <Check className="w-6 h-6 text-green-500" /> : <Copy className="w-6 h-6" />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2.5">
                            <label className="text-base font-semibold text-[#1e293b] ml-1">
                                激活码
                            </label>
                            <input
                                type="text"
                                placeholder="请输入16位激活码"
                                value={licenseKey}
                                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                                className="w-full bg-white border border-[#e2e8f0] rounded-2xl px-5 py-4 text-[#1e293b] placeholder:text-[#94a3b8] focus:border-[#a855f7]/50 focus:ring-4 focus:ring-[#a855f7]/10 transition-all outline-none font-mono text-lg"
                            />
                        </div>

                        {error && (
                            <div className="flex items-start gap-4 p-4 bg-red-50 border border-red-100 rounded-2xl">
                                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-600 font-medium">{error}</p>
                            </div>
                        )}

                        <button
                            onClick={handleActivate}
                            disabled={activating || !licenseKey || loading}
                            className={clsx(
                                "w-full py-5 rounded-2xl text-white font-bold text-lg transition-all flex items-center justify-center gap-3",
                                (activating || !licenseKey || loading)
                                    ? "bg-[#e2e8f0] text-[#94a3b8] cursor-not-allowed"
                                    : "bg-gradient-to-r from-[#8b5cf6] to-[#ec4899] hover:opacity-90 active:scale-[0.98] shadow-lg shadow-purple-500/20"
                            )}
                        >
                            {activating ? (
                                <Loader className="w-6 h-6 animate-spin" />
                            ) : (
                                "激活软件"
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
