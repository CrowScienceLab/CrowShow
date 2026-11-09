use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StorageConfig {
    drive_folder: Option<String>,
    local_files: HashMap<String, String>,
    drive_files: HashMap<String, String>,
    hashes: HashMap<String, String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookStorageStatus {
    file_path: Option<String>,
    drive_folder: Option<String>,
    drive_file: Option<String>,
}
#[derive(Serialize)]
pub struct OpenedNotebook {
    content: String,
    path: String,
}
fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let folder = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    Ok(folder.join("notebook-files.json"))
}
fn load_config(app: &tauri::AppHandle) -> Result<StorageConfig, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(StorageConfig::default());
    }
    serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
fn save_config(app: &tauri::AppHandle, c: &StorageConfig) -> Result<(), String> {
    fs::write(
        config_path(app)?,
        serde_json::to_vec_pretty(c).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn revision_key(book_id: &str, path: &str) -> String {
    format!("{book_id}\n{path}")
}
fn write_revision(
    config: &mut StorageConfig,
    book_id: &str,
    path: &Path,
    content: &str,
    allow_replace: bool,
    backup: &Path,
) -> Result<(), String> {
    let key = revision_key(book_id, &path.to_string_lossy());
    let hash = write_file(
        path,
        content,
        config.hashes.get(&key).map(String::as_str),
        allow_replace,
        backup,
    )?;
    config.hashes.insert(key, hash);
    Ok(())
}
fn validate_content(content: &str) -> Result<(), String> {
    if content.len() > 128 * 1024 * 1024 {
        return Err("Notebook 파일은 128MB 이하만 지원합니다.".into());
    }
    let v: serde_json::Value =
        serde_json::from_str(content).map_err(|_| "Notebook JSON 형식 오류")?;
    if v["format"] != "crowshow-notebook"
        || v["version"] != 1
        || !v["book"]["pages"].is_array()
        || !v["book"]["annotations"].is_object()
    {
        return Err("Notebook 파일 형식 오류".into());
    }
    Ok(())
}
fn safe_name(title: &str) -> String {
    let value: String = title
        .chars()
        .filter(|c| !c.is_control() && !"<>:\"/\\|?*".contains(*c))
        .take(70)
        .collect();
    let value = value.trim().trim_end_matches('.');
    if value.is_empty() {
        "Notebook".into()
    } else {
        value.into()
    }
}
#[cfg(windows)]
fn dialog(
    app: &tauri::AppHandle,
    kind: &str,
    folder: Option<&str>,
    name: &str,
) -> Result<Option<String>, String> {
    use windows_sys::Win32::{
        Foundation::HWND,
        System::Com::{COINIT_APARTMENTTHREADED, CoInitializeEx, CoTaskMemFree, CoUninitialize},
        UI::{
            Controls::Dialogs::{
                CommDlgExtendedError, GetOpenFileNameW, GetSaveFileNameW, OFN_ENABLESIZING,
                OFN_EXPLORER, OFN_FILEMUSTEXIST, OFN_NOCHANGEDIR, OFN_OVERWRITEPROMPT,
                OFN_PATHMUSTEXIST, OPENFILENAMEW,
            },
            Shell::{
                BFFM_INITIALIZED, BFFM_SETSELECTIONW, BIF_EDITBOX, BIF_NEWDIALOGSTYLE,
                BIF_RETURNONLYFSDIRS, BROWSEINFOW, SHBrowseForFolderW, SHGetPathFromIDListEx,
            },
            WindowsAndMessaging::SendMessageW,
        },
    };
    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }
    struct Com;
    impl Drop for Com {
        fn drop(&mut self) {
            unsafe { CoUninitialize() }
        }
    }
    unsafe extern "system" fn select_initial(
        hwnd: HWND,
        message: u32,
        _value: isize,
        initial: isize,
    ) -> i32 {
        if message == BFFM_INITIALIZED && initial != 0 {
            unsafe { SendMessageW(hwnd, BFFM_SETSELECTIONW, 1, initial) };
        }
        0
    }
    let result = unsafe { CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32) };
    if result < 0 {
        return Err(format!("파일 대화상자 초기화 실패: {result:x}"));
    }
    let _com = Com;
    let owner = app
        .get_webview_window("main")
        .and_then(|w| w.hwnd().ok())
        .map_or(std::ptr::null_mut(), |h| h.0);
    let folder = wide(folder.unwrap_or(""));
    let mut buffer = vec![0u16; 32768];
    if kind == "folder" {
        let title = wide("PC용 Google Drive가 동기화하는 폴더를 선택하세요");
        let mut display = [0u16; 260];
        let browse = BROWSEINFOW {
            hwndOwner: owner,
            pszDisplayName: display.as_mut_ptr(),
            lpszTitle: title.as_ptr(),
            ulFlags: BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE | BIF_EDITBOX,
            lpfn: Some(select_initial),
            lParam: if folder.len() > 1 {
                folder.as_ptr() as isize
            } else {
                0
            },
            ..Default::default()
        };
        let pidl = unsafe { SHBrowseForFolderW(&browse) };
        if pidl.is_null() {
            return Ok(None);
        }
        let success =
            unsafe { SHGetPathFromIDListEx(pidl, buffer.as_mut_ptr(), buffer.len() as u32, 0) };
        unsafe { CoTaskMemFree(pidl.cast()) };
        if success == 0 {
            return Err("파일 시스템 폴더를 선택하세요.".into());
        }
    } else {
        let file_name = wide(name);
        let count = file_name.len().min(buffer.len());
        buffer[..count].copy_from_slice(&file_name[..count]);
        let filter = wide("CrowShow Notebook (*.crownotebook)\0*.crownotebook\0\0");
        let extension = wide("crownotebook");
        let title = wide(if kind == "save" {
            "Notebook 저장"
        } else {
            "Notebook 불러오기"
        });
        let mut options = OPENFILENAMEW {
            lStructSize: std::mem::size_of::<OPENFILENAMEW>() as u32,
            hwndOwner: owner,
            lpstrFilter: filter.as_ptr(),
            nFilterIndex: 1,
            lpstrFile: buffer.as_mut_ptr(),
            nMaxFile: buffer.len() as u32,
            lpstrInitialDir: if folder.len() > 1 {
                folder.as_ptr()
            } else {
                std::ptr::null()
            },
            lpstrTitle: title.as_ptr(),
            lpstrDefExt: extension.as_ptr(),
            Flags: OFN_EXPLORER
                | OFN_ENABLESIZING
                | OFN_NOCHANGEDIR
                | OFN_PATHMUSTEXIST
                | if kind == "save" {
                    OFN_OVERWRITEPROMPT
                } else {
                    OFN_FILEMUSTEXIST
                },
            ..Default::default()
        };
        let success = unsafe {
            if kind == "save" {
                GetSaveFileNameW(&mut options)
            } else {
                GetOpenFileNameW(&mut options)
            }
        };
        if success == 0 {
            let error = unsafe { CommDlgExtendedError() };
            return if error == 0 {
                Ok(None)
            } else {
                Err(format!("파일 대화상자 오류: {error:x}"))
            };
        }
    }
    let length = buffer.iter().position(|v| *v == 0).unwrap_or(buffer.len());
    Ok(Some(String::from_utf16_lossy(&buffer[..length])))
}
#[cfg(not(windows))]
fn dialog(
    _app: &tauri::AppHandle,
    _kind: &str,
    _folder: Option<&str>,
    _name: &str,
) -> Result<Option<String>, String> {
    Err("이 파일 연결 기능은 Windows PC용입니다.".into())
}

fn notebook_path(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    if !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("crownotebook"))
    {
        return Err(".crownotebook 파일을 선택하세요.".into());
    }
    Ok(path)
}
fn write_file(
    path: &Path,
    content: &str,
    expected: Option<&str>,
    allow_replace: bool,
    backup_root: &Path,
) -> Result<String, String> {
    validate_content(content)?;
    if path.exists() {
        let current = fs::read(path).map_err(|e| e.to_string())?;
        if !allow_replace && expected != Some(digest(&current).as_str()) {
            return Err("다른 프로그램 또는 기기에서 파일이 변경됐습니다. 다시 불러오거나 다른 이름으로 저장하세요.".into());
        }
        fs::create_dir_all(backup_root).map_err(|e| e.to_string())?;
        fs::write(
            backup_root.join(format!("{}.crownotebook", digest(&current))),
            current,
        )
        .map_err(|e| e.to_string())?;
    }
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let temp = path.with_extension(format!("crownotebook.{nonce}.tmp"));
    fs::write(&temp, content).map_err(|e| e.to_string())?;
    fs::rename(&temp, path).map_err(|e| format!("저장 파일 교체 실패: {e}"))?;
    Ok(digest(content.as_bytes()))
}
fn require_drive(
    app: &tauri::AppHandle,
    config: &mut StorageConfig,
) -> Result<Option<String>, String> {
    if let Some(folder) = &config.drive_folder {
        if Path::new(folder).is_dir() {
            return Ok(Some(folder.clone()));
        }
    }
    let folder = dialog(&app, "folder", config.drive_folder.as_deref(), "")?;
    config.drive_folder = folder.clone();
    Ok(folder)
}
#[tauri::command]
pub fn notebook_storage_status(
    app: tauri::AppHandle,
    book_id: String,
) -> Result<NotebookStorageStatus, String> {
    let c = load_config(&app)?;
    Ok(NotebookStorageStatus {
        file_path: c.local_files.get(&book_id).cloned(),
        drive_folder: c.drive_folder,
        drive_file: c.drive_files.get(&book_id).cloned(),
    })
}
#[tauri::command]
pub async fn choose_notebook_drive_folder(
    app: tauri::AppHandle,
    clear: Option<bool>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut c = load_config(&app)?;
        if clear.unwrap_or(false) {
            c.drive_folder = None;
            save_config(&app, &c)?;
            return Ok(None);
        }
        let selected = dialog(&app, "folder", c.drive_folder.as_deref(), "")?;
        if selected.is_some() {
            c.drive_folder = selected.clone();
            save_config(&app, &c)?;
        }
        Ok(selected)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn save_notebook_file(
    app: tauri::AppHandle,
    book_id: String,
    title: String,
    content: String,
    save_as: bool,
    drive: bool,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut c = load_config(&app)?;
        validate_content(&content)?;
        let selected = if drive {
            let Some(folder) = require_drive(&app, &mut c)? else {
                return Ok(None);
            };
            let parent = Path::new(&folder);
            let stored = c
                .drive_files
                .get(&book_id)
                .filter(|path| Path::new(path).parent() == Some(parent))
                .cloned();
            Some(stored.unwrap_or_else(|| {
                parent
                    .join(format!(
                        "{}-{}.crownotebook",
                        safe_name(&title),
                        book_id
                            .chars()
                            .filter(|c| c.is_ascii_alphanumeric())
                            .take(12)
                            .collect::<String>()
                    ))
                    .to_string_lossy()
                    .into()
            }))
        } else if !save_as && c.local_files.contains_key(&book_id) {
            c.local_files.get(&book_id).cloned()
        } else {
            dialog(
                &app,
                "save",
                None,
                &format!("{}.crownotebook", safe_name(&title)),
            )?
        };
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = notebook_path(&selected)?;
        let backup = config_path(&app)?
            .parent()
            .ok_or("설정 폴더 오류")?
            .join("notebook-backups");
        let allow_replace = !drive && (save_as || !c.local_files.contains_key(&book_id));
        write_revision(&mut c, &book_id, &path, &content, allow_replace, &backup)?;
        if drive {
            c.drive_files.insert(book_id, selected.clone());
        } else {
            c.local_files.insert(book_id, selected.clone());
        }
        save_config(&app, &c)?;
        Ok(Some(selected))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn open_notebook_file(
    app: tauri::AppHandle,
    book_id: String,
    drive: bool,
) -> Result<Option<OpenedNotebook>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut c = load_config(&app)?;
        let folder = if drive {
            let Some(folder) = require_drive(&app, &mut c)? else {
                return Ok(None);
            };
            Some(folder)
        } else {
            None
        };
        let Some(selected) = dialog(&app, "open", folder.as_deref(), "")? else {
            return Ok(None);
        };
        let path = notebook_path(&selected)?;
        let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
        if size > 128 * 1024 * 1024 {
            return Err("Notebook 파일이 128MB를 초과합니다.".into());
        }
        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        validate_content(&content)?;
        c.hashes.insert(
            revision_key(&book_id, &selected),
            digest(content.as_bytes()),
        );
        if drive {
            c.drive_files.insert(book_id, selected.clone());
        } else {
            c.local_files.insert(book_id, selected.clone());
        }
        save_config(&app, &c)?;
        Ok(Some(OpenedNotebook {
            content,
            path: selected,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn notebook_write_roundtrip_and_conflict() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tmp")
            .join(format!(
                "notebook-test-{}",
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("sample.crownotebook");
        let backup = root.join("backups");
        let content =
            r#"{"format":"crowshow-notebook","version":1,"book":{"pages":[],"annotations":{}}}"#;
        let hash = write_file(&path, content, None, false, &backup).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), content);
        let updated = content.replace("\"pages\":[]", "\"pages\":[{}]");
        let next = write_file(&path, &updated, Some(&hash), false, &backup).unwrap();
        assert_ne!(hash, next);
        assert_eq!(fs::read_dir(&backup).unwrap().count(), 1);
        fs::write(&path, content).unwrap();
        assert!(write_file(&path, &updated, Some(&next), false, &backup).is_err());
        assert_eq!(fs::read_to_string(path).unwrap(), content);
    }
    #[test]
    fn file_names_and_formats() {
        assert_eq!(safe_name("A/B:*?"), "AB");
        assert!(notebook_path("relative.crownotebook").is_err());
        assert!(validate_content("{}").is_err());
    }
    #[test]
    fn stale_open_copy_cannot_overwrite_another_book() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../tmp")
            .join(format!(
                "notebook-revisions-{}",
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("shared.crownotebook");
        let backup = root.join("backups");
        let original =
            r#"{"format":"crowshow-notebook","version":1,"book":{"pages":[],"annotations":{}}}"#;
        let updated = original.replace("\"pages\":[]", "\"pages\":[{}]");
        let hash = write_file(&path, original, None, false, &backup).unwrap();
        let mut config = StorageConfig::default();
        for book in ["copy-a", "copy-b"] {
            config
                .hashes
                .insert(revision_key(book, &path.to_string_lossy()), hash.clone());
        }
        write_revision(&mut config, "copy-a", &path, &updated, false, &backup).unwrap();
        assert!(write_revision(&mut config, "copy-b", &path, original, false, &backup).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), updated);
        write_revision(&mut config, "copy-a", &path, &updated, false, &backup).unwrap();
    }
}
