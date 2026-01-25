// CPU 架构配置数据库
// 支持 AMD CCD 架构和 Intel 大小核混合架构

export interface AmdConfig {
    cores: number;
    ccds: number;
    coresPerCcd: number;
    has3DCache?: boolean;
}

export interface IntelConfig {
    pCores: number;
    eCores: number;
    totalThreads: number;
}

export const AMD_CPU_DATABASE: Record<string, AmdConfig> = {
    // Ryzen 5000 Desktop
    '5600X': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '5600': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '5700X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '5800X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '5800X3D': { cores: 8, ccds: 1, coresPerCcd: 8, has3DCache: true },
    '5900X': { cores: 12, ccds: 2, coresPerCcd: 6 },
    '5950X': { cores: 16, ccds: 2, coresPerCcd: 8 },
    // Ryzen 6000 Mobile (Rembrandt)
    '6980HX': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '6900HX': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '6900HS': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '6800H': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '6800HS': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '6800U': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '6600H': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '6600HS': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '6600U': { cores: 6, ccds: 1, coresPerCcd: 6 },
    // Ryzen 7000 Desktop
    '7600X': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '7600': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '7700X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '7700': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '7800X3D': { cores: 8, ccds: 1, coresPerCcd: 8, has3DCache: true },
    '7900X': { cores: 12, ccds: 2, coresPerCcd: 6 },
    '7900': { cores: 12, ccds: 2, coresPerCcd: 6 },
    '7900X3D': { cores: 12, ccds: 2, coresPerCcd: 6, has3DCache: true },
    '7950X': { cores: 16, ccds: 2, coresPerCcd: 8 },
    '7950X3D': { cores: 16, ccds: 2, coresPerCcd: 8, has3DCache: true },
    // Ryzen 7000 Mobile (Phoenix/Dragon Range)
    '7945HX': { cores: 16, ccds: 2, coresPerCcd: 8 },
    '7945HX3D': { cores: 16, ccds: 2, coresPerCcd: 8, has3DCache: true },
    '7940H': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '7940HS': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '7840H': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '7840HS': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '7840U': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '7735H': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '7735HS': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '7640H': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '7640HS': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '7640U': { cores: 6, ccds: 1, coresPerCcd: 6 },
    // Ryzen 9000 Desktop
    '9600X': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '9700X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '9800X3D': { cores: 8, ccds: 1, coresPerCcd: 8, has3DCache: true },
    '9900X': { cores: 12, ccds: 2, coresPerCcd: 6 },
    '9950X': { cores: 16, ccds: 2, coresPerCcd: 8 },
    '9950X3D': { cores: 16, ccds: 2, coresPerCcd: 8, has3DCache: true },
};

export const INTEL_CPU_DATABASE: Record<string, IntelConfig> = {
    // 10th Gen (Comet Lake) - No E-Cores
    '10900K': { pCores: 10, eCores: 0, totalThreads: 20 },
    '10900KF': { pCores: 10, eCores: 0, totalThreads: 20 },
    '10850K': { pCores: 10, eCores: 0, totalThreads: 20 },
    '10700K': { pCores: 8, eCores: 0, totalThreads: 16 },
    '10700KF': { pCores: 8, eCores: 0, totalThreads: 16 },
    '10600K': { pCores: 6, eCores: 0, totalThreads: 12 },
    '10600KF': { pCores: 6, eCores: 0, totalThreads: 12 },
    '10400': { pCores: 6, eCores: 0, totalThreads: 12 },
    '10400F': { pCores: 6, eCores: 0, totalThreads: 12 },
    // 11th Gen (Rocket Lake) - No E-Cores
    '11900K': { pCores: 8, eCores: 0, totalThreads: 16 },
    '11900KF': { pCores: 8, eCores: 0, totalThreads: 16 },
    '11700K': { pCores: 8, eCores: 0, totalThreads: 16 },
    '11700KF': { pCores: 8, eCores: 0, totalThreads: 16 },
    '11600K': { pCores: 6, eCores: 0, totalThreads: 12 },
    '11600KF': { pCores: 6, eCores: 0, totalThreads: 12 },
    '11400': { pCores: 6, eCores: 0, totalThreads: 12 },
    '11400F': { pCores: 6, eCores: 0, totalThreads: 12 },
    // 12th Gen Desktop (Alder Lake)
    '12900K': { pCores: 8, eCores: 8, totalThreads: 24 },
    '12900KS': { pCores: 8, eCores: 8, totalThreads: 24 },
    '12900KF': { pCores: 8, eCores: 8, totalThreads: 24 },
    '12700K': { pCores: 8, eCores: 4, totalThreads: 20 },
    '12700KF': { pCores: 8, eCores: 4, totalThreads: 20 },
    '12600K': { pCores: 6, eCores: 4, totalThreads: 16 },
    '12600KF': { pCores: 6, eCores: 4, totalThreads: 16 },
    '12400': { pCores: 6, eCores: 0, totalThreads: 12 },
    '12400F': { pCores: 6, eCores: 0, totalThreads: 12 },
    // 13th Gen Desktop (Raptor Lake)
    '13900K': { pCores: 8, eCores: 16, totalThreads: 32 },
    '13900KS': { pCores: 8, eCores: 16, totalThreads: 32 },
    '13900KF': { pCores: 8, eCores: 16, totalThreads: 32 },
    '13700K': { pCores: 8, eCores: 8, totalThreads: 24 },
    '13700KF': { pCores: 8, eCores: 8, totalThreads: 24 },
    '13600K': { pCores: 6, eCores: 8, totalThreads: 20 },
    '13600KF': { pCores: 6, eCores: 8, totalThreads: 20 },
    '13400': { pCores: 6, eCores: 4, totalThreads: 16 },
    '13400F': { pCores: 6, eCores: 4, totalThreads: 16 },
    // 14th Gen Desktop (Raptor Lake Refresh)
    '14900K': { pCores: 8, eCores: 16, totalThreads: 32 },
    '14900KS': { pCores: 8, eCores: 16, totalThreads: 32 },
    '14900KF': { pCores: 8, eCores: 16, totalThreads: 32 },
    '14700K': { pCores: 8, eCores: 12, totalThreads: 28 },
    '14700KF': { pCores: 8, eCores: 12, totalThreads: 28 },
    '14600K': { pCores: 6, eCores: 8, totalThreads: 20 },
    '14600KF': { pCores: 6, eCores: 8, totalThreads: 20 },
    // 12th Gen Mobile (Alder Lake)
    '12900HX': { pCores: 8, eCores: 8, totalThreads: 24 },
    '12900HK': { pCores: 6, eCores: 8, totalThreads: 20 },
    '12900H': { pCores: 6, eCores: 8, totalThreads: 20 },
    '12800H': { pCores: 6, eCores: 8, totalThreads: 20 },
    '12700H': { pCores: 6, eCores: 8, totalThreads: 20 },
    '12650H': { pCores: 6, eCores: 4, totalThreads: 16 },
    '12600H': { pCores: 4, eCores: 8, totalThreads: 16 },
    '12500H': { pCores: 4, eCores: 8, totalThreads: 16 },
    '12450H': { pCores: 4, eCores: 4, totalThreads: 12 },
    // 13th Gen Mobile (Raptor Lake)
    '13980HX': { pCores: 8, eCores: 16, totalThreads: 32 },
    '13950HX': { pCores: 8, eCores: 16, totalThreads: 32 },
    '13900HX': { pCores: 8, eCores: 16, totalThreads: 32 },
    '13900HK': { pCores: 6, eCores: 8, totalThreads: 20 },
    '13900H': { pCores: 6, eCores: 8, totalThreads: 20 },
    '13700HX': { pCores: 8, eCores: 8, totalThreads: 24 },
    '13700H': { pCores: 6, eCores: 8, totalThreads: 20 },
    '13650HX': { pCores: 6, eCores: 8, totalThreads: 20 },
    '13600HX': { pCores: 6, eCores: 8, totalThreads: 20 },
    '13600H': { pCores: 4, eCores: 8, totalThreads: 16 },
    '13500HX': { pCores: 6, eCores: 8, totalThreads: 20 },
    '13500H': { pCores: 4, eCores: 8, totalThreads: 16 },
    '13420H': { pCores: 4, eCores: 4, totalThreads: 12 },
    // 14th Gen Mobile (Raptor Lake Refresh)
    '14900HX': { pCores: 8, eCores: 16, totalThreads: 32 },
    '14700HX': { pCores: 8, eCores: 12, totalThreads: 28 },
    '14650HX': { pCores: 6, eCores: 8, totalThreads: 20 },
    '14600HX': { pCores: 6, eCores: 8, totalThreads: 20 },
    '14500HX': { pCores: 6, eCores: 8, totalThreads: 20 },
    '14450HX': { pCores: 6, eCores: 4, totalThreads: 16 },
};

export function extractAmdModel(modelName: string): string | null {
    if (!modelName) return null;
    const match = modelName.match(/\b(\d{4}X?3?D?)\b/i);
    return match ? match[1].toUpperCase() : null;
}

export function extractIntelModel(modelName: string): string | null {
    if (!modelName) return null;
    // Updated regex: supports 10th-14th gen, K/KS/KF/H/HX/HK suffixes
    const match = modelName.match(/\b(1[0-4]\d{3}[KH]?[SXF]?[KF]?)\b/i);
    return match ? match[1].toUpperCase() : null;
}

export function detectCpuVendor(modelName: string): 'AMD' | 'Intel' | null {
    if (!modelName) return null;
    const name = modelName.toLowerCase();
    if (name.includes('amd') || name.includes('ryzen')) return 'AMD';
    if (name.includes('intel') || name.includes('core')) return 'Intel';
    return null;
}

export function getCpuArchitecture(modelName: string): any {
    const vendor = detectCpuVendor(modelName);
    if (vendor === 'AMD') {
        const model = extractAmdModel(modelName);
        const config = model ? AMD_CPU_DATABASE[model] : null;
        if (config) return { type: 'AMD_CCD', vendor: 'AMD', ...config, isDualCcd: config.ccds === 2 };
    } else if (vendor === 'Intel') {
        const model = extractIntelModel(modelName);
        const config = model ? INTEL_CPU_DATABASE[model] : null;
        if (config) return { type: 'INTEL_HYBRID', vendor: 'Intel', ...config, isHybrid: config.eCores > 0 };
    }
    return null;
}
