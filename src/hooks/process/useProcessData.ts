import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ProcessInfo, LogicalCore } from '../../types';

export function useProcessData(initialProcesses: ProcessInfo[]) {
    const [processes, setProcesses] = useState<any[]>(initialProcesses);
    const [history, setHistory] = useState<{ cpu: number[], memory: number[] }>({ cpu: [], memory: [] });
    const [loading, setLoading] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const [topology, setTopology] = useState<LogicalCore[]>([]);

    const pausedRef = useRef(isPaused);
    useEffect(() => { pausedRef.current = isPaused; }, [isPaused]);

    useEffect(() => {
        const hasTauri = typeof window !== 'undefined' && (window as any).__TAURI__;
        let unlisten: any = null;
        let unlistenCpu: any = null;
        let unlistenMem: any = null;
        let mounted = true;

        if (!hasTauri) {
            setLoading(false);
            return () => {
                mounted = false;
            };
        }

        invoke<any[]>('get_processes')
            .then(data => {
                if (mounted && !pausedRef.current && data) {
                    setProcesses(data);
                    setLoading(false);
                }
                return invoke('get_cpu_topology');
            })
            .then(setTopology as any)
            .catch(err => {
                console.error(err);
                if (mounted) {
                    setLoading(false);
                }
            });

        const setupListen = async () => {
            try {
                unlisten = await listen('process-update', (event) => {
                    if (mounted && !pausedRef.current) {
                        setProcesses(event.payload as any[]);
                        setLoading(false);
                    }
                });
                unlistenCpu = await listen('cpu-load-update', (event) => {
                    if (mounted && !pausedRef.current) {
                        const payload = event.payload as number[];
                        const total = Array.isArray(payload)
                            ? payload.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0)
                            : 0;
                        const avg = payload.length > 0 ? total / payload.length : 0;
                        const safe = Math.min(100, Math.max(0, avg));
                        setHistory(prev => ({
                            ...prev,
                            cpu: [...prev.cpu, safe].slice(-50)
                        }));
                    }
                });
                unlistenMem = await listen('memory-load-update', (event) => {
                    if (mounted && !pausedRef.current) {
                        const sysMemPercent = event.payload as number;
                        setHistory(prev => ({
                            ...prev,
                            memory: [...prev.memory, sysMemPercent].slice(-50)
                        }));
                    }
                });
            } catch (err) {
                console.error(err);
                if (mounted) {
                    setLoading(false);
                }
            }
        };
        setupListen();

        return () => {
            mounted = false;
            if (unlisten) unlisten();
            if (unlistenCpu) unlistenCpu();
            if (unlistenMem) unlistenMem();
        };
    }, []);

    return {
        processes,
        setProcesses,
        history,
        loading,
        isPaused,
        setIsPaused,
        topology,
        setTopology
    };
}
