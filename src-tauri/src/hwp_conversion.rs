use crate::hwp_cache;
use std::{
    fs,
    io::{Read, Write},
    path::Path,
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{
    AppHandle, Manager,
    ipc::{InvokeBody, Request, Response},
    path::BaseDirectory,
};

const MAX_INPUT_BYTES: usize = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES: u64 = 128 * 1024 * 1024;
const MAX_LAYOUT_REPORT_BYTES: u64 = 4 * 1024 * 1024;
const CONVERSION_TIMEOUT: Duration = Duration::from_secs(60);
const CONVERSION_FAILED: &str =
    "한글 문서를 PDF로 변환할 수 없습니다. 문서 손상 또는 암호 보호 여부를 확인해 주세요.";
const CONVERTER_MISSING: &str = "rhwp 변환기를 찾을 수 없습니다. CrowShow 설치를 확인해 주세요.";
const TEMP_FILE_ERROR: &str = "문서를 변환할 임시 파일에 접근할 수 없습니다.";
static CONVERSION: Mutex<()> = Mutex::new(());

// The first byte of the binary IPC response precedes the unmodified PDF.
#[repr(u8)]
enum LayoutCheck {
    Passed = 0,
    Overlap = 1,
    Unavailable = 2,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LayoutReport {
    overlap_count: u32,
    text_overlap_count: u32,
    stored_line_escape_count: u32,
}

fn layout_check(report: &[u8]) -> LayoutCheck {
    match serde_json::from_slice::<LayoutReport>(report) {
        Ok(report)
            if report.overlap_count > 0
                || report.text_overlap_count > 0
                || report.stored_line_escape_count > 0 =>
        {
            LayoutCheck::Overlap
        }
        Ok(_) => LayoutCheck::Passed,
        Err(_) => LayoutCheck::Unavailable,
    }
}

enum DocumentFormat {
    Hwp,
    Hwpx,
}

impl DocumentFormat {
    fn parse(format: Option<&str>, bytes: &[u8]) -> Result<Self, &'static str> {
        match format {
            Some("hwp") if bytes.starts_with(b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1") => Ok(Self::Hwp),
            Some("hwpx") if bytes.starts_with(b"PK\x03\x04") => Ok(Self::Hwpx),
            _ => Err("파일 형식이 확장자와 일치하지 않거나 문서가 손상되었습니다."),
        }
    }

    fn input_name(&self) -> &'static str {
        match self {
            Self::Hwp => "input.hwp",
            Self::Hwpx => "input.hwpx",
        }
    }
}

fn rhwp_command(executable: &Path, work_dir: &Path) -> Command {
    let mut command = Command::new(executable);
    command
        .env("RHWP_WEBFONT_OFFLINE", "1")
        .current_dir(work_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    command
}

fn run_rhwp(
    command: &mut Command,
    output: &Path,
    max_bytes: u64,
    deadline: Instant,
) -> Result<(), &'static str> {
    if Instant::now() >= deadline {
        return Err("문서 변환 제한 시간(60초)을 초과했습니다.");
    }
    let mut child = command.spawn().map_err(|_| CONVERTER_MISSING)?;
    loop {
        let result = match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(_)) | Err(_) => CONVERSION_FAILED,
            Ok(None) if Instant::now() >= deadline => "문서 변환 제한 시간(60초)을 초과했습니다.",
            Ok(None) if fs::metadata(output).is_ok_and(|info| info.len() > max_bytes) => {
                "변환 결과가 크기 제한을 초과했습니다."
            }
            Ok(None) => {
                thread::sleep(Duration::from_millis(50));
                continue;
            }
        };
        let _ = child.kill();
        let _ = child.wait();
        return Err(result);
    }
}

fn inspect_layout(
    executable: &Path,
    input: &Path,
    work_dir: &Path,
    deadline: Instant,
) -> LayoutCheck {
    let output = work_dir.join("layout.json");
    let Ok(file) = fs::File::create_new(&output) else {
        return LayoutCheck::Unavailable;
    };
    let mut command = rhwp_command(executable, work_dir);
    command
        .arg("layout-anomaly")
        .arg(input)
        .arg("--json")
        .stdout(file);
    if run_rhwp(&mut command, &output, MAX_LAYOUT_REPORT_BYTES, deadline).is_err() {
        return LayoutCheck::Unavailable;
    }
    let mut report = Vec::new();
    match fs::File::open(output).and_then(|file| {
        file.take(MAX_LAYOUT_REPORT_BYTES + 1)
            .read_to_end(&mut report)
    }) {
        Ok(size) if size as u64 <= MAX_LAYOUT_REPORT_BYTES => layout_check(&report),
        _ => LayoutCheck::Unavailable,
    }
}

fn convert(
    executable: &Path,
    cache_directory: Option<&Path>,
    format: DocumentFormat,
    bytes: &[u8],
    refresh: bool,
) -> Result<Vec<u8>, &'static str> {
    let _conversion = CONVERSION
        .try_lock()
        .map_err(|_| "다른 한글 문서를 변환 중입니다. 끝난 뒤 다시 열어 주세요.")?;
    let cache_entry = cache_directory.map(|dir| hwp_cache::path(dir, format.input_name(), bytes));
    if !refresh
        && let Some(response) = cache_entry
            .as_deref()
            .and_then(|path| hwp_cache::read(path, MAX_OUTPUT_BYTES))
    {
        return Ok(response);
    }
    let work_dir = tempfile::Builder::new()
        .prefix("crowshow-rhwp-")
        .tempdir()
        .map_err(|_| TEMP_FILE_ERROR)?;
    let input = work_dir.path().join(format.input_name());
    let output = work_dir.path().join("converted.pdf");
    fs::File::create_new(&input)
        .and_then(|mut file| file.write_all(bytes))
        .map_err(|_| TEMP_FILE_ERROR)?;

    let deadline = Instant::now() + CONVERSION_TIMEOUT;
    let mut command = rhwp_command(executable, work_dir.path());
    command.arg("export-pdf").arg(&input).arg("-o").arg(&output);
    run_rhwp(&mut command, &output, MAX_OUTPUT_BYTES, deadline)?;

    let file = fs::File::open(output).map_err(|_| CONVERSION_FAILED)?;
    let mut response = vec![LayoutCheck::Unavailable as u8];
    file.take(MAX_OUTPUT_BYTES + 1)
        .read_to_end(&mut response)
        .map_err(|_| CONVERSION_FAILED)?;
    let pdf = &response[1..];
    if pdf.len() as u64 > MAX_OUTPUT_BYTES {
        return Err("변환된 PDF가 크기 제한(128 MB)을 초과했습니다.");
    }
    if !pdf.starts_with(b"%PDF-") {
        return Err(CONVERSION_FAILED);
    }
    response[0] = inspect_layout(executable, &input, work_dir.path(), deadline) as u8;
    if let Some(path) = cache_entry {
        if response[0] == LayoutCheck::Passed as u8 {
            let _ = hwp_cache::write(&path, &response);
        } else {
            let _ = fs::remove_file(path);
        }
    }
    Ok(response)
}

fn cache_directory(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_cache_dir()
        .ok()
        .map(|dir| dir.join(hwp_cache::DIRECTORY))
}

#[tauri::command]
pub async fn clear_hwp_conversion_cache(app: AppHandle) -> Result<(), String> {
    let directory = cache_directory(&app).ok_or("변환 캐시 위치를 확인할 수 없습니다.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _conversion = CONVERSION
            .try_lock()
            .map_err(|_| "문서 변환이 끝난 뒤 캐시를 비워 주세요.")?;
        hwp_cache::clear(&directory).map_err(|_| "변환 캐시를 비우지 못했습니다.")
    })
    .await
    .map_err(|_| "변환 캐시를 비우지 못했습니다.")??;
    Ok(())
}

#[tauri::command]
pub async fn convert_hwp_to_pdf(app: AppHandle, request: Request<'_>) -> Result<Response, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(CONVERSION_FAILED.into());
    };
    if bytes.len() > MAX_INPUT_BYTES {
        return Err("한글 문서는 64 MB까지 열 수 있습니다.".into());
    }
    let format = DocumentFormat::parse(
        request
            .headers()
            .get("x-crowshow-document-format")
            .and_then(|value| value.to_str().ok()),
        bytes,
    )?;
    let executable = app
        .path()
        .resolve("rhwp/rhwp.exe", BaseDirectory::Resource)
        .map_err(|_| CONVERTER_MISSING)?;
    let bytes = bytes.clone();
    let refresh = request
        .headers()
        .get("x-crowshow-refresh")
        .is_some_and(|value| value == "1");
    let directory = cache_directory(&app);
    let pdf = tauri::async_runtime::spawn_blocking(move || {
        convert(&executable, directory.as_deref(), format, &bytes, refresh)
    })
    .await
    .map_err(|_| CONVERSION_FAILED)??;
    Ok(Response::new(pdf))
}

#[cfg(test)]
mod tests {
    use super::{LayoutCheck, layout_check};

    #[test]
    fn layout_warning_distinguishes_overlap_from_margin_overshoot() {
        for counts in [(9, 12, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1), (0, 0, 0)] {
            let (overlap, text_overlap, escaped_lines) = counts;
            let report = serde_json::json!({
                "overlapCount": overlap,
                "textOverlapCount": text_overlap,
                "storedLineEscapeCount": escaped_lines,
                "overflowCount": 1
            });
            let expected = if counts == (0, 0, 0) {
                LayoutCheck::Passed
            } else {
                LayoutCheck::Overlap
            };
            assert_eq!(
                layout_check(report.to_string().as_bytes()) as u8,
                expected as u8
            );
        }
        assert!(matches!(layout_check(b"{}"), LayoutCheck::Unavailable));
    }
}
