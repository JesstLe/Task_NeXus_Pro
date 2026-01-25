import { useMemo, useState } from 'react';
import { ProcessInfo } from '../../types';

export function useProcessTree(
    processes: ProcessInfo[],
    searchTerm: string,
    showActiveOnly: boolean,
    treeViewMode: boolean
) {
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'cpu', direction: 'desc' });
    const [expandedPids, setExpandedPids] = useState(new Set<number>());

    const sortedProcesses = useMemo(() => {
        let filtered = processes;
        if (showActiveOnly) filtered = filtered.filter(p => (p.cpu_usage || 0) > 0.1);
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(p => p.name.toLowerCase().includes(term) || p.pid.toString().includes(term));
        }

        return [...filtered].sort((a, b) => {
            let aVal = (a as any)[sortConfig.key] ?? 0;
            let bVal = (b as any)[sortConfig.key] ?? 0;

            // Special sorting for keys that are display-mapped or complex
            if (sortConfig.key === 'cpu') { aVal = a.cpu_usage || 0; bVal = b.cpu_usage || 0; }
            if (sortConfig.key === 'memory') { aVal = a.memory_usage || 0; bVal = b.memory_usage || 0; }
            if (sortConfig.key === 'priority') {
                const priorityOrder: Record<string, number> = { 'RealTime': 6, 'High': 5, 'AboveNormal': 4, 'Normal': 3, 'BelowNormal': 2, 'Idle': 1 };
                aVal = priorityOrder[a.priority || 'Normal'] || 0;
                bVal = priorityOrder[b.priority || 'Normal'] || 0;
            }

            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [processes, searchTerm, sortConfig, showActiveOnly]);

    const processTreeData = useMemo(() => {
        if (!treeViewMode) return sortedProcesses.map(p => ({ ...p, depth: 0, hasChildren: false }));

        const pidMap = new Map(processes.map(p => [p.pid, { ...p }]));
        const childMap = new Map();

        processes.forEach(p => {
            if (p.parent_pid && pidMap.has(p.parent_pid) && p.parent_pid !== p.pid) {
                if (!childMap.has(p.parent_pid)) childMap.set(p.parent_pid, []);
                childMap.get(p.parent_pid).push(pidMap.get(p.pid));
            }
        });

        const aggregatedValues = new Map();
        const visiting = new Set();
        const getAggregated = (pid: number): { cpu: number, mem: number } => {
            if (aggregatedValues.has(pid)) return aggregatedValues.get(pid);
            if (visiting.has(pid)) return { cpu: 0, mem: 0 };
            visiting.add(pid);

            const p = pidMap.get(pid);
            if (!p) {
                visiting.delete(pid);
                return { cpu: 0, mem: 0 };
            }

            let cpu = p.cpu_usage || 0;
            let mem = p.memory_usage || 0;
            const children = childMap.get(pid) || [];

            children.forEach((c: any) => {
                const childTotals = getAggregated(c.pid);
                cpu += childTotals.cpu;
                mem += childTotals.mem;
            });

            const result = { cpu, mem };
            aggregatedValues.set(pid, result);
            visiting.delete(pid);
            return result;
        };

        const sortedPids = new Set(sortedProcesses.map(p => p.pid));
        const roots = sortedProcesses.filter(p => !p.parent_pid || !sortedPids.has(p.parent_pid) || p.parent_pid === p.pid);

        const result: any[] = [];
        const flatten = (nodeId: number, depth: number) => {
            const p = pidMap.get(nodeId);
            if (!p) return;

            const totals = getAggregated(nodeId);
            const children = childMap.get(nodeId) || [];
            const isExpanded = expandedPids.has(nodeId);

            result.push({
                ...p,
                cpu_usage: totals.cpu,
                memory_usage: totals.mem,
                depth,
                hasChildren: children.length > 0,
                isExpanded
            });

            if (children.length > 0 && isExpanded) {
                children.forEach((c: any) => flatten(c.pid, depth + 1));
            }
        };

        roots.forEach(r => flatten(r.pid, 0));
        return result;
    }, [sortedProcesses, treeViewMode, expandedPids, processes]);

    return {
        sortedProcesses,
        processTreeData,
        sortConfig,
        setSortConfig,
        expandedPids,
        setExpandedPids
    };
}
