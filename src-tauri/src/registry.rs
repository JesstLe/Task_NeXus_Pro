// Registry operations module
// Provides backup, restore, import, and cleaning functionality

use std::path::{Path, PathBuf};
use std::process::Command;
use std::fs;
use std::os::windows::process::CommandExt;
use winreg::enums::*;
use winreg::RegKey;
use serde::{Serialize, Deserialize};

use crate::{AppError, AppResult};

/// Check if the current process is running as administrator
pub fn is_admin() -> bool {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HANDLE;
        use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
        use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

        unsafe {
            let mut token: HANDLE = HANDLE::default();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
                return false;
            }

            let mut elevation = TOKEN_ELEVATION::default();
            let mut size = std::mem::size_of::<TOKEN_ELEVATION>() as u32;

            let result = GetTokenInformation(
                token,
                TokenElevation,
                Some(&mut elevation as *mut _ as *mut _),
                size,
                &mut size,
            );

            let _ = windows::Win32::Foundation::CloseHandle(token);

            if result.is_err() {
                return false;
            }

            elevation.TokenIsElevated != 0
        }
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Registry scan result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryScanResult {
    pub category: String,
    pub count: u32,
    pub items: Vec<RegistryIssue>,
}

/// Single registry issue
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryIssue {
    pub path: String,
    pub value_name: Option<String>,
    pub issue_type: String,
    pub details: String,
}

/// Backup registry to a .reg file using reg.exe
/// 
/// # Arguments
/// * `path` - Output file path (should end with .reg)
/// * `key` - Registry key to backup (e.g., "HKEY_CURRENT_USER\\Software")
#[tauri::command]
pub async fn backup_registry(path: String, key: String) -> Result<(), String> {
    backup_registry_internal(&path, &key)
        .await
        .map_err(|e| e.to_string())
}

async fn backup_registry_internal(path: &str, key: &str) -> AppResult<()> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::SystemError(format!("Failed to create directory: {}", e)))?;
    }

    // Use reg.exe for backup
    let output = Command::new("reg")
        .args(["export", key, path, "/y"])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| AppError::SystemError(format!("Failed to execute reg.exe: {}", e)))?;

    if output.status.success() {
        tracing::info!("Registry backup successful: {} -> {}", key, path);
        Ok(())
    } else {
        let stderr = crate::decode_output(&output.stderr);
        Err(AppError::SystemError(format!("Registry backup failed: {}", stderr)))
    }
}

/// Import a .reg file into registry
#[tauri::command]
pub async fn import_registry(path: String) -> Result<(), String> {
    import_registry_internal(&path)
        .await
        .map_err(|e| e.to_string())
}

async fn import_registry_internal(path: &str) -> AppResult<()> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(AppError::SystemError(format!("File not found: {}", path)));
    }

    // Get absolute path for reg.exe
    let abs_path = if p.is_absolute() {
        p.to_path_buf()
    } else {
        std::env::current_dir()?.join(p)
    };

    // Use reg.exe for import
    let output = Command::new("reg")
        .args(["import", &abs_path.to_string_lossy()])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| AppError::SystemError(format!("Failed to execute reg.exe: {}", e)))?;

    if output.status.success() {
        tracing::info!("Registry import successful: {}", abs_path.display());
        Ok(())
    } else {
        let stderr = crate::decode_output(&output.stderr);
        let stdout = crate::decode_output(&output.stdout);
        let error_msg = if !stderr.is_empty() { stderr } else { stdout };
        Err(AppError::SystemError(format!("Registry import failed: {}", error_msg)))
    }
}

/// Restore registry from a backup file (same as import)
#[tauri::command]
pub async fn restore_registry(path: String) -> Result<(), String> {
    import_registry_internal(&path)
        .await
        .map_err(|e| e.to_string())
}

/// Restore a backup file by name from the app's backup directory
#[tauri::command]
pub async fn restore_backup_by_name(name: String) -> Result<(), String> {
    let mut path = get_backup_directory();
    path.push(name);
    
    if !path.exists() {
        return Err("备份文件不存在".to_string());
    }

    import_registry_internal(&path.to_string_lossy())
        .await
        .map_err(|e| e.to_string())
}

/// Delete a backup file by name from the app's backup directory
#[tauri::command]
pub async fn delete_backup_by_name(name: String) -> Result<(), String> {
    let mut path = get_backup_directory();
    path.push(name);
    
    if !path.exists() {
        return Err("备份文件不存在".to_string());
    }

    fs::remove_file(path)
        .map_err(|e| format!("无法删除备份文件: {}", e))
}

/// Check if app is running as administrator
#[tauri::command]
pub async fn check_admin() -> bool {
    is_admin()
}

/// Open the backup directory in Windows Explorer
#[tauri::command]
pub async fn open_backup_folder() -> Result<(), String> {
    let path = get_backup_directory();
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| format!("无法创建备份目录: {}", e))?;
    }

    #[cfg(windows)]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| format!("无法打开文件夹: {}", e))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("仅支持 Windows 平台".to_string())
    }
}

/// Scan registry for invalid entries
#[tauri::command]
pub async fn scan_registry() -> Result<Vec<RegistryScanResult>, String> {
    scan_registry_internal()
        .await
        .map_err(|e| e.to_string())
}

async fn scan_registry_internal() -> AppResult<Vec<RegistryScanResult>> {
    let mut results = Vec::new();

    // 1. Check invalid uninstall entries
    let uninstall_issues = scan_uninstall_entries().await?;
    results.push(RegistryScanResult {
        category: "无效的卸载信息".to_string(),
        count: uninstall_issues.len() as u32,
        items: uninstall_issues,
    });

    // 2. Check invalid startup entries
    let startup_issues = scan_startup_entries().await?;
    results.push(RegistryScanResult {
        category: "无效的启动项".to_string(),
        count: startup_issues.len() as u32,
        items: startup_issues,
    });

    // 3. Check invalid file associations
    let assoc_issues = scan_file_associations().await?;
    results.push(RegistryScanResult {
        category: "无效的文件关联".to_string(),
        count: assoc_issues.len() as u32,
        items: assoc_issues,
    });

    // 4. Check invalid shared DLLs
    let dll_issues = scan_shared_dlls().await?;
    results.push(RegistryScanResult {
        category: "无效的共享DLL".to_string(),
        count: dll_issues.len() as u32,
        items: dll_issues,
    });

    // 5. Check invalid App Paths
    let app_path_issues = scan_app_paths().await?;
    results.push(RegistryScanResult {
        category: "无效的应用路径".to_string(),
        count: app_path_issues.len() as u32,
        items: app_path_issues,
    });

    // 6. Check Muicache
    let mui_issues = scan_mui_cache().await?;
    results.push(RegistryScanResult {
        category: "无效的MUI缓存".to_string(),
        count: mui_issues.len() as u32,
        items: mui_issues,
    });

    // 7. Check ActiveX/COM (CLSID)
    let clsid_issues = scan_clsid().await?;
    results.push(RegistryScanResult {
        category: "无效的ActiveX/COM组件".to_string(),
        count: clsid_issues.len() as u32,
        items: clsid_issues,
    });

    // 8. Check IFEO (Image Hijack)
    let ifeo_issues = scan_ifeo().await?;
    results.push(RegistryScanResult {
        category: "映像劫持/IFEO".to_string(),
        count: ifeo_issues.len() as u32,
        items: ifeo_issues,
    });

    Ok(results)
}

/// Check if a registry path is in the safety whitelist
fn is_whitelisted(path: &str) -> bool {
    let lower = path.to_lowercase();
    // Never touch critical Windows components
    let whitelist = [
        "microsoft\\windows\\currentversion\\installer",
        "microsoft\\windows nt\\currentversion\\winlogon",
        "microsoft\\windows\\currentversion\\policies",
        "system\\currentcontrolset\\control",
    ];

    for item in whitelist {
        if lower.contains(item) {
            return true;
        }
    }
    false
}

/// Scan HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall for invalid entries
async fn scan_uninstall_entries() -> AppResult<Vec<RegistryIssue>> {
    let mut issues = Vec::new();

    // Scan both 32-bit and 64-bit uninstall keys
    let paths = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];

    for (hkey, path) in paths {
        if let Ok(uninstall_key) = RegKey::predef(hkey).open_subkey(path) {
            for subkey_name in uninstall_key.enum_keys().filter_map(|x| x.ok()) {
                let full_path = format!("{}\\{}\\{}", 
                    if hkey == HKEY_LOCAL_MACHINE { "HKLM" } else { "HKCU" },
                    path, subkey_name);
                
                if is_whitelisted(&full_path) { continue; }

                if let Ok(subkey) = uninstall_key.open_subkey(&subkey_name) {
                    // Check UninstallString
                    if let Ok(uninstall_string) = subkey.get_value::<String, _>("UninstallString") {
                        let exe_path = extract_path_from_command(&uninstall_string);
                        if !exe_path.is_empty() && !Path::new(&exe_path).exists() {
                            issues.push(RegistryIssue {
                                path: format!("{}\\{}\\{}", 
                                    if hkey == HKEY_LOCAL_MACHINE { "HKLM" } else { "HKCU" },
                                    path, subkey_name),
                                value_name: Some("UninstallString".to_string()),
                                issue_type: "invalid_path".to_string(),
                                details: format!("指向不存在的文件: {}", exe_path),
                            });
                        }
                    }

                    // Check InstallLocation
                    if let Ok(install_location) = subkey.get_value::<String, _>("InstallLocation") {
                        if !install_location.is_empty() && !Path::new(&install_location).exists() {
                            issues.push(RegistryIssue {
                                path: format!("{}\\{}\\{}", 
                                    if hkey == HKEY_LOCAL_MACHINE { "HKLM" } else { "HKCU" },
                                    path, subkey_name),
                                value_name: Some("InstallLocation".to_string()),
                                issue_type: "invalid_path".to_string(),
                                details: format!("安装目录不存在: {}", install_location),
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(issues)
}

/// Scan startup entries (Run keys) for invalid paths
async fn scan_startup_entries() -> AppResult<Vec<RegistryIssue>> {
    let mut issues = Vec::new();

    let paths = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run"),
    ];

    for (hkey, path) in paths {
        if let Ok(run_key) = RegKey::predef(hkey).open_subkey(path) {
            for (name, value) in run_key.enum_values().filter_map(|x| x.ok()) {
                let command = value.to_string();
                let exe_path = extract_path_from_command(&command);
                if !exe_path.is_empty() && !Path::new(&exe_path).exists() {
                    issues.push(RegistryIssue {
                        path: format!("{}\\{}", 
                            if hkey == HKEY_LOCAL_MACHINE { "HKLM" } else { "HKCU" },
                            path),
                        value_name: Some(name),
                        issue_type: "invalid_startup".to_string(),
                        details: format!("启动项指向不存在的文件: {}", exe_path),
                    });
                }
            }
        }
    }

    Ok(issues)
}

/// Scan file associations for invalid references
async fn scan_file_associations() -> AppResult<Vec<RegistryIssue>> {
    let mut issues = Vec::new();

    // Only scan a subset for performance
    let classes_root = RegKey::predef(HKEY_CLASSES_ROOT);
    
    // Check a limited number of common extensions
    let test_extensions = [".txt", ".doc", ".pdf", ".exe", ".dll", ".jpg", ".png"];
    
    for ext in test_extensions {
        if let Ok(ext_key) = classes_root.open_subkey(ext) {
            if let Ok(prog_id) = ext_key.get_value::<String, _>("") {
                // Check if the ProgID exists
                if !prog_id.is_empty() {
                    if classes_root.open_subkey(&prog_id).is_err() {
                        issues.push(RegistryIssue {
                            path: format!("HKCR\\{}", ext),
                            value_name: Some("(Default)".to_string()),
                            issue_type: "invalid_association".to_string(),
                            details: format!("文件关联指向不存在的ProgID: {}", prog_id),
                        });
                    }
                }
            }
        }
    }

    Ok(issues)
}

/// Scan App Paths for invalid executable references
async fn scan_app_paths() -> AppResult<Vec<RegistryIssue>> {
    let mut issues = Vec::new();
    let paths = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths"),
    ];

    for (hkey, path) in paths {
        if let Ok(app_paths) = RegKey::predef(hkey).open_subkey(path) {
            for subkey_name in app_paths.enum_keys().filter_map(|x| x.ok()) {
                if let Ok(subkey) = app_paths.open_subkey(&subkey_name) {
                    if let Ok(exe_path) = subkey.get_value::<String, _>("") {
                        let trimmed = exe_path.trim_matches('"');
                        if !trimmed.is_empty() && !Path::new(trimmed).exists() {
                            issues.push(RegistryIssue {
                                path: format!("{}\\{}\\{}", 
                                    if hkey == HKEY_LOCAL_MACHINE { "HKLM" } else { "HKCU" },
                                    path, subkey_name),
                                value_name: Some("".to_string()),
                                issue_type: "invalid_path".to_string(),
                                details: format!("应用路径不存在: {}", trimmed),
                            });
                        }
                    }
                }
            }
        }
    }
    Ok(issues)
}

/// Scan MUI Cache for invalid file references
async fn scan_mui_cache() -> AppResult<Vec<RegistryIssue>> {
    let mut issues = Vec::new();
    let path = r"Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache";
    
    if let Ok(mui_cache) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(path) {
        for (name, _value) in mui_cache.enum_values().filter_map(|x| x.ok()) {
            // MuiCache names are often paths like "C:\Path\To\Exe.FriendlyAppName"
            // or just the path itself.
            let potential_path = name.split(".FriendlyAppName").next().unwrap_or("");
            
            if potential_path.contains('\\') && !Path::new(potential_path).exists() {
                issues.push(RegistryIssue {
                    path: format!("HKCU\\{}", path),
                    value_name: Some(name.clone()),
                    issue_type: "invalid_path".to_string(),
                    details: format!("MUI缓存指向不存在的文件: {}", potential_path),
                });
            }
        }
    }
    Ok(issues)
}

/// Scan shared DLLs for invalid references
async fn scan_shared_dlls() -> AppResult<Vec<RegistryIssue>> {
    let mut issues = Vec::new();

    let path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\SharedDLLs";
    
    if is_whitelisted(path) { return Ok(issues); }

    // Check both 32/64 bit views if applicable, but winreg handles standard views well
    if let Ok(shared_dlls) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(path, KEY_READ | KEY_WOW64_64KEY) {
        // Limit scan to prevent excessive processing in a single pass
        for (dll_path, _value) in shared_dlls.enum_values().filter_map(|x| x.ok()).take(500) {
            if !dll_path.is_empty() && !Path::new(&dll_path).exists() {
                issues.push(RegistryIssue {
                    path: format!("HKLM\\{}", path),
                    value_name: Some(dll_path.clone()),
                    issue_type: "invalid_dll".to_string(),
                    details: format!("共享DLL不存在: {}", dll_path),
                });
            }
        }
    }

    Ok(issues)
}

/// Scan HKCR\CLSID for invalid COM components
async fn scan_clsid() -> AppResult<Vec<RegistryIssue>> {
    let mut issues = Vec::new();
    let clsid_path = r"CLSID";
    
    if let Ok(clsid_key) = RegKey::predef(HKEY_CLASSES_ROOT).open_subkey(clsid_path) {
        // Limit to 1000 items to avoid freezing for minutes
        for subkey_name in clsid_key.enum_keys().filter_map(|x| x.ok()).take(1000) {
            let full_path = format!("HKCR\\CLSID\\{}", subkey_name);
            if is_whitelisted(&full_path) { continue; }

            if let Ok(subkey) = clsid_key.open_subkey(&subkey_name) {
                // Check InprocServer32 and LocalServer32
                for server_type in ["InprocServer32", "LocalServer32"] {
                    if let Ok(server_key) = subkey.open_subkey(server_type) {
                        if let Ok(server_path) = server_key.get_value::<String, _>("") {
                            let clean_path = extract_path_from_command(&server_path);
                            if !clean_path.is_empty() && !Path::new(&clean_path).exists() {
                                issues.push(RegistryIssue {
                                    path: format!("HKCR\\CLSID\\{}\\{}", subkey_name, server_type),
                                    value_name: Some("".to_string()),
                                    issue_type: "invalid_com".to_string(),
                                    details: format!("COM服务器不存在: {}", clean_path),
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(issues)
}

/// Scan IFEO for debugger hijacks
async fn scan_ifeo() -> AppResult<Vec<RegistryIssue>> {
    let mut issues = Vec::new();
    let path = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options";
    
    if is_whitelisted(path) { return Ok(issues); }

    if let Ok(ifeo_key) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(path) {
        for subkey_name in ifeo_key.enum_keys().filter_map(|x| x.ok()) {
            if let Ok(subkey) = ifeo_key.open_subkey(&subkey_name) {
                if let Ok(debugger) = subkey.get_value::<String, _>("Debugger") {
                    let clean_path = extract_path_from_command(&debugger);
                    // If debugger is set to something non-existent or "null" (malicious often use this)
                    if !clean_path.is_empty() && !Path::new(&clean_path).exists() {
                        issues.push(RegistryIssue {
                            path: format!("HKLM\\{}\\{}", path, subkey_name),
                            value_name: Some("Debugger".to_string()),
                            issue_type: "ifeo_hijack".to_string(),
                            details: format!("发现IFEO调试器劫持 (可能指向不存在的文件): {}", debugger),
                        });
                    }
                }
            }
        }
    }
    Ok(issues)
}

/// Clean specific registry issues
#[tauri::command]
pub async fn clean_registry(issues: Vec<RegistryIssue>) -> Result<u32, String> {
    clean_registry_internal(issues)
        .await
        .map_err(|e| e.to_string())
}

async fn clean_registry_internal(issues: Vec<RegistryIssue>) -> AppResult<u32> {
    let mut cleaned = 0u32;

    for issue in issues {
        let result = match issue.issue_type.as_str() {
            "invalid_path" | "invalid_startup" | "invalid_dll" | "invalid_com" | "ifeo_hijack" => {
                // For these, we delete the value or subkey
                delete_registry_item(&issue.path, issue.value_name.as_deref()).await
            }
            "invalid_association" => {
                // Skip file associations for safety
                continue;
            }
            _ => continue,
        };

        match result {
            Ok(_) => {
                cleaned += 1;
                tracing::info!("Cleaned registry entry: {:?}", issue);
            }
            Err(e) => {
                tracing::warn!("Failed to clean {:?}: {}", issue, e);
            }
        }
    }

    Ok(cleaned)
}

/// Delete a registry key or value
async fn delete_registry_item(path: &str, value_name: Option<&str>) -> AppResult<()> {
    // Parse the path
    let parts: Vec<&str> = path.splitn(2, '\\').collect();
    if parts.len() < 2 {
        return Err(AppError::SystemError(format!("Invalid registry path: {}", path)));
    }

    let hkey = match parts[0] {
        "HKLM" => HKEY_LOCAL_MACHINE,
        "HKCU" => HKEY_CURRENT_USER,
        "HKCR" => HKEY_CLASSES_ROOT,
        _ => return Err(AppError::SystemError(format!("Unknown registry hive: {}", parts[0]))),
    };

    let subpath = parts[1];
    let flags = KEY_WRITE | KEY_WOW64_64KEY;

    // Case 1: Delete a specific value
    if let Some(value) = value_name {
        if !value.is_empty() {
            match RegKey::predef(hkey).open_subkey_with_flags(subpath, flags) {
                Ok(key) => {
                    key.delete_value(value)
                        .map_err(|e| AppError::SystemError(format!("Failed to delete value '{}' at {}: {}", value, path, e)))?;
                    return Ok(());
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    tracing::info!("Registry path not found, assuming value already deleted: {}", path);
                    return Ok(());
                }
                Err(e) => return Err(AppError::SystemError(format!("Failed to access registry key {}: {}", path, e))),
            }
        }
    }

    // Case 2: Delete a subkey (if value_name is None, empty string, or we specifically want to remove the path)
    if let Some(last_sep) = subpath.rfind('\\') {
        let parent_path = &subpath[..last_sep];
        let subkey_name = &subpath[last_sep + 1..];
        
        match RegKey::predef(hkey).open_subkey_with_flags(parent_path, flags) {
            Ok(parent) => {
                parent.delete_subkey_all(subkey_name)
                    .map_err(|e| AppError::SystemError(format!("Failed to delete subkey '{}' at {}: {}", subkey_name, parent_path, e)))?;
                Ok(())
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                tracing::info!("Parent registry key not found, assuming subkey already deleted: {}", parent_path);
                Ok(())
            }
            Err(e) => Err(AppError::SystemError(format!("Failed to access parent registry key {}: {}", parent_path, e))),
        }
    } else {
        // If no separator, it's a top-level subkey of the hive
        RegKey::predef(hkey).delete_subkey_all(subpath)
            .map_err(|e| AppError::SystemError(format!("Failed to delete top-level subkey '{}': {}", subpath, e)))
    }
}

/// Extract executable path from a command string
fn extract_path_from_command(command: &str) -> String {
    let command = command.trim();
    
    // Handle quoted paths
    if command.starts_with('"') {
        if let Some(end) = command[1..].find('"') {
            return command[1..end + 1].to_string();
        }
    }
    
    // Handle paths with MsiExec or other installers
    if command.to_lowercase().contains("msiexec") {
        return String::new(); // Skip MSI commands, they're typically valid
    }
    
    // Handle simple paths (check if the whole thing or until first space exists)
    if command.contains('\\') || command.contains('/') {
        // If the whole command exists, it's a valid path
        if Path::new(command).exists() {
            return command.to_string();
        }

        // Try to find the longest prefix that exists as a file
        let mut current = command;
        while let Some(space) = current.rfind(' ') {
            current = &current[..space];
            let trimmed = current.trim_matches('"');
            if !trimmed.is_empty() && Path::new(trimmed).exists() {
                return trimmed.to_string();
            }
        }
        
        // If it ends with .exe and contains spaces but no quotes, 
        // Windows might still find it. We should be careful not to flag it if it actually exists.
        // But here we are looking for what DOES exist.
        
        // Return first token as a fallback for scanning
        if let Some(space) = command.find(' ') {
            return command[..space].to_string();
        }
    }
    
    command.to_string()
}

/// Get list of available backup files
#[tauri::command]
pub async fn list_registry_backups() -> Result<Vec<String>, String> {
    let backup_dir = get_backup_directory();
    
    let mut backups = Vec::new();
    if let Ok(entries) = fs::read_dir(&backup_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "reg") {
                if let Some(name) = path.file_name() {
                    backups.push(name.to_string_lossy().to_string());
                }
            }
        }
    }
    
    Ok(backups)
}

/// Get default backup directory
fn get_backup_directory() -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("com.tasknexus.app");
    path.push("registry_backups");
    path
}

/// Create a timestamped backup of important registry keys
#[tauri::command]
pub async fn create_full_backup() -> Result<String, String> {
    let backup_dir = get_backup_directory();
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!("backup_{}.reg", timestamp);
    let full_path = backup_dir.join(&filename);
    
    // Backup the most important keys
    backup_registry(
        full_path.to_string_lossy().to_string(),
        "HKEY_CURRENT_USER\\Software".to_string()
    ).await?;
    
    Ok(filename)
}

/// Get the absolute path of the backup directory
#[tauri::command]
pub async fn get_backup_path() -> Result<String, String> {
    Ok(get_backup_directory().to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_path() {
        assert_eq!(
            extract_path_from_command(r#""C:\Program Files\App\app.exe" --arg"#),
            r"C:\Program Files\App\app.exe"
        );
        assert_eq!(
            extract_path_from_command(r"C:\Windows\System32\cmd.exe /c"),
            r"C:\Windows\System32\cmd.exe"
        );
    }
}
