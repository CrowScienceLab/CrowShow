use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

// Bump this namespace when changing the converter, its options or the response format.
pub const DIRECTORY: &str = "hwp-pdf-rhwp-0.9.1-column-layout-v2";
const MAX_CACHE_BYTES: u64 = 256 * 1024 * 1024;
const MAX_ENTRIES: usize = 32;
const MAX_IDLE: Duration = Duration::from_secs(7 * 24 * 60 * 60);
const DIGEST_BYTES: usize = 32;

pub fn path(directory: &Path, format: &str, source: &[u8]) -> PathBuf {
    let mut digest = Sha256::new();
    digest.update(format.as_bytes());
    digest.update([0]);
    if let Some(font_path) = std::env::var_os("RHWP_FONT_PATH") {
        digest.update(font_path.as_encoded_bytes());
    }
    digest.update([0]);
    digest.update(source);
    directory.join(format!("{:x}.cache", digest.finalize()))
}

pub fn read(path: &Path, max_pdf_bytes: u64) -> Option<Vec<u8>> {
    if !fs::symlink_metadata(path).ok()?.is_file() {
        return None;
    }
    let mut file = fs::File::open(path).ok()?;
    if file.metadata().ok()?.modified().ok()?.elapsed().ok()? > MAX_IDLE {
        return None;
    }
    let mut digest = [0; DIGEST_BYTES];
    file.read_exact(&mut digest).ok()?;
    let mut response = Vec::new();
    file.take(max_pdf_bytes + 2)
        .read_to_end(&mut response)
        .ok()?;
    if response.len() as u64 > max_pdf_bytes + 1
        || response.first() != Some(&0)
        || !response[1..].starts_with(b"%PDF-")
        || Sha256::digest(&response)[..] != digest
    {
        return None;
    }
    if let Ok(file) = fs::OpenOptions::new().write(true).open(path) {
        let _ = file.set_times(fs::FileTimes::new().set_modified(SystemTime::now()));
    }
    Some(response)
}

pub fn write(path: &Path, response: &[u8]) -> std::io::Result<()> {
    let directory = path.parent().expect("cache entry has a parent directory");
    fs::create_dir_all(directory)?;
    let mut temp = tempfile::NamedTempFile::new_in(directory)?;
    temp.write_all(&Sha256::digest(response))?;
    temp.write_all(response)?;
    temp.persist(path)?;
    prune(directory);
    Ok(())
}

fn entries(directory: &Path) -> std::io::Result<Vec<fs::DirEntry>> {
    let contents = match fs::read_dir(directory) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    Ok(contents
        .filter_map(Result::ok)
        .filter(|entry| {
            entry.file_type().is_ok_and(|kind| kind.is_file())
                && entry.file_name().to_str().is_some_and(|name| {
                    name.strip_suffix(".cache").is_some_and(|digest| {
                        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
                    })
                })
        })
        .collect())
}

fn prune(directory: &Path) {
    let Ok(entries) = entries(directory) else {
        return;
    };
    let mut entries: Vec<_> = entries
        .into_iter()
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            Some((metadata.modified().ok()?, metadata.len(), entry.path()))
        })
        .collect();
    entries.sort_unstable_by(|a, b| b.0.cmp(&a.0));
    let mut total = 0u64;
    for (index, (modified, size, path)) in entries.into_iter().enumerate() {
        total = total.saturating_add(size);
        if index >= MAX_ENTRIES
            || total > MAX_CACHE_BYTES
            || modified.elapsed().is_ok_and(|idle| idle > MAX_IDLE)
        {
            let _ = fs::remove_file(path);
        }
    }
}

pub fn clear(directory: &Path) -> std::io::Result<()> {
    for entry in entries(directory)? {
        fs::remove_file(entry.path())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_reuses_content_verifies_integrity_and_keeps_other_files() {
        let directory = tempfile::tempdir().unwrap();
        let first = path(directory.path(), "input.hwp", b"source");
        let changed = path(directory.path(), "input.hwp", b"changed");
        let other_format = path(directory.path(), "input.hwpx", b"source");
        assert_ne!(first, changed);
        assert_ne!(first, other_format);
        let response = b"\x00%PDF-test";
        write(&first, b"\x01%PDF-old-warning").unwrap();
        assert!(read(&first, 1024).is_none());
        write(&first, response).unwrap();
        assert_eq!(read(&first, 1024).as_deref(), Some(response.as_slice()));
        let mut entry = fs::read(&first).unwrap();
        *entry.last_mut().unwrap() ^= 1;
        fs::write(&first, entry).unwrap();
        assert!(read(&first, 1024).is_none());
        write(&first, response).unwrap();
        fs::write(directory.path().join("other"), b"leave this").unwrap();
        clear(directory.path()).unwrap();
        assert!(!first.exists());
        assert!(directory.path().join("other").exists());
    }
}
