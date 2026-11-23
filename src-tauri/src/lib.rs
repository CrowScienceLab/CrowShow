mod hwp_cache;
mod hwp_conversion;
mod notebook_files;
mod store_updates;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{Emitter, LogicalSize, Manager, State, WebviewWindow};

const REPOSITORY: &str = "CrowScienceLab/CrowShow";
const RELEASE_API: &str = "https://api.github.com/repos/CrowScienceLab/CrowShow/releases/latest";
const MAX_INSTALLER_BYTES: usize = 350 * 1024 * 1024;
const MAX_RELEASE_BYTES: usize = 2 * 1024 * 1024;
const MAX_CHECKSUM_BYTES: usize = 64 * 1024;

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
    draft: bool,
    prerelease: bool,
    assets: Vec<ReleaseAsset>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckResult {
    status: String,
    version: Option<String>,
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

fn parse_release_version(tag: &str) -> Option<[u32; 3]> {
    let version = tag.strip_prefix(['v', 'V']).unwrap_or(tag);
    let mut parts = version.split('.');
    let number = |part: &str| {
        part.bytes()
            .all(|byte| byte.is_ascii_digit())
            .then(|| part.parse().ok())?
    };
    let major = number(parts.next()?)?;
    let minor = number(parts.next()?)?;
    let patch = match parts.next() {
        Some(part) => number(part)?,
        None => 0,
    };
    parts.next().is_none().then_some([major, minor, patch])
}

fn github_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("CrowShow/{}", env!("CARGO_PKG_VERSION")))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let url = attempt.url();
            if attempt.previous().len() <= 3
                && attempt.previous().first().and_then(reqwest::Url::host_str) == Some("github.com")
                && url.scheme() == "https"
                && url.port().is_none()
                && url.username().is_empty()
                && url.password().is_none()
                && matches!(
                    url.host_str(),
                    Some("release-assets.githubusercontent.com" | "objects.githubusercontent.com")
                )
            {
                attempt.follow()
            } else {
                attempt.error("Unexpected GitHub release redirect")
            }
        }))
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|error| error.to_string())
}

async fn read_github_body(
    mut response: reqwest::Response,
    limit: usize,
) -> Result<Vec<u8>, String> {
    response = response
        .error_for_status()
        .map_err(|error| error.to_string())?;
    if response
        .content_length()
        .is_some_and(|size| size > limit as u64)
    {
        return Err("업데이트 응답이 허용 크기를 초과했습니다.".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        if chunk.len() > limit - body.len() {
            return Err("업데이트 응답이 허용 크기를 초과했습니다.".into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

async fn latest_release(client: &reqwest::Client) -> Result<Option<GithubRelease>, String> {
    let response = client
        .get(RELEASE_API)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let release: GithubRelease =
        serde_json::from_slice(&read_github_body(response, MAX_RELEASE_BYTES).await?)
            .map_err(|error| error.to_string())?;
    Ok((!release.draft
        && !release.prerelease
        && parse_release_version(&release.tag_name).is_some())
    .then_some(release))
}

fn validate_release_asset(tag: &str, asset: &ReleaseAsset) -> bool {
    asset
        .name
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
        && asset.browser_download_url
            == format!(
                "https://github.com/{REPOSITORY}/releases/download/{tag}/{}",
                asset.name
            )
}

fn update_assets(release: &GithubRelease) -> Option<(&ReleaseAsset, &ReleaseAsset)> {
    let release_version = parse_release_version(&release.tag_name)?;
    let installer = release.assets.iter().find(|asset| {
        let name = asset.name.to_ascii_lowercase();
        name.strip_prefix("crowshow-v")
            .and_then(|version| version.strip_suffix("-setup-x64.exe"))
            .and_then(parse_release_version)
            == Some(release_version)
            && asset.size > 0
            && asset.size <= MAX_INSTALLER_BYTES
            && validate_release_asset(&release.tag_name, asset)
    });
    let eligible_checksums = release.assets.iter().filter(|asset| {
        asset.size > 0
            && asset.size <= MAX_CHECKSUM_BYTES
            && validate_release_asset(&release.tag_name, asset)
    });
    let checksums = eligible_checksums
        .clone()
        .find(|asset| asset.name.eq_ignore_ascii_case("SHA256SUMS.txt"))
        .or_else(|| {
            eligible_checksums.into_iter().find(|asset| {
                let name = asset.name.to_ascii_lowercase();
                name.starts_with("sha256sums-v") && name.ends_with(".txt")
            })
        });
    installer.zip(checksums)
}

#[tauri::command]
fn get_initial_pdf(state: State<'_, PendingPdf>) -> Result<Option<PdfPayload>, String> {
    let path = state.0.lock().map_err(|_| "PDF 상태 잠금 오류")?.take();
    path.map(|item| read_pdf(&item)).transpose()
}

#[tauri::command]
async fn check_for_updates() -> Result<UpdateCheckResult, String> {
    let current = env!("CARGO_PKG_VERSION");
    let result = |status: &str, version, error| UpdateCheckResult {
        status: status.into(),
        version,
        error,
    };
    if cfg!(feature = "microsoft-store") {
        return Ok(result("store", Some(current.into()), None));
    }
    let Some(release) = latest_release(&github_client()?).await? else {
        return Ok(result("no-release", None, None));
    };
    if parse_release_version(&release.tag_name) <= parse_release_version(current) {
        return Ok(result("current", Some(current.into()), None));
    }
    let version = release.tag_name.trim_start_matches(['v', 'V']).to_string();
    if update_assets(&release).is_some() {
        Ok(result("available", Some(version), None))
    } else {
        Ok(result(
            "error",
            Some(version),
            Some("검증 가능한 Windows 설치 파일이 없습니다.".into()),
        ))
    }
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
async fn download_and_install_update(app: tauri::AppHandle, version: String) -> Result<(), String> {
    if cfg!(feature = "microsoft-store") {
        return Err("Microsoft Store 설치본은 스토어에서 업데이트합니다.".into());
    }
    let client = github_client()?;
    let release = latest_release(&client)
        .await?
        .ok_or("정식 릴리스를 찾을 수 없습니다.")?;
    if release.tag_name.trim_start_matches(['v', 'V']) != version
        || parse_release_version(&release.tag_name)
            <= parse_release_version(env!("CARGO_PKG_VERSION"))
    {
        return Err("업데이트 버전이 변경됐습니다. 다시 확인하세요.".into());
    }
    let (asset, checksum) =
        update_assets(&release).ok_or("검증 가능한 Windows 설치 파일이 없습니다.")?;

    let download = |asset: &ReleaseAsset| client.get(&asset.browser_download_url).send();
    let response = download(checksum)
        .await
        .map_err(|error| error.to_string())?;
    let checksums = String::from_utf8(read_github_body(response, checksum.size).await?)
        .map_err(|error| error.to_string())?;
    let expected = expected_checksum(&checksums, &asset.name)?;
    let response = download(asset).await.map_err(|error| error.to_string())?;
    let installer = read_github_body(response, asset.size).await?;
    let actual = format!("{:x}", Sha256::digest(&installer));
    if installer.len() != asset.size || actual != expected {
        return Err("설치 파일 크기 또는 SHA-256 검증에 실패했습니다.".into());
    }

    let update_dir = tempfile::Builder::new()
        .prefix("CrowShow-update-")
        .tempdir()
        .map_err(|error| error.to_string())?;
    let installer_path = update_dir.path().join(&asset.name);
    let mut file = fs::File::create_new(&installer_path).map_err(|error| error.to_string())?;
    file.write_all(&installer)
        .map_err(|error| error.to_string())?;
    drop(file);
    Command::new(&installer_path)
        .spawn()
        .map_err(|error| error.to_string())?;
    let _ = update_dir.keep();
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_versions_and_checksums() {
        assert!(parse_release_version("v1.1.0") > parse_release_version("1.0.5"));
        assert_eq!(
            parse_release_version("v1.1"),
            parse_release_version("1.1.0")
        );
        assert!(parse_release_version("v1.1.0-rc.1").is_none());
        assert!(parse_release_version("v1.1.0.0").is_none());
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
    }

    #[test]
    fn selects_matching_official_release_assets() {
        let tag = "v1.6.0";
        let asset = |repository: &str, name: &str| ReleaseAsset {
            name: name.into(),
            browser_download_url: format!(
                "https://github.com/{repository}/releases/download/{tag}/{name}"
            ),
            size: 1024,
        };
        let mut release = GithubRelease {
            tag_name: tag.into(),
            draft: false,
            prerelease: false,
            assets: vec![
                asset(REPOSITORY, "CrowShow-v1.5-Setup-x64.exe"),
                asset(REPOSITORY, "CrowShow-v1.6-Setup-x64.exe"),
                asset(REPOSITORY, "SHA256SUMS.txt"),
            ],
        };
        assert_eq!(
            update_assets(&release).unwrap().0.name,
            "CrowShow-v1.6-Setup-x64.exe"
        );
        release.assets[1] = asset("Other/CrowShow", "CrowShow-v1.6-Setup-x64.exe");
        assert!(update_assets(&release).is_none());
    }
}

#[tauri::command]
fn resize_workspace_window(window: WebviewWindow, workspace: bool) -> Result<(), String> {
    if window.label() != "main" {
        return Ok(());
    }
    let resize = || -> tauri::Result<()> {
        let (mut width, mut height, min_width, min_height): (f64, f64, f64, f64) = if workspace {
            (1440.0, 900.0, 760.0, 520.0)
        } else {
            (548.0, 420.0, 480.0, 360.0)
        };
        if let Some(monitor) = window.current_monitor()? {
            let work = monitor
                .work_area()
                .size
                .to_logical::<f64>(monitor.scale_factor());
            // Tauri sizes the client area. Leave room for the Windows title bar and borders.
            width = width.min((work.width - 24.0).max(1.0));
            height = height.min((work.height - 48.0).max(1.0));
        }
        if window.is_maximized()? {
            window.unmaximize()?;
        }
        window.set_min_size(Some(LogicalSize::new(
            min_width.min(width),
            min_height.min(height),
        )))?;
        window.set_size(LogicalSize::new(width, height))?;
        window.center()
    };
    resize().map_err(|error| error.to_string())
}

#[tauri::command]
fn open_pdf_defaults() -> Result<(), String> {
    Command::new("explorer.exe")
        .arg("ms-settings:defaultapps")
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|error| error.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("HTTP(S) links only".into());
    }
    Command::new("rundll32.exe")
        .arg("url.dll,FileProtocolHandler")
        .arg(parsed.as_str())
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
            hwp_conversion::convert_hwp_to_pdf,
            hwp_conversion::clear_hwp_conversion_cache,
            get_initial_pdf,
            check_for_updates,
            store_updates::store_package_update,
            download_and_install_update,
            resize_workspace_window,
            open_pdf_defaults,
            open_external_url,
            notebook_files::notebook_storage_status,
            notebook_files::choose_notebook_drive_folder,
            notebook_files::save_notebook_file,
            notebook_files::open_notebook_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running CrowShow");
}
