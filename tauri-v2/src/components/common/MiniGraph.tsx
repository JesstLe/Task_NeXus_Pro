import React from 'react';

interface MiniGraphProps {
    data: number[];
    color: string;
    height?: number;
    width?: number;
}

export const MiniGraph = ({ data, color, height = 40, width = 100 }: MiniGraphProps) => {
    if (!data || data.length === 0) {
        return <div style={{ height, width }} className="bg-slate-50/50 rounded border border-slate-100" />;
    }

    const graphData = data.length === 1 ? [data[0], data[0]] : data;
    const max = 100;
    const points = graphData.map((val, i) => {
        const x = (i / (graphData.length - 1)) * width;
        const y = height - ((val || 0) / max) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-hidden bg-slate-50/50 rounded border border-slate-100" preserveAspectRatio="none">
            <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} vectorEffect="non-scaling-stroke" />
            <path d={`M0,${height} L${points.split(' ')[0]} ${points} L${width},${height} Z`} fill={color} fillOpacity="0.15" />
        </svg>
    );
};
