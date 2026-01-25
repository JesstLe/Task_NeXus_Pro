import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Save, X, AlertTriangle, Check, RotateCcw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { AppSettings } from '../../types';

interface GeekEditorProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onSave: () => void;
}

export const GeekEditor: React.FC<GeekEditorProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [jsonContent, setJsonContent] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // Initialize content when opening
    useEffect(() => {
        if (isOpen) {
            setJsonContent(JSON.stringify(settings, null, 4));
            setError(null);
            setIsDirty(false);
        }
    }, [isOpen, settings]);

    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setJsonContent(newValue);
        setIsDirty(true);

        try {
            JSON.parse(newValue);
            setError(null);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleSave = async () => {
        if (error) return;
        setIsSaving(true);
        try {
            const parsed = JSON.parse(jsonContent);
            // Force mode to 'custom' when saving from Custom Editor
            parsed.mode = 'custom';

            await invoke('save_full_config', { config: parsed });
            onSave(); // Trigger reload/refresh in parent
            onClose();
        } catch (e: any) {
            setError("保存失败: " + e.toString());
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        if (confirm('确定要重置所有修改吗？')) {
            setJsonContent(JSON.stringify(settings, null, 4));
            setError(null);
            setIsDirty(false);
        }
    };

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-5xl h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10">

                {/* Header */}
                <div className="flex-none flex items-center justify-between px-6 py-4 bg-slate-800/50 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                            <code className="text-orange-500 font-bold text-lg">{"{}"}</code>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-100">自定义配置编辑器</h3>
                            <p className="text-xs text-slate-400 font-mono">Hardware-Bound Encrypted JSON</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isDirty && (
                            <button
                                onClick={handleReset}
                                className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                                title="重置修改"
                            >
                                <RotateCcw size={18} />
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Editor Area */}
                <div className="flex-1 relative bg-[#0d1117] overflow-hidden">
                    <textarea
                        value={jsonContent}
                        onChange={handleContentChange}
                        className="w-full h-full p-6 bg-transparent text-slate-300 font-mono text-sm leading-relaxed resize-none focus:outline-none selection:bg-blue-500/30 whitespace-pre"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoComplete="off"
                        autoCorrect="off"
                    />

                    {/* Syntax Error Overlay */}
                    {error && (
                        <div className="absolute bottom-6 left-6 right-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 backdrop-blur-sm z-10">
                            <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
                            <div className="flex-1">
                                <h4 className="text-sm font-bold text-red-400">语法错误</h4>
                                <p className="text-xs text-red-300/80 font-mono mt-1">{error}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex-none px-6 py-4 bg-slate-800/50 border-t border-slate-700 flex items-center justify-between">
                    <div className="text-xs text-slate-500 flex items-center gap-4">
                        <span className="hidden sm:inline font-mono">Config Version: 2.0</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!!error || isSaving}
                            className={`
                                flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all
                                ${error || isSaving
                                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:shadow-lg hover:shadow-orange-500/20 active:scale-95'
                                }
                            `}
                        >
                            {isSaving ? (
                                <>保存中...</>
                            ) : (
                                <>
                                    <Save size={16} />
                                    保存并应用
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
