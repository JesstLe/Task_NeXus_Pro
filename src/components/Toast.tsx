import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { ToastInfo } from '../types';

interface ToastProps {
    message: string;
    type?: ToastInfo['type'];
    duration?: number;
    onClose: () => void;
}

export default function Toast({ message, type = 'success', duration = 3000, onClose }: ToastProps) {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(onClose, 300);
        }, duration);
        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const handleClose = () => {
        setIsVisible(false);
        setTimeout(onClose, 300);
    };

    const variants = {
        success: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle, iconColor: 'text-green-500' },
        error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle, iconColor: 'text-red-500' },
        info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: Info, iconColor: 'text-blue-500' },
        warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: AlertTriangle, iconColor: 'text-yellow-500' }
    };

    const variant = variants[type] || variants.success;
    const Icon = variant.icon;

    return (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg transition-all duration-300 ${variant.bg} ${variant.border} ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`} style={{ minWidth: '280px', maxWidth: '400px' }}>
            <Icon size={20} className={variant.iconColor} />
            <span className={`flex-1 text-sm font-medium ${variant.text}`}>{message}</span>
            <button onClick={handleClose} className={`${variant.text} hover:opacity-70`}><X size={16} /></button>
        </div>
    );
}

export function ToastContainer({ toasts, removeToast }: { toasts: ToastInfo[], removeToast: (id: number) => void }) {
    return (
        <div className="fixed top-0 right-0 z-50 pointer-events-none">
            <div className="flex flex-col gap-2 p-6 pointer-events-auto">
                {toasts.map((toast) => (
                    <Toast key={toast.id} message={toast.message} type={toast.type} duration={toast.duration} onClose={() => removeToast(toast.id)} />
                ))}
            </div>
        </div>
    );
}
