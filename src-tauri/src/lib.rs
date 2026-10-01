use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{Emitter, Manager, State};

const REPOSITORY: &str = "CrowScienceLab/CrowShow";
const RELEASE_API: &str = "https://api.github.com/repos/CrowScienceLab/CrowShow/releases/latest";
const MAX_INSTALLER_BYTES: usize = 350 * 1024 * 1024;

struct PendingPdf(Mutex<Option<PathBuf>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfPayload {
    name: String,
    size: usize,
    bytes: Vec<u8>,
}

#[derive(Deserialize)]
struct ReleaseAsset {
    name: String,
    browser_download_url: String,
    size: usize,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    assets: Vec<ReleaseAsset>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckResult {
    status: String,
    version: Option<String>,
    asset_name: Option<String>,
    asset_url: Option<String>,
    checksum_url: Option<String>,
    release_url: Option<String>,
    error: Option<String>,
}

fn find_pdf_path<I, S>(args: I) -> Option<PathBuf>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .map(|arg| PathBuf::from(arg.as_ref()))
        .find(|path| {
            path.is_file()
                && path
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
        })
}

fn read_pdf(path: &Path) -> Result<PdfPayload, String> {
    if !path.is_file()
        || !path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
    {
        return Err("유효한 PDF 파일이 아닙니다.".into());
    }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    Ok(PdfPayload {
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("document.pdf")
            .to_string(),
        size: bytes.len(),
        bytes,
    })
}

fn normalize_version(value: &str) -> Vec<u32> {
    value
        .trim_start_matches(['v', 'V'])
        .split('-')
        .next()
        .unwrap_or(value)
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect()
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    let mut left = normalize_version(latest);
    let mut right = normalize_version(current);
    let len = left.len().max(right.len()).max(3);
    left.resize(len, 0);
    right.resize(len, 0);
    left > right
}

fn github_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("CrowShow/{}", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_initial_pdf(state: State<'_, PendingPdf>) -> Result<Option<PdfPayload>, String> {
    let path = state.0.lock().map_err(|_| "PDF 상태 잠금 오류")?.take();
    path.map(|item| read_pdf(&item)).transpose()
}

#[tauri::command]
async fn check_for_updates() -> Result<UpdateCheckResult, String> {
    let response = github_client()?
        .get(RELEASE_API)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(UpdateCheckResult {
            status: "no-release".into(),
            version: None,
            asset_name: None,
            asset_url: None,
            checksum_url: None,
            release_url: None,
            error: None,
        });
    }
    let release = response
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<GithubRelease>()
        .await
        .map_err(|error| error.to_string())?;
    let version = release.tag_name.trim_start_matches(['v', 'V']).to_string();
    if !is_newer_version(&version, env!("CARGO_PKG_VERSION")) {
        return Ok(UpdateCheckResult {
            status: "current".into(),
            version: Some(env!("CARGO_PKG_VERSION").to_string()),
            asset_name: None,
            asset_url: None,
            checksum_url: None,
            release_url: Some(release.html_url),
            error: None,
        });
    }
    let installer = release.assets.iter().find(|asset| {
        let lower = asset.name.to_ascii_lowercase();
        lower.starts_with("crowshow-v")
            && lower.ends_with("-setup-x64.exe")
            && asset.size > 0
            && asset.size <= MAX_INSTALLER_BYTES
    });
    let checksums = release
        .assets
        .iter()
        .find(|asset| asset.name.eq_ignore_ascii_case("SHA256SUMS.txt"))
        .or_else(|| {
            release.assets.iter().find(|asset| {
                let name = asset.name.to_ascii_lowercase();
                name.starts_with("sha256sums-v") && name.ends_with(".txt")
            })
        });
    match (installer, checksums) {
        (Some(installer), Some(checksums)) => Ok(UpdateCheckResult {
            status: "available".into(),
            version: Some(version),
            asset_name: Some(installer.name.clone()),
            asset_url: Some(installer.browser_download_url.clone()),
            checksum_url: Some(checksums.browser_download_url.clone()),
            release_url: Some(release.html_url),
            error: None,
        }),
        _ => Ok(UpdateCheckResult {
            status: "error".into(),
            version: Some(version),
            asset_name: None,
            asset_url: None,
            checksum_url: None,
            release_url: Some(release.html_url),
            error: Some("검증 가능한 Windows 설치 파일이 없습니다.".into()),
        }),
    }
}

fn validate_release_url(url: &str) -> bool {
    url.starts_with(&format!(
        "https://github.com/{REPOSITORY}/releases/download/"
    ))
}

fn expected_checksum(checksums: &str, asset_name: &str) -> Result<String, String> {
    checksums
        .lines()
        .find_map(|line| {
            let mut parts = line.split_whitespace();
            let hash = parts.next()?;
            let name = parts.next()?.trim_start_matches('*');
            (name.eq_ignore_ascii_case(asset_name)
                && hash.len() == 64
                && hash.bytes().all(|byte| byte.is_ascii_hexdigit()))
            .then(|| hash.to_ascii_lowercase())
        })
        .ok_or_else(|| "체크섬 파일에서 설치 파일의 유효한 SHA-256을 찾을 수 없습니다.".into())
}

#[tauri::command]
async fn download_and_install_update(
    app: tauri::AppHandle,
    version: String,
    asset_name: String,
    asset_url: String,
    checksum_url: String,
) -> Result<(), String> {
    if !validate_release_url(&asset_url)
        || !validate_release_url(&checksum_url)
        || !asset_name.to_ascii_lowercase().starts_with("crowshow-v")
        || !asset_name.to_ascii_lowercase().ends_with("-setup-x64.exe")
        || asset_name.contains(['/', '\\'])
        || version.is_empty()
        || !version
            .bytes()
            .all(|byte| byte.is_ascii_digit() || byte == b'.')
        || asset_url.rsplit('/').next() != Some(asset_name.as_str())
        || asset_url.rsplit_once('/').map(|(base, _)| base)
            != checksum_url.rsplit_once('/').map(|(base, _)| base)
    {
        return Err("공식 CrowShow 릴리스 주소가 아닙니다.".into());
    }
    let client = github_client()?;
    let installer = client
        .get(&asset_url)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .bytes()
        .await
        .map_err(|error| error.to_string())?;
    if installer.len() > MAX_INSTALLER_BYTES {
        return Err("설치 파일 크기가 허용 범위를 초과했습니다.".into());
    }
    let checksums = client
        .get(&checksum_url)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .text()
        .await
        .map_err(|error| error.to_string())?;
    let expected = expected_checksum(&checksums, &asset_name)?;
    let actual = format!("{:x}", Sha256::digest(&installer));
    if actual != expected {
        return Err("설치 파일 SHA-256 검증에 실패했습니다.".into());
    }
    let update_dir = std::env::temp_dir().join("CrowShow-updates").join(version);
    fs::create_dir_all(&update_dir).map_err(|error| error.to_string())?;
    let installer_path = update_dir.join(asset_name);
    fs::write(&installer_path, installer).map_err(|error| error.to_string())?;
    Command::new(&installer_path)
        .spawn()
        .map_err(|error| error.to_string())?;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_versions_and_checksums() {
        assert!(is_newer_version("v1.1.0", "1.0.5"));
        assert!(is_newer_version("v1.0.5", "1.0.0"));
        assert!(!is_newer_version("v1.1", "1.1.0"));
        assert!(!is_newer_version("v1.0.5", "1.1.0"));
        let hash = "a".repeat(64);
        let name = "CrowShow-v1.1-Setup-x64.exe";
        assert_eq!(
            expected_checksum(&format!("{hash}  {name}\r\n"), name).unwrap(),
            hash
        );
        assert_eq!(
            expected_checksum(&format!("{hash} *{name}\n"), name).unwrap(),
            hash
        );
        assert!(expected_checksum(&format!("{hash} wrong.exe"), name).is_err());
        assert!(expected_checksum(&format!("invalid {name}"), name).is_err());
        assert!(validate_release_url(
            "https://github.com/CrowScienceLab/CrowShow/releases/download/v1.1.0/SHA256SUMS.txt"
        ));
        assert!(!validate_release_url(
            "https://github.com/Other/CrowShow/releases/download/v1.1.0/SHA256SUMS.txt"
        ));
    }
}

#[tauri::command]
fn open_pdf_defaults() -> Result<(), String> {
    Command::new("explorer.exe")
        .arg("ms-settings:defaultapps")
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_pdf = find_pdf_path(std::env::args().skip(1));
    tauri::Builder::default()
        .manage(PendingPdf(Mutex::new(initial_pdf)))
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(path) = find_pdf_path(args) {
                if let Ok(payload) = read_pdf(&path) {
                    let _ = app.emit("open-pdf", payload);
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_initial_pdf,
            check_for_updates,
            download_and_install_update,
            open_pdf_defaults
        ])
        .run(tauri::generate_context!())
        .expect("error while running CrowShow");
}
