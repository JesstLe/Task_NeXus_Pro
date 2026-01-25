import React, { useState, useEffect } from 'react';
import { Key, Copy, CheckCircle, XCircle, Loader } from 'lucide-react';

export default function ActivationDialog({ onActivated }) {
    const [machineId, setMachineId] = useState('');
    const [licenseKey, setLicenseKey] = useState('');
    const [loading, setLoading] = useState(true);
    const [activating, setActivating] = useState(false);
    const [message, setMessage] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        async function fetchMachineId() {
            if (window.electron?.getMachineId) {
                const result = await window.electron.getMachineId();
                if (result.success) {
                    setMachineId(result.machineId);
                }
            } else {
                // Preview mode mock
                setMachineId('PREVIEW-MODE');
            }
            setLoading(false);
        }
        fetchMachineId();
    }, []);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(machineId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.error('Copy failed:', e);
        }
    };

    const handleActivate = async () => {
        if (!licenseKey.trim()) {
            setMessage({ type: 'error', text: '请输入激活码' });
            return;
        }

        setActivating(true);
        setMessage(null);

        try {
            if (window.electron?.activateLicense) {
                const result = await window.electron.activateLicense(licenseKey.trim());
                if (result.success) {
                    setMessage({ type: 'success', text: result.message });
                    setTimeout(() => onActivated?.(), 1500);
                } else {
                    setMessage({ type: 'error', text: result.message });
                }
            } else {
                // Preview mode - always succeed
                setMessage({ type: 'success', text: '预览模式激活成功' });
                setTimeout(() => onActivated?.(), 1500);
            }
        } catch (e) {
            setMessage({ type: 'error', text: '激活失败: ' + e.message });
        }

        setActivating(false);
    };

    return (
        <div className="fixed inset-0 bg-gradient-to-br from-slate-900/95 to-violet-900/95 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-pink-500 rounded-xl flex items-center justify-center">
                        <Key className="text-white" size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">软件激活</h2>
                        <p className="text-sm text-slate-500">请输入激活码以解锁全部功能</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader className="animate-spin text-violet-500" size={32} />
                    </div>
                ) : (
                    <>
                        {/* Machine ID */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                机器码 <span className="text-slate-400 font-normal">(发送给卖家)</span>
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={machineId}
                                    readOnly
                                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-600 select-all"
                                />
                                <button
                                    onClick={handleCopy}
                                    className={`px-4 py-3 rounded-xl transition-all ${copied
                                            ? 'bg-green-100 text-green-600'
                                            : 'bg-slate-100 text-slate-600 hover:bg-violet-100 hover:text-violet-600'
                                        }`}
                                >
                                    {copied ? <CheckCircle size={18} /> : <Copy size={18} />}
                                </button>
                            </div>
                        </div>

                        {/* License Key Input */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                激活码
                            </label>
                            <input
                                type="text"
                                value={licenseKey}
                                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                                placeholder="请输入16位激活码"
                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-mono uppercase tracking-wider focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 outline-none transition-all"
                                maxLength={16}
                            />
                        </div>

                        {/* Message */}
                        {message && (
                            <div className={`flex items-center gap-2 p-3 rounded-xl mb-4 ${message.type === 'success'
                                    ? 'bg-green-50 text-green-700 border border-green-100'
                                    : 'bg-red-50 text-red-700 border border-red-100'
                                }`}>
                                {message.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                                <span className="text-sm">{message.text}</span>
                            </div>
                        )}

                        {/* Activate Button */}
                        <button
                            onClick={handleActivate}
                            disabled={activating}
                            className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${activating
                                    ? 'bg-slate-200 text-slate-400 cursor-wait'
                                    : 'bg-gradient-to-r from-violet-500 to-pink-500 text-white hover:shadow-lg hover:shadow-violet-500/25'
                                }`}
                        >
                            {activating ? (
                                <>
                                    <Loader className="animate-spin" size={18} />
                                    验证中...
                                </>
                            ) : (
                                '激活软件'
                            )}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
