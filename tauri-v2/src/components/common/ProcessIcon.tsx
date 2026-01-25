import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileQuestion, AppWindow } from 'lucide-react';

// Global cache to persist across re-renders and component mounts
const iconCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string>>();

interface ProcessIconProps {
    path?: string;
    name: string;
    className?: string;
}

export function ProcessIcon({ path, name, className = "w-4 h-4" }: ProcessIconProps) {
    const [iconSrc, setIconSrc] = useState<string | null>(path ? (iconCache.get(path) || null) : null);
    const [error, setError] = useState(false);

    useEffect(() => {
        // Validation
        if (!path || path.trim() === '') {
            return;
        }

        // Check cache again (in case it updated while mounting)
        if (iconCache.has(path)) {
            setIconSrc(iconCache.get(path)!);
            return;
        }

        let isMounted = true;

        const fetchIcon = async () => {
            try {
                // Deduplicate requests
                let promise = pendingRequests.get(path);
                if (!promise) {
                    promise = invoke<string>('get_process_icon', { path });
                    pendingRequests.set(path, promise);
                }

                const base64 = await promise;

                if (isMounted) {
                    if (base64 && base64.length > 0) {
                        iconCache.set(path, base64);
                        setIconSrc(base64);
                    } else {
                        // Backend returned empty string (extraction failed gracefully)
                        // Don't set error true strictly, just leave as fallback
                        // But maybe we want to avoid retrying?
                        // Let's cache the failure too (empty string) to avoid loop
                        iconCache.set(path, "");
                    }
                }
            } catch (e) {
                if (isMounted) {
                    console.warn(`[Icon] Failed to load for ${name}:`, e);
                    setError(true);
                }
            } finally {
                pendingRequests.delete(path);
            }
        };

        fetchIcon();

        return () => {
            isMounted = false;
        };
    }, [path, name]);

    // Fallback Icon
    if (!path || error || !iconSrc) {
        // Using AppWindow as a generic exec icon, or FileQuestion
        // FileQuestion looks a bit like "Missing", AppWindow looks like "Program"
        return <AppWindow className={`${className} text-slate-400`} strokeWidth={1.5} />;
    }

    return <img src={iconSrc} alt={name} className={`${className} object-contain`} />;
}
