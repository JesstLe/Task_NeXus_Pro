use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NarakaQualitySummary {
    pub preset: i64,
    pub resolution_width: i64,
    pub resolution_height: i64,
    pub full_screen_mode: i64,
    pub frame_rate_limit: i64,
    pub render_scale: f64,
    pub v_sync_count: i64,
    pub aa_mode: i64,
    pub up_sampling_type: i64,
    pub checkboard_rendering: i64,
    pub enable_dlss_dx12: bool,
    pub dlss_mode: i64,
    pub dlss_sharpness: f64,
    pub enable_dlss_g: bool,
    pub frame_boost_dlss_g: i64,
    pub enable_dlss_rr: bool,
    pub xess_mode: i64,
    pub xefg_mode: i64,
    pub xell_mode: i64,
    pub fsr2_mode: i64,
    pub fsr2_sharpness: f64,
    pub fsr3_mode: i64,
    pub enable_fsr3_frame_interpolation: bool,
    pub nis_quality: i64,
    pub gamma: f64,
    pub hdr_mode: i64,
    pub motion_blur_enabled: bool,
    pub style_mode: i64,
    pub raytracing_enabled: bool,
    pub character_additional_physics1: bool,
    pub reflex_mode: i64,
    pub model_quality_level: i64,
    pub tessellation_quality_level: i64,
    pub visual_effects_quality_level: i64,
    pub texture_quality_level: i64,
    pub shadow_quality_level: i64,
    pub lighting_quality_level: i64,
    pub aa_level: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NarakaQualityParseResult {
    pub summary: NarakaQualitySummary,
    pub data: serde_json::Value,
}

fn read_text_file(path: &PathBuf) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("读取文件失败: {e}"))?;
    let mut s = String::from_utf8_lossy(&bytes).to_string();
    if s.starts_with('\u{feff}') {
        s = s.trim_start_matches('\u{feff}').to_string();
    }
    Ok(s)
}

fn get_i64(obj: &serde_json::Value, ptr: &str) -> Option<i64> {
    obj.pointer(ptr)
        .and_then(|v| v.as_i64().or_else(|| v.as_u64().map(|x| x as i64)))
}

fn get_f64(obj: &serde_json::Value, ptr: &str) -> Option<f64> {
    obj.pointer(ptr).and_then(|v| v.as_f64())
}

fn get_bool(obj: &serde_json::Value, ptr: &str) -> Option<bool> {
    obj.pointer(ptr).and_then(|v| v.as_bool())
}

fn get_bool_any(obj: &serde_json::Value, ptrs: &[&str]) -> Option<bool> {
    for ptr in ptrs {
        if let Some(v) = get_bool(obj, ptr) {
            return Some(v);
        }
    }
    None
}

fn ensure_naraka_shape(data: &serde_json::Value) -> Result<(), String> {
    if !data.get("l22GraphicQualityLevel").is_some() || !data.get("l22SystemQualitySetting").is_some()
    {
        return Err("文件结构不符合永劫无间 QualitySettingsData.txt（缺少 l22GraphicQualityLevel / l22SystemQualitySetting）"
            .to_string());
    }
    Ok(())
}

fn build_summary(data: &serde_json::Value) -> Result<NarakaQualitySummary, String> {
    ensure_naraka_shape(data)?;

    let preset = get_i64(data, "/preset").ok_or("缺少 preset")?;
    let resolution_width = get_i64(data, "/l22SystemQualitySetting/resolutionWidth")
        .ok_or("缺少 l22SystemQualitySetting.resolutionWidth")?;
    let resolution_height = get_i64(data, "/l22SystemQualitySetting/resolutionHeight")
        .ok_or("缺少 l22SystemQualitySetting.resolutionHeight")?;
    let full_screen_mode = get_i64(data, "/l22SystemQualitySetting/fullScreenMode")
        .ok_or("缺少 l22SystemQualitySetting.fullScreenMode")?;
    let frame_rate_limit = get_i64(data, "/l22SystemQualitySetting/frameRateLimit")
        .ok_or("缺少 l22SystemQualitySetting.frameRateLimit")?;
    let render_scale = get_f64(data, "/l22SystemQualitySetting/renderScale")
        .ok_or("缺少 l22SystemQualitySetting.renderScale")?;
    let v_sync_count = get_i64(data, "/l22SystemQualitySetting/vSyncCount").unwrap_or(0);
    let aa_mode = get_i64(data, "/l22SystemQualitySetting/aaMode").unwrap_or(0);
    let up_sampling_type = get_i64(data, "/l22SystemQualitySetting/upSamplingType").unwrap_or(0);
    let checkboard_rendering = get_i64(data, "/l22SystemQualitySetting/checkboardRendering").unwrap_or(0);
    let enable_dlss_dx12 = get_bool(data, "/l22SystemQualitySetting/enableDlssDx12")
        .ok_or("缺少 l22SystemQualitySetting.enableDlssDx12")?;
    let dlss_mode =
        get_i64(data, "/l22SystemQualitySetting/dlssMode").ok_or("缺少 l22SystemQualitySetting.dlssMode")?;
    let dlss_sharpness = get_f64(data, "/l22SystemQualitySetting/dlssSharpness").unwrap_or(0.5);
    let enable_dlss_g = get_bool(data, "/l22SystemQualitySetting/enableDlssG").unwrap_or(false);
    let frame_boost_dlss_g = get_i64(data, "/l22SystemQualitySetting/frameBoostDlssG").unwrap_or(0);
    let enable_dlss_rr = get_bool(data, "/l22SystemQualitySetting/enableDlssRR").unwrap_or(false);
    let xess_mode = get_i64(data, "/l22SystemQualitySetting/xessMode").unwrap_or(0);
    let xefg_mode = get_i64(data, "/l22SystemQualitySetting/xefgMode").unwrap_or(0);
    let xell_mode = get_i64(data, "/l22SystemQualitySetting/xellMode").unwrap_or(0);
    let fsr2_mode = get_i64(data, "/l22SystemQualitySetting/lxFsr2Mode").unwrap_or(0);
    let fsr2_sharpness = get_f64(data, "/l22SystemQualitySetting/fsr2Sharpness").unwrap_or(0.0);
    let fsr3_mode = get_i64(data, "/l22SystemQualitySetting/lxFsr3Mode").unwrap_or(0);
    let enable_fsr3_frame_interpolation = get_bool_any(
        data,
        &[
            "/l22SystemQualitySetting/enbaleFSR3FrameInterpolation",
            "/l22SystemQualitySetting/enableFSR3FrameInterpolation",
        ],
    )
    .unwrap_or(false);
    let nis_quality = get_i64(data, "/l22SystemQualitySetting/nisQuality").unwrap_or(0);
    let gamma = get_f64(data, "/l22SystemQualitySetting/gamma").unwrap_or(2.2);
    let hdr_mode = get_i64(data, "/l22SystemQualitySetting/mHDRMode").unwrap_or(0);
    let motion_blur_enabled = get_bool(data, "/l22SystemQualitySetting/motionBlurEnabled").unwrap_or(false);
    let style_mode = get_i64(data, "/l22SystemQualitySetting/styleMode").unwrap_or(0);
    let raytracing_enabled = get_bool(data, "/l22SystemQualitySetting/raytracingEnabled").unwrap_or(false);
    let character_additional_physics1 =
        get_bool(data, "/l22SystemQualitySetting/characterAdditionalPhysics1").unwrap_or(false);
    let reflex_mode =
        get_i64(data, "/l22SystemQualitySetting/reflexMode").ok_or("缺少 l22SystemQualitySetting.reflexMode")?;

    let model_quality_level = get_i64(data, "/l22GraphicQualityLevel/m_modelQualityLevel").unwrap_or(0);
    let tessellation_quality_level =
        get_i64(data, "/l22GraphicQualityLevel/m_tessellationQualityLevel").unwrap_or(0);
    let visual_effects_quality_level =
        get_i64(data, "/l22GraphicQualityLevel/m_visualEffectsQualityLevel").unwrap_or(0);
    let texture_quality_level =
        get_i64(data, "/l22GraphicQualityLevel/m_textureQualityLevel").unwrap_or(0);
    let shadow_quality_level = get_i64(data, "/l22GraphicQualityLevel/m_shadowQualityLevel").unwrap_or(0);
    let lighting_quality_level =
        get_i64(data, "/l22GraphicQualityLevel/m_LightingQualityLevel").unwrap_or(0);
    let aa_level = get_i64(data, "/l22GraphicQualityLevel/m_AALevel").unwrap_or(0);

    Ok(NarakaQualitySummary {
        preset,
        resolution_width,
        resolution_height,
        full_screen_mode,
        frame_rate_limit,
        render_scale,
        v_sync_count,
        aa_mode,
        up_sampling_type,
        checkboard_rendering,
        enable_dlss_dx12,
        dlss_mode,
        dlss_sharpness,
        enable_dlss_g,
        frame_boost_dlss_g,
        enable_dlss_rr,
        xess_mode,
        xefg_mode,
        xell_mode,
        fsr2_mode,
        fsr2_sharpness,
        fsr3_mode,
        enable_fsr3_frame_interpolation,
        nis_quality,
        gamma,
        hdr_mode,
        motion_blur_enabled,
        style_mode,
        raytracing_enabled,
        character_additional_physics1,
        reflex_mode,
        model_quality_level,
        tessellation_quality_level,
        visual_effects_quality_level,
        texture_quality_level,
        shadow_quality_level,
        lighting_quality_level,
        aa_level,
    })
}

#[command]
pub async fn naraka_parse_quality_settings(path: String) -> Result<NarakaQualityParseResult, String> {
    let path = PathBuf::from(path);
    let s = read_text_file(&path)?;
    let data: serde_json::Value =
        serde_json::from_str(&s).map_err(|e| format!("解析 JSON 失败: {e}"))?;
    let summary = build_summary(&data)?;
    Ok(NarakaQualityParseResult { summary, data })
}

#[command]
pub async fn naraka_validate_quality_settings(path: String) -> Result<serde_json::Value, String> {
    let path = PathBuf::from(path);
    let s = read_text_file(&path)?;

    let mut issues: Vec<String> = Vec::new();
    let data: serde_json::Value = match serde_json::from_str(&s) {
        Ok(v) => v,
        Err(e) => {
            return Ok(serde_json::json!({
                "ok": false,
                "issues": [format!("解析 JSON 失败: {e}")],
            }));
        }
    };

    if ensure_naraka_shape(&data).is_err() {
        issues.push("文件结构不符合永劫无间 QualitySettingsData.txt".to_string());
    }

    if build_summary(&data).is_err() {
        issues.push("关键字段缺失或类型不匹配（无法生成摘要）".to_string());
    }

    Ok(serde_json::json!({
        "ok": issues.is_empty(),
        "issues": issues
    }))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NarakaQualityPatch {
    pub resolution_width: Option<i64>,
    pub resolution_height: Option<i64>,
    pub full_screen_mode: Option<i64>,
    pub frame_rate_limit: Option<i64>,
    pub render_scale: Option<f64>,
    pub v_sync_count: Option<i64>,
    pub aa_mode: Option<i64>,
    pub up_sampling_type: Option<i64>,
    pub checkboard_rendering: Option<i64>,
    pub enable_dlss_dx12: Option<bool>,
    pub dlss_mode: Option<i64>,
    pub dlss_sharpness: Option<f64>,
    pub enable_dlss_g: Option<bool>,
    pub frame_boost_dlss_g: Option<i64>,
    pub enable_dlss_rr: Option<bool>,
    pub xess_mode: Option<i64>,
    pub xefg_mode: Option<i64>,
    pub xell_mode: Option<i64>,
    pub fsr2_mode: Option<i64>,
    pub fsr2_sharpness: Option<f64>,
    pub fsr3_mode: Option<i64>,
    pub enable_fsr3_frame_interpolation: Option<bool>,
    pub nis_quality: Option<i64>,
    pub gamma: Option<f64>,
    pub hdr_mode: Option<i64>,
    pub motion_blur_enabled: Option<bool>,
    pub style_mode: Option<i64>,
    pub raytracing_enabled: Option<bool>,
    pub character_additional_physics1: Option<bool>,
    pub reflex_mode: Option<i64>,
    pub model_quality_level: Option<i64>,
    pub tessellation_quality_level: Option<i64>,
    pub visual_effects_quality_level: Option<i64>,
    pub texture_quality_level: Option<i64>,
    pub shadow_quality_level: Option<i64>,
    pub lighting_quality_level: Option<i64>,
    pub aa_level: Option<i64>,
}

fn set_ptr(data: &mut serde_json::Value, ptr: &str, value: serde_json::Value) {
    let mut segments = ptr.trim_start_matches('/').split('/').collect::<Vec<_>>();
    if segments.is_empty() {
        return;
    }
    let last = segments.pop().unwrap().to_string();
    let mut cur = data;
    for seg in segments {
        if !cur.get(seg).is_some() {
            cur[seg] = serde_json::json!({});
        }
        cur = &mut cur[seg];
    }
    cur[last] = value;
}

#[command]
pub async fn naraka_apply_quality_patch(path: String, patch: NarakaQualityPatch) -> Result<(), String> {
    let path = PathBuf::from(path);
    let s = read_text_file(&path)?;
    let mut data: serde_json::Value =
        serde_json::from_str(&s).map_err(|e| format!("解析 JSON 失败: {e}"))?;
    ensure_naraka_shape(&data)?;

    if let Some(v) = patch.resolution_width {
        set_ptr(&mut data, "/l22SystemQualitySetting/resolutionWidth", serde_json::json!(v));
    }
    if let Some(v) = patch.resolution_height {
        set_ptr(&mut data, "/l22SystemQualitySetting/resolutionHeight", serde_json::json!(v));
    }
    if let Some(v) = patch.full_screen_mode {
        set_ptr(&mut data, "/l22SystemQualitySetting/fullScreenMode", serde_json::json!(v));
    }
    if let Some(v) = patch.frame_rate_limit {
        set_ptr(&mut data, "/l22SystemQualitySetting/frameRateLimit", serde_json::json!(v));
    }
    if let Some(v) = patch.render_scale {
        set_ptr(&mut data, "/l22SystemQualitySetting/renderScale", serde_json::json!(v));
    }
    if let Some(v) = patch.v_sync_count {
        set_ptr(&mut data, "/l22SystemQualitySetting/vSyncCount", serde_json::json!(v));
    }
    if let Some(v) = patch.aa_mode {
        set_ptr(&mut data, "/l22SystemQualitySetting/aaMode", serde_json::json!(v));
    }
    if let Some(v) = patch.up_sampling_type {
        set_ptr(&mut data, "/l22SystemQualitySetting/upSamplingType", serde_json::json!(v));
    }
    if let Some(v) = patch.checkboard_rendering {
        set_ptr(&mut data, "/l22SystemQualitySetting/checkboardRendering", serde_json::json!(v));
    }
    if let Some(v) = patch.enable_dlss_dx12 {
        set_ptr(&mut data, "/l22SystemQualitySetting/enableDlssDx12", serde_json::json!(v));
    }
    if let Some(v) = patch.dlss_mode {
        set_ptr(&mut data, "/l22SystemQualitySetting/dlssMode", serde_json::json!(v));
    }
    if let Some(v) = patch.dlss_sharpness {
        set_ptr(&mut data, "/l22SystemQualitySetting/dlssSharpness", serde_json::json!(v));
    }
    if let Some(v) = patch.enable_dlss_g {
        set_ptr(&mut data, "/l22SystemQualitySetting/enableDlssG", serde_json::json!(v));
    }
    if let Some(v) = patch.frame_boost_dlss_g {
        set_ptr(&mut data, "/l22SystemQualitySetting/frameBoostDlssG", serde_json::json!(v));
    }
    if let Some(v) = patch.enable_dlss_rr {
        set_ptr(&mut data, "/l22SystemQualitySetting/enableDlssRR", serde_json::json!(v));
    }
    if let Some(v) = patch.xess_mode {
        set_ptr(&mut data, "/l22SystemQualitySetting/xessMode", serde_json::json!(v));
    }
    if let Some(v) = patch.xefg_mode {
        set_ptr(&mut data, "/l22SystemQualitySetting/xefgMode", serde_json::json!(v));
    }
    if let Some(v) = patch.xell_mode {
        set_ptr(&mut data, "/l22SystemQualitySetting/xellMode", serde_json::json!(v));
    }
    if let Some(v) = patch.fsr2_mode {
        set_ptr(&mut data, "/l22SystemQualitySetting/lxFsr2Mode", serde_json::json!(v));
    }
    if let Some(v) = patch.fsr2_sharpness {
        set_ptr(&mut data, "/l22SystemQualitySetting/fsr2Sharpness", serde_json::json!(v));
    }
    if let Some(v) = patch.fsr3_mode {
        set_ptr(&mut data, "/l22SystemQualitySetting/lxFsr3Mode", serde_json::json!(v));
    }
    if let Some(v) = patch.enable_fsr3_frame_interpolation {
        let ptr_typo = "/l22SystemQualitySetting/enbaleFSR3FrameInterpolation";
        let ptr_fixed = "/l22SystemQualitySetting/enableFSR3FrameInterpolation";
        if data.pointer(ptr_typo).is_some() {
            set_ptr(&mut data, ptr_typo, serde_json::json!(v));
        } else {
            set_ptr(&mut data, ptr_fixed, serde_json::json!(v));
        }
    }
    if let Some(v) = patch.nis_quality {
        set_ptr(&mut data, "/l22SystemQualitySetting/nisQuality", serde_json::json!(v));
    }
    if let Some(v) = patch.gamma {
        set_ptr(&mut data, "/l22SystemQualitySetting/gamma", serde_json::json!(v));
    }
    if let Some(v) = patch.hdr_mode {
        set_ptr(&mut data, "/l22SystemQualitySetting/mHDRMode", serde_json::json!(v));
    }
    if let Some(v) = patch.motion_blur_enabled {
        set_ptr(&mut data, "/l22SystemQualitySetting/motionBlurEnabled", serde_json::json!(v));
    }
    if let Some(v) = patch.style_mode {
        set_ptr(&mut data, "/l22SystemQualitySetting/styleMode", serde_json::json!(v));
    }
    if let Some(v) = patch.raytracing_enabled {
        set_ptr(&mut data, "/l22SystemQualitySetting/raytracingEnabled", serde_json::json!(v));
    }
    if let Some(v) = patch.character_additional_physics1 {
        set_ptr(
            &mut data,
            "/l22SystemQualitySetting/characterAdditionalPhysics1",
            serde_json::json!(v),
        );
    }
    if let Some(v) = patch.reflex_mode {
        set_ptr(&mut data, "/l22SystemQualitySetting/reflexMode", serde_json::json!(v));
    }

    if let Some(v) = patch.model_quality_level {
        set_ptr(&mut data, "/l22GraphicQualityLevel/m_modelQualityLevel", serde_json::json!(v));
    }
    if let Some(v) = patch.tessellation_quality_level {
        set_ptr(
            &mut data,
            "/l22GraphicQualityLevel/m_tessellationQualityLevel",
            serde_json::json!(v),
        );
    }
    if let Some(v) = patch.visual_effects_quality_level {
        set_ptr(
            &mut data,
            "/l22GraphicQualityLevel/m_visualEffectsQualityLevel",
            serde_json::json!(v),
        );
    }
    if let Some(v) = patch.texture_quality_level {
        set_ptr(
            &mut data,
            "/l22GraphicQualityLevel/m_textureQualityLevel",
            serde_json::json!(v),
        );
    }
    if let Some(v) = patch.shadow_quality_level {
        set_ptr(
            &mut data,
            "/l22GraphicQualityLevel/m_shadowQualityLevel",
            serde_json::json!(v),
        );
    }
    if let Some(v) = patch.lighting_quality_level {
        set_ptr(
            &mut data,
            "/l22GraphicQualityLevel/m_LightingQualityLevel",
            serde_json::json!(v),
        );
    }
    if let Some(v) = patch.aa_level {
        set_ptr(&mut data, "/l22GraphicQualityLevel/m_AALevel", serde_json::json!(v));
    }

    let out = serde_json::to_string(&data).map_err(|e| format!("序列化 JSON 失败: {e}"))?;
    fs::write(&path, out).map_err(|e| format!("写入文件失败: {e}"))?;
    Ok(())
}
