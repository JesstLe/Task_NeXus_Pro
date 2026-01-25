// CPU 架构配置数据库
// 支持 AMD CCD 架构和 Intel 大小核混合架构

// ==================== AMD 处理器 ====================
// CCD (Core Complex Die) 是 AMD Ryzen 处理器的核心芯片组
// 双 CCD 处理器允许按 CCD 分区控制核心调度

export const AMD_CPU_DATABASE = {
    // Ryzen 5000 系列 (Zen 3)
    '5600X': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '5600': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '5700X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '5800X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '5800X3D': { cores: 8, ccds: 1, coresPerCcd: 8, has3DCache: true },
    '5900X': { cores: 12, ccds: 2, coresPerCcd: 6 },
    '5950X': { cores: 16, ccds: 2, coresPerCcd: 8 },

    // Ryzen 7000 系列 (Zen 4)
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

    // Ryzen 9000 系列 (Zen 5)
    '9600X': { cores: 6, ccds: 1, coresPerCcd: 6 },
    '9700X': { cores: 8, ccds: 1, coresPerCcd: 8 },
    '9800X3D': { cores: 8, ccds: 1, coresPerCcd: 8, has3DCache: true },
    '9900X': { cores: 12, ccds: 2, coresPerCcd: 6 },
    '9950X': { cores: 16, ccds: 2, coresPerCcd: 8 },
    '9950X3D': { cores: 16, ccds: 2, coresPerCcd: 8, has3DCache: true },
};

// ==================== Intel 处理器 ====================
// 混合架构 (Alder Lake, Raptor Lake, Meteor Lake)
// P-Core: Performance Core (性能核心)
// E-Core: Efficiency Core (能效核心)

export const INTEL_CPU_DATABASE = {
    // 12th Gen (Alder Lake)
    '12900K': { pCores: 8, eCores: 8, totalThreads: 24 },  // 8P+8E, P核支持超线程
    '12900KS': { pCores: 8, eCores: 8, totalThreads: 24 },
    '12700K': { pCores: 8, eCores: 4, totalThreads: 20 },  // 8P+4E
    '12600K': { pCores: 6, eCores: 4, totalThreads: 16 },  // 6P+4E
    '12400': { pCores: 6, eCores: 0, totalThreads: 12 },   // 6P only

    // 13th Gen (Raptor Lake)
    '13900K': { pCores: 8, eCores: 16, totalThreads: 32 }, // 8P+16E
    '13900KS': { pCores: 8, eCores: 16, totalThreads: 32 },
    '13700K': { pCores: 8, eCores: 8, totalThreads: 24 },  // 8P+8E
    '13600K': { pCores: 6, eCores: 8, totalThreads: 20 },  // 6P+8E
    '13400': { pCores: 6, eCores: 4, totalThreads: 16 },   // 6P+4E

    // 14th Gen (Raptor Lake Refresh)
    '14900K': { pCores: 8, eCores: 16, totalThreads: 32 }, // 8P+16E
    '14900KS': { pCores: 8, eCores: 16, totalThreads: 32 },
    '14700K': { pCores: 8, eCores: 12, totalThreads: 28 }, // 8P+12E
    '14600K': { pCores: 6, eCores: 8, totalThreads: 20 },  // 6P+8E
};

/**
 * 从 CPU 型号名称中提取 AMD 处理器型号
 * @param {string} modelName - CPU 型号全名，如 "AMD Ryzen 9 7950X3D"
 * @returns {string|null} - 提取的型号，如 "7950X3D"
 */
export function extractAmdModel(modelName) {
    if (!modelName) return null;

    // 匹配 Ryzen 处理器型号: 5600X, 7950X3D, 9800X3D 等
    const match = modelName.match(/\b(\d{4}X?3?D?)\b/i);
    return match ? match[1].toUpperCase() : null;
}

/**
 * 从 CPU 型号名称中提取 Intel 处理器型号
 * @param {string} modelName - CPU 型号全名，如 "Intel Core i9-13900K"
 * @returns {string|null} - 提取的型号，如 "13900K"
 */
export function extractIntelModel(modelName) {
    if (!modelName) return null;

    // 匹配 Intel 处理器型号: 12900K, 13700K, 14600K 等
    const match = modelName.match(/\b(1[2-4]\d{3}K?S?)\b/i);
    return match ? match[1].toUpperCase() : null;
}

/**
 * 检测 CPU 厂商
 * @param {string} modelName - CPU 型号全名
 * @returns {'AMD'|'Intel'|null}
 */
export function detectCpuVendor(modelName) {
    if (!modelName) return null;

    const name = modelName.toLowerCase();
    if (name.includes('amd') || name.includes('ryzen')) return 'AMD';
    if (name.includes('intel') || name.includes('core')) return 'Intel';

    return null;
}

/**
 * 获取 AMD 处理器的 CCD 配置信息
 * @param {string} modelName - CPU 型号全名
 * @returns {object|null} - CCD 配置信息
 */
export function getCcdConfig(modelName) {
    const model = extractAmdModel(modelName);
    if (!model) return null;

    const config = AMD_CPU_DATABASE[model];
    if (!config) return null;

    return {
        model,
        ...config,
        isDualCcd: config.ccds === 2,
    };
}

/**
 * 获取 Intel 处理器的混合架构配置
 * @param {string} modelName - CPU 型号全名
 * @returns {object|null} - 混合架构配置信息
 */
export function getIntelHybridConfig(modelName) {
    const model = extractIntelModel(modelName);
    if (!model) return null;

    const config = INTEL_CPU_DATABASE[model];
    if (!config) return null;

    return {
        model,
        ...config,
        isHybrid: config.eCores > 0,
    };
}

/**
 * 统一获取 CPU 架构配置（AMD CCD 或 Intel 混合架构）
 * @param {string} modelName - CPU 型号全名
 * @returns {object|null} - 架构配置信息
 */
export function getCpuArchitecture(modelName) {
    const vendor = detectCpuVendor(modelName);

    if (vendor === 'AMD') {
        const ccdConfig = getCcdConfig(modelName);
        if (ccdConfig) {
            return {
                type: 'AMD_CCD',
                vendor: 'AMD',
                ...ccdConfig
            };
        }
    } else if (vendor === 'Intel') {
        const hybridConfig = getIntelHybridConfig(modelName);
        if (hybridConfig) {
            return {
                type: 'INTEL_HYBRID',
                vendor: 'Intel',
                ...hybridConfig
            };
        }
    }

    return null;
}

/**
 * 根据 CCD 配置生成核心分区映射（AMD）
 * @param {number} totalCores - 总核心数（逻辑核心/线程数）
 * @param {object} ccdConfig - CCD 配置信息
 * @returns {object} - 包含 CCD0 和 CCD1 的核心索引数组
 */
export function generateCcdMapping(totalCores, ccdConfig) {
    if (!ccdConfig || !ccdConfig.isDualCcd) {
        return null;
    }

    // 假设 SMT 开启，每个物理核心有 2 个线程
    // CCD0: 前半部分核心, CCD1: 后半部分核心
    const halfCores = Math.floor(totalCores / 2);

    return {
        ccd0: Array.from({ length: halfCores }, (_, i) => i),
        ccd1: Array.from({ length: halfCores }, (_, i) => i + halfCores),
    };
}

/**
 * 根据混合架构配置生成核心分区映射（Intel）
 * @param {number} totalThreads - 总线程数
 * @param {object} hybridConfig - 混合架构配置信息
 * @returns {object} - 包含 P-Core 和 E-Core 的线程索引数组
 */
export function generateHybridMapping(totalThreads, hybridConfig) {
    if (!hybridConfig || !hybridConfig.isHybrid) {
        return null;
    }

    const { pCores, eCores } = hybridConfig;

    // P-Core 支持超线程 (每个核心 2 个线程)
    // E-Core 不支持超线程 (每个核心 1 个线程)
    const pThreads = pCores * 2;
    const eThreads = eCores;

    return {
        pCore: Array.from({ length: pThreads }, (_, i) => i),
        eCore: Array.from({ length: eThreads }, (_, i) => i + pThreads),
    };
}

