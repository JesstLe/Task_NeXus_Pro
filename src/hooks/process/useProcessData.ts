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
        let unlisten: any = null;
        let mounted = true;

        invoke<any[]>('get_processes').then(data => {
            if (mounted && !pausedRef.current && data) {
                setProcesses(data);
                setLoading(false);
            }
            invoke('get_cpu_topology').then(setTopology as any).catch(console.error);
        });

        const setupListen = async () => {
            unlisten = await listen('process-update', (event) => {
                if (mounted && !pausedRef.current) {
                    setProcesses(event.payload as any[]);
                    setLoading(false);
                }
            });
            const unlistenMem = await listen('memory-load-update', (event) => {
                if (mounted && !pausedRef.current) {
                    const sysMemPercent = event.payload as number;
                    setHistory(prev => ({
                        ...prev,
                        memory: [...prev.memory, sysMemPercent].slice(-50)
                    }));
                }
            });
        };
        setupListen();

        return () => {
            mounted = false;
            if (unlisten) unlisten();
        };
    }, []);

    useEffect(() => {
        if (processes.length === 0 || isPaused) return;
        const totalCpu = processes.reduce((acc, p) => acc + (p.cpu_usage || 0), 0);

        setHistory(prev => ({
            ...prev,
            cpu: [...prev.cpu, Math.min(100, totalCpu)].slice(-50)
        }));
    }, [processes, isPaused]);

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
