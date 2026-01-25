import React from 'react';
import { Monitor, Zap, Sliders, Box, Sparkles, Layers, FileDown, FileUp, ShieldCheck, Info } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { AppSettings, GameGraphicsSettings } from '../types';

interface GameGraphicsPanelProps {
    settings: AppSettings;
    onSettingChange: (key: string, value: any) => void;
}

const DEFAULT_GRAPHICS_SETTINGS: GameGraphicsSettings = {
    qualityProfile: 'medium',
    windowMode: 'fullscreen_exclusive',
    resolution: '1920x1080',
    fpsCap: 0,
    renderScale: 100,
    dlssMode: 'quality',
    reflexMode: 'on',
    vSyncCount: 0,
    aaMode: 1,
    upSamplingType: 1,
    checkboardRendering: false,
    dlssSharpness: 0.5,
    enableDlssG: true,
    frameBoostDlssG: 0,
    enableDlssRR: false,
    xessMode: 101,
    xefgMode: 0,
    xellMode: 0,
    fsr2Mode: 0,
    fsr2Sharpness: 0,
    fsr3Mode: 1,
    enableFsr3FrameInterpolation: false,
    nisQuality: 0,
    gamma: 2.2,
    hdrMode: 0,
    motionBlurEnabled: false,
    styleMode: 2,
    raytracingEnabled: false,
    optimize8to4: false,
    stoneMilk: false,
    modelDetail: 2, // 0-3 (Low, Med, High, Ultra)
    tessellation: 1, // 0-3
    textureQuality: 2, // 0-3
    effectQuality: 1, // 0-3
    lightingQuality: 1, // 0-3
    shadowQuality: 1, // 0-3
};

export default function GameGraphicsPanel({ settings, onSettingChange }: GameGraphicsPanelProps) {
    const graphicsSettings = settings.graphicsSettings || DEFAULT_GRAPHICS_SETTINGS;
    const [narakaPath, setNarakaPath] = React.useState<string | null>(null);
    const [narakaSummary, setNarakaSummary] = React.useState<any | null>(null);
    const [fileBusy, setFileBusy] = React.useState(false);
    const [fileMessage, setFileMessage] = React.useState<string | null>(null);

    const updateGraphics = (updates: Partial<GameGraphicsSettings>) => {
        onSettingChange('graphicsSettings', {
            ...graphicsSettings,
            ...updates
        });
    };

    const mapSummaryToSettings = (summary: any): Partial<GameGraphicsSettings> => {
        const resolution = `${summary.resolution_width}x${summary.resolution_height}`;
        const fpsCap = summary.frame_rate_limit < 0 ? 0 : summary.frame_rate_limit;
        const renderScale = Math.round((summary.render_scale ?? 1) * 100);

        const windowMode = summary.full_screen_mode === 1 ? 'borderless' : summary.full_screen_mode === 2 ? 'windowed' : 'fullscreen_exclusive';
        const dlssMode =
            summary.enable_dlss_dx12
                ? (summary.dlss_mode === 2 ? 'performance' : summary.dlss_mode === 1 ? 'balanced' : 'quality')
                : 'off';

        const reflexMode =
            summary.reflex_mode === 2 ? 'boost' : summary.reflex_mode === 1 ? 'on' : 'off';

        const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
        return {
            resolution,
            fpsCap,
            renderScale,
            windowMode,
            dlssMode,
            reflexMode,
            vSyncCount: Number(summary.v_sync_count ?? 0),
            aaMode: Number(summary.aa_mode ?? 1),
            upSamplingType: Number(summary.up_sampling_type ?? 1),
            checkboardRendering: Number(summary.checkboard_rendering ?? 0) !== 0,
            dlssSharpness: Number(summary.dlss_sharpness ?? 0.5),
            enableDlssG: !!summary.enable_dlss_g,
            frameBoostDlssG: Number(summary.frame_boost_dlss_g ?? 0),
            enableDlssRR: !!summary.enable_dlss_rr,
            xessMode: Number(summary.xess_mode ?? 0),
            xefgMode: Number(summary.xefg_mode ?? 0),
            xellMode: Number(summary.xell_mode ?? 0),
            fsr2Mode: Number(summary.fsr2_mode ?? 0),
            fsr2Sharpness: Number(summary.fsr2_sharpness ?? 0),
            fsr3Mode: Number(summary.fsr3_mode ?? 0),
            enableFsr3FrameInterpolation: !!summary.enable_fsr3_frame_interpolation,
            nisQuality: Number(summary.nis_quality ?? 0),
            gamma: Number(summary.gamma ?? 2.2),
            hdrMode: Number(summary.hdr_mode ?? 0),
            motionBlurEnabled: !!summary.motion_blur_enabled,
            styleMode: Number(summary.style_mode ?? 0),
            raytracingEnabled: !!summary.raytracing_enabled,
            stoneMilk: !!summary.character_additional_physics1,
            modelDetail: clamp(Number(summary.model_quality_level ?? 0), 0, 3),
            tessellation: clamp(Number(summary.tessellation_quality_level ?? 0), 0, 3),
            textureQuality: clamp(Number(summary.texture_quality_level ?? 0), 0, 3),
            effectQuality: clamp(Number(summary.visual_effects_quality_level ?? 0), 0, 3),
            shadowQuality: clamp(Number(summary.shadow_quality_level ?? 0), 0, 3),
            lightingQuality: clamp(Number(summary.lighting_quality_level ?? 0), 0, 3),
        };
    };

    const buildPatchFromSettings = (): any => {
        const [wStr, hStr] = graphicsSettings.resolution.split('x');
        const resolutionWidth = Number.parseInt(wStr, 10);
        const resolutionHeight = Number.parseInt(hStr, 10);

        const fullScreenMode =
            graphicsSettings.windowMode === 'borderless'
                ? 1
                : graphicsSettings.windowMode === 'windowed'
                    ? 2
                    : 0;

        const frameRateLimit = graphicsSettings.fpsCap === 0 ? -1 : graphicsSettings.fpsCap;
        const renderScale = Number((graphicsSettings.renderScale / 100).toFixed(4));

        const enableDlssDx12 = graphicsSettings.dlssMode !== 'off';
        const dlssMode =
            graphicsSettings.dlssMode === 'performance'
                ? 2
                : graphicsSettings.dlssMode === 'balanced'
                    ? 1
                    : 0;

        const reflexMode =
            graphicsSettings.reflexMode === 'boost'
                ? 2
                : graphicsSettings.reflexMode === 'on'
                    ? 1
                    : 0;

        return {
            resolution_width: Number.isFinite(resolutionWidth) ? resolutionWidth : undefined,
            resolution_height: Number.isFinite(resolutionHeight) ? resolutionHeight : undefined,
            full_screen_mode: fullScreenMode,
            frame_rate_limit: frameRateLimit,
            render_scale: renderScale,
            enable_dlss_dx12: enableDlssDx12,
            dlss_mode: dlssMode,
            reflex_mode: reflexMode,
            v_sync_count: graphicsSettings.vSyncCount,
            aa_mode: graphicsSettings.aaMode,
            up_sampling_type: graphicsSettings.upSamplingType,
            checkboard_rendering: graphicsSettings.checkboardRendering ? 1 : 0,
            dlss_sharpness: graphicsSettings.dlssSharpness,
            enable_dlss_g: graphicsSettings.enableDlssG,
            frame_boost_dlss_g: graphicsSettings.frameBoostDlssG,
            enable_dlss_rr: graphicsSettings.enableDlssRR,
            xess_mode: graphicsSettings.xessMode,
            xefg_mode: graphicsSettings.xefgMode,
            xell_mode: graphicsSettings.xellMode,
            fsr2_mode: graphicsSettings.fsr2Mode,
            fsr2_sharpness: graphicsSettings.fsr2Sharpness,
            fsr3_mode: graphicsSettings.fsr3Mode,
            enable_fsr3_frame_interpolation: graphicsSettings.enableFsr3FrameInterpolation,
            nis_quality: graphicsSettings.nisQuality,
            gamma: graphicsSettings.gamma,
            hdr_mode: graphicsSettings.hdrMode,
            motion_blur_enabled: graphicsSettings.motionBlurEnabled,
            style_mode: graphicsSettings.styleMode,
            raytracing_enabled: graphicsSettings.raytracingEnabled,
            character_additional_physics1: graphicsSettings.stoneMilk,
            model_quality_level: graphicsSettings.modelDetail,
            tessellation_quality_level: graphicsSettings.tessellation,
            texture_quality_level: graphicsSettings.textureQuality,
            visual_effects_quality_level: graphicsSettings.effectQuality,
            shadow_quality_level: graphicsSettings.shadowQuality,
            lighting_quality_level: graphicsSettings.lightingQuality,
        };
    };

    const handleLoadNarakaFile = async () => {
        setFileMessage(null);
        const path = await open({
            title: '选择永劫无间 QualitySettingsData.txt',
            multiple: false,
            filters: [{ name: 'QualitySettingsData', extensions: ['txt'] }],
        });
        if (!path || Array.isArray(path)) return;

        setFileBusy(true);
        try {
            const res = await invoke<any>('naraka_parse_quality_settings', { path });
            setNarakaPath(path);
            setNarakaSummary(res.summary);
            updateGraphics(mapSummaryToSettings(res.summary));
            setFileMessage('读取成功：已按文件内容同步到本页设置。');
        } catch (e) {
            setFileMessage(`读取失败：${e}`);
        } finally {
            setFileBusy(false);
        }
    };

    const handleSaveNarakaFile = async () => {
        if (!narakaPath) {
            setFileMessage('请先选择 QualitySettingsData.txt 再写入。');
            return;
        }
        setFileBusy(true);
        setFileMessage(null);
        try {
            const patch = buildPatchFromSettings();
            await invoke('naraka_apply_quality_patch', { path: narakaPath, patch });
            const res = await invoke<any>('naraka_parse_quality_settings', { path: narakaPath });
            setNarakaSummary(res.summary);
            setFileMessage('写入成功：已更新 QualitySettingsData.txt。');
        } catch (e) {
            setFileMessage(`写入失败：${e}`);
        } finally {
            setFileBusy(false);
        }
    };

    const qualityProfiles = [
        { id: 'competitive', label: '三高', sub: '纹理抗锯齿高，其余全低' },
        { id: 'lowest', label: '极低 (Lowest)', sub: '全最低，极限帧数' },
        { id: 'medium', label: '中等 (Medium)', sub: '平衡' },
        { id: 'ultra', label: '极高 (Ultra)', sub: '高画质需求选' },
        { id: 'custom', label: '自定义', sub: '手动调节' },
    ];

    const getSliderLabel = (val: number, type: 'quality' | 'tessellation') => {
        if (type === 'tessellation') {
            const labels = ['关闭', '低', '中', '高'];
            return labels[val] || '中';
        }
        const labels = ['低', '中', '高', '极高'];
        return labels[val] || '中';
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Section */}
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    游戏画面设置
                </h2>
                <p className="text-slate-500 mt-1">本页仅用于“永劫无间”画质文件 (QualitySettingsData.txt) 的读取/写入与调参。</p>
            </div>

            <div className="glass rounded-2xl p-5 shadow-soft border border-emerald-100 bg-emerald-50/30">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                            <ShieldCheck size={18} />
                        </div>
                        <div>
                            <div className="font-medium text-slate-700 text-sm">永劫无间专用</div>
                            <div className="text-xs text-slate-500">
                                选择并校验 QualitySettingsData.txt，然后同步到本页；写入将回填到该文件。
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleLoadNarakaFile}
                            disabled={fileBusy}
                            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold transition-all active:scale-95 flex items-center gap-2 disabled:opacity-60"
                        >
                            <FileDown size={14} /> 读取文件
                        </button>
                        <button
                            onClick={handleSaveNarakaFile}
                            disabled={fileBusy}
                            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-2 disabled:opacity-60"
                        >
                            <FileUp size={14} /> 写入文件
                        </button>
                    </div>
                </div>

                <div className="mt-3 text-xs text-slate-500 space-y-2">
                    {narakaPath && (
                        <div className="font-mono bg-white/60 border border-slate-200 rounded-lg px-3 py-2 break-all">
                            {narakaPath}
                        </div>
                    )}
                    {narakaSummary && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                            <div className="bg-white/60 border border-slate-200 rounded-lg px-3 py-2">
                                分辨率：<span className="font-mono">{narakaSummary.resolution_width}x{narakaSummary.resolution_height}</span>
                            </div>
                            <div className="bg-white/60 border border-slate-200 rounded-lg px-3 py-2">
                                帧率上限：<span className="font-mono">{narakaSummary.frame_rate_limit}</span>
                            </div>
                            <div className="bg-white/60 border border-slate-200 rounded-lg px-3 py-2">
                                RenderScale：<span className="font-mono">{narakaSummary.render_scale}</span>
                            </div>
                        </div>
                    )}
                    {fileMessage && (
                        <div className="flex items-start gap-2 text-[11px] text-slate-600">
                            <Info size={14} className="mt-0.5 text-slate-400" />
                            <span>{fileMessage}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Quality Profile */}
            <div className="glass rounded-2xl p-5 shadow-soft">
                <h4 className="font-medium text-slate-700 mb-4 flex items-center gap-2">
                    <Layers size={18} className="text-violet-500" />
                    全局画质方案 (QUALITY PROFILE)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {qualityProfiles.map((profile) => (
                        <button
                            key={profile.id}
                            onClick={() => updateGraphics({ qualityProfile: profile.id })}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all ${
                                graphicsSettings.qualityProfile === profile.id
                                    ? 'bg-slate-900 border-slate-900 text-white shadow-lg scale-[1.02]'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-violet-200 hover:bg-white'
                            }`}
                        >
                            <span className="font-bold text-sm mb-1">{profile.label}</span>
                            <span className={`text-[10px] ${graphicsSettings.qualityProfile === profile.id ? 'text-slate-400' : 'text-slate-400'}`}>
                                {profile.sub}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Display & Perf */}
            <div className="glass rounded-2xl p-5 shadow-soft">
                <h4 className="font-medium text-slate-700 mb-4 flex items-center gap-2">
                    <Monitor size={18} className="text-violet-500" />
                    显示与性能 (Display & Perf)
                </h4>
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500">窗口模式</label>
                            <select
                                value={graphicsSettings.windowMode}
                                onChange={(e) => updateGraphics({ windowMode: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                            >
                                <option value="fullscreen_exclusive">全屏独占</option>
                                <option value="borderless">无边框窗口</option>
                                <option value="windowed">窗口模式</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500">分辨率</label>
                            <select
                                value={graphicsSettings.resolution}
                                onChange={(e) => updateGraphics({ resolution: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                            >
                                <option value="1920x1080">1920x1080</option>
                                <option value="2560x1440">2560x1440</option>
                                <option value="3840x2160">3840x2160</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500">垂直同步 (VSync)</label>
                            <select
                                value={String(graphicsSettings.vSyncCount)}
                                onChange={(e) => updateGraphics({ vSyncCount: parseInt(e.target.value) })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                            >
                                <option value="0">关闭 (0)</option>
                                <option value="1">开启 (1)</option>
                                <option value="2">隔帧 (2)</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500">Gamma</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="1.6"
                                    max="2.6"
                                    step="0.05"
                                    value={graphicsSettings.gamma}
                                    onChange={(e) => updateGraphics({ gamma: parseFloat(e.target.value) })}
                                    className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
                                />
                                <span className="w-12 text-xs text-right font-mono text-slate-600">
                                    {graphicsSettings.gamma.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-700">帧率上限 (FPS Cap)</span>
                            <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                                {graphicsSettings.fpsCap === 0 ? '无上限' : graphicsSettings.fpsCap}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="300"
                            step="10"
                            value={graphicsSettings.fpsCap}
                            onChange={(e) => updateGraphics({ fpsCap: parseInt(e.target.value) })}
                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
                        />

                        <div className="flex justify-between items-center mt-4">
                            <span className="text-sm font-medium text-slate-700">渲染比例 (Render Scale)</span>
                            <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                                {graphicsSettings.renderScale}%
                            </span>
                        </div>
                        <input
                            type="range"
                            min="50"
                            max="200"
                            step="5"
                            value={graphicsSettings.renderScale}
                            onChange={(e) => updateGraphics({ renderScale: parseInt(e.target.value) })}
                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
                        />
                    </div>

                    <div className="space-y-2 pt-2">
                        <label className="text-xs font-medium text-slate-500">DLSS / 超分辨率</label>
                        <select
                            value={graphicsSettings.dlssMode}
                            onChange={(e) => updateGraphics({ dlssMode: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                        >
                            <option value="quality">DLSS 质量 (Quality)</option>
                            <option value="balanced">DLSS 平衡 (Balanced)</option>
                            <option value="performance">DLSS 性能 (Performance)</option>
                            <option value="off">关闭</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500">DLSS 锐化</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={graphicsSettings.dlssSharpness}
                                    onChange={(e) => updateGraphics({ dlssSharpness: parseFloat(e.target.value) })}
                                    className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
                                />
                                <span className="w-12 text-xs text-right font-mono text-slate-600">
                                    {graphicsSettings.dlssSharpness.toFixed(2)}
                                </span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-slate-500">DLSS 帧生成</label>
                            <div className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                                <div className="text-xs text-slate-500">enableDlssG</div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={graphicsSettings.enableDlssG}
                                        onChange={(e) => updateGraphics({ enableDlssG: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="glass rounded-2xl p-5 shadow-soft">
                <h4 className="font-medium text-slate-700 mb-4 flex items-center gap-2">
                    <Sliders size={18} className="text-violet-500" />
                    渲染管线高级项（枚举/慎改）
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 space-y-3">
                        <div className="text-xs font-bold text-slate-700">抗锯齿与上采样</div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <div className="text-[11px] text-slate-500">aaMode</div>
                                <input
                                    type="number"
                                    value={graphicsSettings.aaMode}
                                    onChange={(e) => updateGraphics({ aaMode: parseInt(e.target.value || '0') })}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="text-[11px] text-slate-500">upSamplingType</div>
                                <input
                                    type="number"
                                    value={graphicsSettings.upSamplingType}
                                    onChange={(e) => updateGraphics({ upSamplingType: parseInt(e.target.value || '0') })}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="text-[11px] text-slate-500">xessMode</div>
                                <input
                                    type="number"
                                    value={graphicsSettings.xessMode}
                                    onChange={(e) => updateGraphics({ xessMode: parseInt(e.target.value || '0') })}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="text-[11px] text-slate-500">nisQuality</div>
                                <input
                                    type="number"
                                    value={graphicsSettings.nisQuality}
                                    onChange={(e) => updateGraphics({ nisQuality: parseInt(e.target.value || '0') })}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                            <div className="text-xs text-slate-600">checkboardRendering</div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={graphicsSettings.checkboardRendering}
                                    onChange={(e) => updateGraphics({ checkboardRendering: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                            </label>
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 space-y-3">
                        <div className="text-xs font-bold text-slate-700">DLSS/FSR/其他</div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <div className="text-[11px] text-slate-500">frameBoostDlssG</div>
                                <input
                                    type="number"
                                    value={graphicsSettings.frameBoostDlssG}
                                    onChange={(e) => updateGraphics({ frameBoostDlssG: parseInt(e.target.value || '0') })}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="text-[11px] text-slate-500">enableDlssRR</div>
                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                                    <span className="text-xs text-slate-600">开关</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={graphicsSettings.enableDlssRR}
                                            onChange={(e) => updateGraphics({ enableDlssRR: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                                    </label>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="text-[11px] text-slate-500">fsr2Mode</div>
                                <input
                                    type="number"
                                    value={graphicsSettings.fsr2Mode}
                                    onChange={(e) => updateGraphics({ fsr2Mode: parseInt(e.target.value || '0') })}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="text-[11px] text-slate-500">fsr3Mode</div>
                                <input
                                    type="number"
                                    value={graphicsSettings.fsr3Mode}
                                    onChange={(e) => updateGraphics({ fsr3Mode: parseInt(e.target.value || '0') })}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                            <div className="text-xs text-slate-600">FSR3 插帧 (enableFsr3FrameInterpolation)</div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={graphicsSettings.enableFsr3FrameInterpolation}
                                    onChange={(e) => updateGraphics({ enableFsr3FrameInterpolation: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                            </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <div className="text-[11px] text-slate-500">hdrMode</div>
                                <input
                                    type="number"
                                    value={graphicsSettings.hdrMode}
                                    onChange={(e) => updateGraphics({ hdrMode: parseInt(e.target.value || '0') })}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700"
                                />
                            </div>
                            <div className="space-y-1">
                                <div className="text-[11px] text-slate-500">styleMode</div>
                                <input
                                    type="number"
                                    value={graphicsSettings.styleMode}
                                    onChange={(e) => updateGraphics({ styleMode: parseInt(e.target.value || '0') })}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-700"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                            <div className="text-xs text-slate-600">动态模糊 (motionBlurEnabled)</div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={graphicsSettings.motionBlurEnabled}
                                    onChange={(e) => updateGraphics({ motionBlurEnabled: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                            </label>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                            <div className="text-xs text-slate-600">光追总开关 (raytracingEnabled)</div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={graphicsSettings.raytracingEnabled}
                                    onChange={(e) => updateGraphics({ raytracingEnabled: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                            </label>
                        </div>
                    </div>
                </div>
                <div className="mt-3 text-[11px] text-slate-500 flex items-start gap-2">
                    <Info size={14} className="mt-0.5 text-slate-400" />
                    <span>这些字段多为枚举/内部调参：建议只在确认含义后修改；否则以游戏内设置为准。</span>
                </div>
            </div>

            {/* Competitive & Tweaks */}
            <div className="glass rounded-2xl p-5 shadow-soft border-l-4 border-l-violet-500">
                <h4 className="font-medium text-slate-700 mb-4 flex items-center gap-2">
                    <Zap size={18} className="text-violet-500" />
                    竞技与黑科技 (Competitive & Tweaks)
                </h4>
                <div className="space-y-3">
                    {/* NVIDIA Reflex */}
                    <div className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                        <div>
                            <div className="font-medium text-slate-700 text-sm">NVIDIA Reflex</div>
                            <div className="text-xs text-slate-400">降低系统输入延迟</div>
                        </div>
                        <div className="flex items-center bg-slate-200 rounded-lg p-1">
                            <button
                                onClick={() => updateGraphics({ reflexMode: 'off' })}
                                className={`px-3 py-1 text-xs rounded-md transition-all ${graphicsSettings.reflexMode === 'off' ? 'bg-white shadow-sm text-slate-800 font-medium' : 'text-slate-500'}`}
                            >
                                关
                            </button>
                            <button
                                onClick={() => updateGraphics({ reflexMode: 'on' })}
                                className={`px-3 py-1 text-xs rounded-md transition-all ${graphicsSettings.reflexMode === 'on' ? 'bg-white shadow-sm text-slate-800 font-medium' : 'text-slate-500'}`}
                            >
                                开
                            </button>
                            <button
                                onClick={() => updateGraphics({ reflexMode: 'boost' })}
                                className={`px-3 py-1 text-xs rounded-md transition-all ${graphicsSettings.reflexMode === 'boost' ? 'bg-rose-500 text-white shadow-sm font-medium' : 'text-slate-500'}`}
                            >
                                Boost
                            </button>
                        </div>
                    </div>

                    {/* 8改4 */}
                    <div className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-700 text-sm">8改4 优化</span>
                                <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">HOT</span>
                            </div>
                            <div className="text-xs text-slate-400">修改线程配置，提升多核利用率</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={graphicsSettings.optimize8to4}
                                onChange={(e) => updateGraphics({ optimize8to4: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                        </label>
                    </div>

                    {/* Stone Milk */}
                    <div className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl border border-slate-100">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-700 text-sm">石头奶 (Stone Milk)</span>
                                <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">PRO</span>
                            </div>
                            <div className="text-xs text-slate-400">极致精简材质，敌人更清晰</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={graphicsSettings.stoneMilk}
                                onChange={(e) => updateGraphics({ stoneMilk: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-500"></div>
                        </label>
                    </div>
                </div>
            </div>

            {/* Fine Tuning */}
            <div className="glass rounded-2xl p-5 shadow-soft">
                <h4 className="font-medium text-slate-700 mb-6 flex items-center gap-2">
                    <Sliders size={18} className="text-violet-500" />
                    细节参数微调 (Fine Tuning)
                </h4>

                {/* Geometry */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4 border-l-2 border-rose-500 pl-3">
                        <Box size={16} className="text-rose-500" />
                        <span className="font-bold text-slate-700 text-sm">几何与模型 (Geometry)</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {['modelDetail', 'tessellation', 'textureQuality'].map((key) => (
                            <div key={key} className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-xs font-medium text-slate-500">
                                        {key === 'modelDetail' ? '建模精度' : key === 'tessellation' ? '曲面细分' : '贴图质量'}
                                    </span>
                                    <span className="text-xs font-bold text-rose-500">
                                        {getSliderLabel(graphicsSettings[key as keyof GameGraphicsSettings] as number, key === 'tessellation' ? 'tessellation' : 'quality')}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="3"
                                    step="1"
                                    value={graphicsSettings[key as keyof GameGraphicsSettings] as number}
                                    onChange={(e) => updateGraphics({ [key]: parseInt(e.target.value) })}
                                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
                                />
                                <div className="flex justify-between text-[10px] text-slate-400">
                                    <span>{key === 'tessellation' ? '关闭' : '低'}</span>
                                    <span>{key === 'tessellation' ? '低' : '中'}</span>
                                    <span>{key === 'tessellation' ? '中' : '高'}</span>
                                    <span>{key === 'tessellation' ? '高' : '极高'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Lighting & FX */}
                <div>
                    <div className="flex items-center gap-2 mb-4 border-l-2 border-rose-500 pl-3">
                        <Sparkles size={16} className="text-rose-500" />
                        <span className="font-bold text-slate-700 text-sm">光影与特效 (Lighting & FX)</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {['effectQuality', 'lightingQuality', 'shadowQuality'].map((key) => (
                            <div key={key} className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-xs font-medium text-slate-500">
                                        {key === 'effectQuality' ? '特效品质' : key === 'lightingQuality' ? '光照质量' : '阴影质量'}
                                    </span>
                                    <span className="text-xs font-bold text-rose-500">
                                        {getSliderLabel(graphicsSettings[key as keyof GameGraphicsSettings] as number, 'quality')}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="3"
                                    step="1"
                                    value={graphicsSettings[key as keyof GameGraphicsSettings] as number}
                                    onChange={(e) => updateGraphics({ [key]: parseInt(e.target.value) })}
                                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
                                />
                                <div className="flex justify-between text-[10px] text-slate-400">
                                    <span>低</span>
                                    <span>中</span>
                                    <span>高</span>
                                    <span>极高</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
