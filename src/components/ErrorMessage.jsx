import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

export default function ErrorMessage({ message, onClose, type = 'error' }) {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000); // 5秒后自动关闭
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className={clsx(
      "fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-lg shadow-lg flex items-center gap-4 min-w-[300px] max-w-[500px] transition-all duration-300",
      type === 'error' 
        ? "bg-red-50 border border-red-200 text-red-800" 
        : "bg-yellow-50 border border-yellow-200 text-yellow-800"
    )}>
      <div className="flex-1">
        <p className="text-sm font-medium">{message}</p>
      </div>
      <button
        onClick={onClose}
        className={clsx(
          "p-1 rounded hover:bg-opacity-20 transition-colors",
          type === 'error' ? "hover:bg-red-200" : "hover:bg-yellow-200"
        )}
      >
        <X size={16} />
      </button>
    </div>
  );
}

