use crate::AppResult;
use base64::{engine::general_purpose, Engine as _};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::io::Cursor;
use std::sync::Mutex;

// Cache: Path -> Base64 String
static ICON_CACHE: Lazy<Mutex<HashMap<String, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
pub async fn get_process_icon(path: String) -> Result<String, String> {
    if path.is_empty() {
        return Ok("".to_string());
    }

    // Check cache
    {
        if let Ok(cache) = ICON_CACHE.lock() {
            if let Some(icon) = cache.get(&path) {
                return Ok(icon.clone());
            }
        }
    }

    // Extract
    let icon_base64 = extract_icon_base64(&path).map_err(|e| e.to_string())?;

    // Update cache
    {
        if let Ok(mut cache) = ICON_CACHE.lock() {
            cache.insert(path.clone(), icon_base64.clone());
        }
    }

    Ok(icon_base64)
}

#[cfg(windows)]
fn extract_icon_base64(path: &str) -> AppResult<String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::UI::Shell::*;
    use windows::Win32::UI::WindowsAndMessaging::*;
    use windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_NORMAL;

    unsafe {
        // 1. Prepare path
        let wide_path: Vec<u16> = OsStr::new(path).encode_wide().chain(std::iter::once(0)).collect();

        // 2. Get File Info (Icon Handle)
        let mut shfi = SHFILEINFOW::default();
        let result = SHGetFileInfoW(
            PCWSTR(wide_path.as_ptr()),
            FILE_ATTRIBUTE_NORMAL,
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_SMALLICON, // Get small icon (16x16)
        );

        if result == 0 {
            return Err(crate::AppError::SystemError("SHGetFileInfoW failed".to_string()));
        }

        let hicon = shfi.hIcon;
        if hicon.is_invalid() {
            return Err(crate::AppError::SystemError("Invalid icon handle".to_string()));
        }

        // Auto-cleanup wrapper for HICON
        struct IconWrapper(HICON);
        impl Drop for IconWrapper {
            fn drop(&mut self) {
                unsafe { let _ = DestroyIcon(self.0); }
            }
        }
        let _icon_guard = IconWrapper(hicon);

        // 3. Get Icon Info (Bitmap Handle)
        let mut icon_info = ICONINFO::default();
        if GetIconInfo(hicon, &mut icon_info).is_err() {
            return Err(crate::AppError::SystemError("GetIconInfo failed".to_string()));
        }

        // Cleanup bitmaps
        struct BitmapWrapper(HBITMAP);
        impl Drop for BitmapWrapper {
            fn drop(&mut self) {
                unsafe { if !self.0.is_invalid() { let _ = DeleteObject(self.0); } }
            }
        }
        let _color_bmp_guard = BitmapWrapper(icon_info.hbmColor);
        let _mask_bmp_guard = BitmapWrapper(icon_info.hbmMask);

        if icon_info.hbmColor.is_invalid() {
            return Err(crate::AppError::SystemError("No color bitmap for icon".to_string()));
        }

        // 4. Get Bitmap Dimensions & Data
        let hdc_screen = GetDC(None);
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let _dc_guard = scopeguard::guard(hdc_screen, |h| { let _ = ReleaseDC(None, h); });
        let _mem_dc_guard = scopeguard::guard(hdc_mem, |h| { let _ = DeleteDC(h); });

        let mut bmi = BITMAPINFO::default();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = 16; // Standard small icon size
        bmi.bmiHeader.biHeight = -16; // Top-down
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32; // RGBA
        bmi.bmiHeader.biCompression = BI_RGB.0;

        // Verify actual size (optional, but good for robustness if system returns duplicate logic)
        let mut bitmap: BITMAP = std::mem::zeroed();
        GetObjectW(
            HGDIOBJ(icon_info.hbmColor.0), 
            std::mem::size_of::<BITMAP>() as i32, 
            Some(&mut bitmap as *mut _ as *mut std::ffi::c_void)
        );
        let width = bitmap.bmWidth;
        let height = bitmap.bmHeight;
        bmi.bmiHeader.biWidth = width;
        bmi.bmiHeader.biHeight = -height; // Top-down

        let mut pixels: Vec<u8> = vec![0; (width * height * 4) as usize];

        // Get DIBits
        if GetDIBits(
            hdc_mem, 
            icon_info.hbmColor, 
            0, 
            height as u32, 
            Some(pixels.as_mut_ptr() as *mut std::ffi::c_void), 
            &mut bmi, 
            DIB_RGB_COLORS
        ) == 0 {
            return Err(crate::AppError::SystemError("GetDIBits failed".to_string()));
        }

        // 5. Convert BGRA to RGBA (Windows creates BGRA)
        for chunk in pixels.chunks_mut(4) {
             let b = chunk[0];
             let r = chunk[2];
             chunk[0] = r;
             chunk[2] = b;
        }

        // 6. Encode to PNG using image crate
        let img_buffer: image::ImageBuffer<image::Rgba<u8>, Vec<u8>> = 
            image::ImageBuffer::from_raw(width as u32, height as u32, pixels)
            .ok_or_else(|| crate::AppError::SystemError("Failed to create image buffer".to_string()))?;

        let mut png_data = Vec::new();
        let mut cursor = Cursor::new(&mut png_data);
        img_buffer.write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| crate::AppError::SystemError(format!("PNG encode failed: {}", e)))?;

        let b64 = general_purpose::STANDARD.encode(png_data);
        Ok(format!("data:image/png;base64,{}", b64))
    }
}

#[cfg(not(windows))]
fn extract_icon_base64(_path: &str) -> AppResult<String> {
    Ok("".to_string())
}
