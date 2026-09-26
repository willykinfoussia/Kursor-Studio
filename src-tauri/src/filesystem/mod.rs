pub mod watch;

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::{
    ffi::OsString,
    fs,
    path::{Component, Path, PathBuf},
};

pub const DEFAULT_EXCLUDED_DIRECTORIES: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    "build",
    "target",
    ".vscode",
    ".idea",
];

const BINARY_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "avif", "tif", "tiff",
    "mp4", "webm", "mov", "avi", "mkv", "wmv",
    "zip", "tar", "gz", "tgz", "7z", "rar", "bz2",
    "exe", "dll", "so", "dylib", "bin", "wasm", "o", "a", "lib", "obj", "class",
    "ttf", "otf", "woff", "woff2", "eot",
    "pdf", "wasm",
];

const MAX_TEXT_FILE_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension: Option<String>,
    pub is_directory: bool,
}

pub fn strip_verbatim(path: &Path) -> PathBuf {
    let value = path.to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = value.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path.to_path_buf()
    }
}

pub fn is_inside(root: &Path, candidate: &Path) -> bool {
    let root = strip_verbatim(root);
    let candidate = strip_verbatim(candidate);
    candidate.starts_with(root)
}

pub fn to_relative(root: &Path, path: &Path) -> AppResult<String> {
    let root = strip_verbatim(root);
    let path = strip_verbatim(path);
    path.strip_prefix(&root)
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        .map_err(|_| AppError::PathOutsideProject)
}

pub fn is_excluded_path(root: &Path, path: &Path) -> bool {
    let Ok(relative) = to_relative(root, path) else {
        return true;
    };
    relative
        .split('/')
        .any(|segment| DEFAULT_EXCLUDED_DIRECTORIES.contains(&segment))
}

pub fn resolve_within_root(root: &Path, requested: &str, must_exist: bool) -> AppResult<PathBuf> {
    let relative = Path::new(requested);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::Prefix(_) | Component::RootDir
            )
        })
    {
        return Err(AppError::PathOutsideProject);
    }

    let canonical_root = strip_verbatim(&root.canonicalize().map_err(|_| AppError::ProjectMissing)?);
    let candidate = if requested.is_empty() || requested == "." {
        canonical_root.clone()
    } else {
        canonical_root.join(relative)
    };

    if must_exist {
        let canonical_candidate = candidate
            .canonicalize()
            .map_err(|_| AppError::InvalidRequest("Unable to read file.".to_owned()))?;
        if !is_inside(&canonical_root, &canonical_candidate) {
            return Err(AppError::PathOutsideProject);
        }
        Ok(strip_verbatim(&canonical_candidate))
    } else {
        resolve_for_create(&canonical_root, &candidate)
    }
}

fn resolve_for_create(root: &Path, candidate: &Path) -> AppResult<PathBuf> {
    let mut current = candidate.to_path_buf();
    let mut missing: Vec<OsString> = Vec::new();
    while !current.exists() {
        let name = current
            .file_name()
            .ok_or(AppError::PathOutsideProject)?
            .to_os_string();
        missing.push(name);
        current = current
            .parent()
            .map(Path::to_path_buf)
            .ok_or(AppError::PathOutsideProject)?;
        if current != *root && !is_inside(root, &current) {
            return Err(AppError::PathOutsideProject);
        }
    }
    if current != *root && !is_inside(root, &current) {
        return Err(AppError::PathOutsideProject);
    }
    if current.is_file() && !missing.is_empty() {
        return Err(AppError::InvalidRequest("Unable to save file.".to_owned()));
    }
    let canonical = strip_verbatim(
        &current
            .canonicalize()
            .map_err(|_| AppError::PathOutsideProject)?,
    );
    if canonical != *root && !is_inside(root, &canonical) {
        return Err(AppError::PathOutsideProject);
    }
    let mut resolved = canonical;
    for name in missing.into_iter().rev() {
        resolved.push(name);
    }
    Ok(resolved)
}

fn ensure_parent_directory(path: &Path) -> AppResult<()> {
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    if parent.as_os_str().is_empty() {
        return Ok(());
    }
    fs::create_dir_all(parent).map_err(|_| AppError::WriteFailed)
}

pub fn list_directory(root: &Path, directory: &Path, show_excluded: bool) -> AppResult<Vec<FileEntry>> {
    let mut entries = fs::read_dir(directory)
        .map_err(|_| AppError::InvalidRequest("Unable to read file.".to_owned()))?
        .filter_map(Result::ok)
        .filter(|entry| {
            if show_excluded {
                return true;
            }
            let name = entry.file_name();
            !DEFAULT_EXCLUDED_DIRECTORIES.contains(&name.to_string_lossy().as_ref())
        })
        .collect::<Vec<_>>();

    entries.sort_by_key(|entry| {
        (
            !entry.path().is_dir(),
            entry.file_name().to_string_lossy().to_lowercase(),
        )
    });

    entries
        .into_iter()
        .map(|entry| {
            let path = entry.path();
            let is_directory = path.is_dir();
            let relative = to_relative(root, &path)?;
            let extension = if is_directory {
                None
            } else {
                path.extension()
                    .map(|value| value.to_string_lossy().to_ascii_lowercase())
            };
            Ok(FileEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: relative.clone(),
                relative_path: relative,
                kind: if is_directory { "directory" } else { "file" },
                extension,
                is_directory,
            })
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalkedFile {
    pub relative_path: String,
    pub size: u64,
    pub modified_at: i64,
}

const MAX_BINARY_FILE_BYTES: u64 = 20 * 1024 * 1024;

pub fn walk_files(root: &Path, show_excluded: bool) -> AppResult<Vec<WalkedFile>> {
    let mut files = Vec::new();
    let walker = walkdir::WalkDir::new(root).into_iter().filter_entry(|entry| {
        if entry.file_type().is_dir() {
            let name = entry.file_name().to_string_lossy();
            if name == ".kursor" {
                return true;
            }
            return show_excluded || !DEFAULT_EXCLUDED_DIRECTORIES.contains(&name.as_ref());
        }
        true
    });
    for entry in walker {
        let entry = entry.map_err(|_| AppError::InvalidRequest("Unable to read file.".to_owned()))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = to_relative(root, entry.path())?;
        if relative.is_empty() {
            continue;
        }
        if !show_excluded && is_excluded_path(root, entry.path()) {
            continue;
        }
        let metadata = fs::metadata(entry.path()).map_err(|_| AppError::ReadFailed)?;
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or(0);
        files.push(WalkedFile {
            relative_path: relative,
            size: metadata.len(),
            modified_at,
        });
    }
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

fn metadata_for_read(path: &Path) -> AppResult<fs::Metadata> {
    match fs::metadata(path) {
        Ok(metadata) => Ok(metadata),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Err(AppError::InvalidRequest("This file does not exist.".to_owned()))
        }
        Err(_) => Err(AppError::ReadFailed),
    }
}

fn read_file_bytes(path: &Path) -> AppResult<Vec<u8>> {
    match fs::read(path) {
        Ok(bytes) => Ok(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Err(AppError::InvalidRequest("This file does not exist.".to_owned()))
        }
        Err(_) => Err(AppError::ReadFailed),
    }
}

pub fn read_bytes_file(path: &Path) -> AppResult<Vec<u8>> {
    let metadata = metadata_for_read(path)?;
    if !metadata.is_file() {
        return Err(AppError::InvalidRequest("The requested path is not a file.".to_owned()));
    }
    if metadata.len() > MAX_BINARY_FILE_BYTES {
        return Err(AppError::FileTooLarge);
    }
    read_file_bytes(path)
}

pub fn search_files(root: &Path, query: &str, limit: usize) -> AppResult<Vec<FileEntry>> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Err(AppError::InvalidRequest("A search query is required.".to_owned()));
    }
    let mut matches = Vec::new();
    let walker = walkdir::WalkDir::new(root).into_iter().filter_entry(|entry| {
        if entry.file_type().is_dir() {
            let name = entry.file_name().to_string_lossy();
            return !DEFAULT_EXCLUDED_DIRECTORIES.contains(&name.as_ref());
        }
        true
    });
    for entry in walker {
        let entry = entry.map_err(|_| AppError::InvalidRequest("Unable to read file.".to_owned()))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let relative = to_relative(root, entry.path())?;
        let name = entry.file_name().to_string_lossy();
        if name.to_lowercase().contains(&needle) || relative.to_lowercase().contains(&needle) {
            let extension = entry
                .path()
                .extension()
                .map(|value| value.to_string_lossy().to_ascii_lowercase());
            matches.push(FileEntry {
                name: name.into_owned(),
                path: relative.clone(),
                relative_path: relative,
                kind: "file",
                extension,
                is_directory: false,
            });
            if matches.len() >= limit {
                break;
            }
        }
    }
    Ok(matches)
}

pub fn is_binary_extension(path: &Path) -> bool {
    path.extension()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .is_some_and(|ext| BINARY_EXTENSIONS.contains(&ext.as_str()))
}

pub fn read_text_file(path: &Path) -> AppResult<String> {
    if is_binary_extension(path) {
        return Err(AppError::BinaryFile);
    }
    let metadata = metadata_for_read(path)?;
    if !metadata.is_file() {
        return Err(AppError::InvalidRequest("The requested path is not a file.".to_owned()));
    }
    if metadata.len() > MAX_TEXT_FILE_BYTES {
        return Err(AppError::FileTooLarge);
    }
    let bytes = read_file_bytes(path)?;
    if bytes.iter().take(8192).any(|byte| *byte == 0) {
        return Err(AppError::BinaryFile);
    }
    String::from_utf8(bytes).map_err(|_| AppError::InvalidUtf8)
}

pub fn write_text_file(path: &Path, content: &str) -> AppResult<()> {
    if is_binary_extension(path) {
        return Err(AppError::BinaryFile);
    }
    ensure_parent_directory(path)?;
    fs::write(path, content).map_err(|_| AppError::WriteFailed)
}

pub fn create_file(path: &Path) -> AppResult<()> {
    ensure_parent_directory(path)?;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| AppError::InvalidRequest("Unable to create the file.".to_owned()))?;
    Ok(())
}

pub fn create_directory(path: &Path) -> AppResult<()> {
    fs::create_dir_all(path).map_err(|_| AppError::InvalidRequest("Unable to create the folder.".to_owned()))
}

pub fn rename_entry(from: &Path, to: &Path) -> AppResult<()> {
    if to.exists() {
        return Err(AppError::InvalidRequest(
            "A file or folder with that name already exists.".to_owned(),
        ));
    }
    fs::rename(from, to).map_err(|_| AppError::WriteFailed)
}

pub fn delete_entry(path: &Path) -> AppResult<()> {
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|_| AppError::WriteFailed)
    } else {
        fs::remove_file(path).map_err(|_| AppError::WriteFailed)
    }
}

pub fn detect_project_type(root: &Path) -> Option<&'static str> {
    let markers = [
        ("package.json", "Node"),
        ("pyproject.toml", "Python"),
        ("Cargo.toml", "Rust"),
        ("go.mod", "Go"),
        ("pom.xml", "Java"),
    ];
    markers
        .into_iter()
        .find(|(file, _)| root.join(file).is_file())
        .map(|(_, kind)| kind)
}

pub fn reveal_in_file_manager(path: &Path) -> AppResult<()> {
    let result = {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(format!("/select,{}", path.display()))
                .spawn()
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open").arg("-R").arg(path).spawn()
        }
        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            let parent = path.parent().unwrap_or(path);
            std::process::Command::new("xdg-open").arg(parent).spawn()
        }
    };
    result.map(|_| ()).map_err(|_| {
        AppError::InvalidRequest("Unable to open the system file manager.".to_owned())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_project() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().expect("temp dir");
        let root = dir.path().canonicalize().expect("canonicalize");
        fs::create_dir(root.join("src")).unwrap();
        fs::write(root.join("src").join("App.tsx"), "export default function App() {}").unwrap();
        fs::write(root.join("package.json"), "{}").unwrap();
        fs::create_dir(root.join("node_modules")).unwrap();
        fs::write(root.join("node_modules").join("pkg.js"), "").unwrap();
        (dir, strip_verbatim(&root))
    }

    #[test]
    fn rejects_parent_dir_traversal() {
        let (_guard, root) = temp_project();
        let err = resolve_within_root(&root, "../secret.txt", true).unwrap_err();
        assert!(matches!(err, AppError::PathOutsideProject));
        let err = resolve_within_root(&root, "../../secret.txt", true).unwrap_err();
        assert!(matches!(err, AppError::PathOutsideProject));
        let err = resolve_within_root(&root, "src/../../secret.txt", true).unwrap_err();
        assert!(matches!(err, AppError::PathOutsideProject));
    }

    #[test]
    fn rejects_absolute_path_outside_project() {
        let (_guard, root) = temp_project();
        let outside = if cfg!(windows) {
            r"C:\Windows\System32\drivers\etc\hosts"
        } else {
            "/etc/passwd"
        };
        let err = resolve_within_root(&root, outside, true).unwrap_err();
        assert!(matches!(err, AppError::PathOutsideProject));
    }

    #[test]
    fn lists_immediate_children_and_hides_excluded() {
        let (_guard, root) = temp_project();
        let entries = list_directory(&root, &root, false).unwrap();
        let names: Vec<_> = entries.iter().map(|entry| entry.name.as_str()).collect();
        assert!(names.contains(&"src"));
        assert!(names.contains(&"package.json"));
        assert!(!names.contains(&"node_modules"));
        let src = entries.iter().find(|entry| entry.name == "src").unwrap();
        assert_eq!(src.kind, "directory");
        assert_eq!(src.relative_path, "src");
    }

    #[test]
    fn read_write_create_rename_delete() {
        let (_guard, root) = temp_project();
        let file = resolve_within_root(&root, "src/New.tsx", false).unwrap();
        create_file(&file).unwrap();
        write_text_file(&file, "hello").unwrap();
        assert_eq!(read_text_file(&file).unwrap(), "hello");

        let renamed = resolve_within_root(&root, "src/Renamed.tsx", false).unwrap();
        rename_entry(&file, &renamed).unwrap();
        assert!(renamed.exists());
        delete_entry(&renamed).unwrap();
        assert!(!renamed.exists());

        let folder = resolve_within_root(&root, "src/lib", false).unwrap();
        create_directory(&folder).unwrap();
        assert!(folder.is_dir());
        delete_entry(&folder).unwrap();
    }

    #[test]
    fn rejects_binary_extension() {
        let (_guard, root) = temp_project();
        let png = root.join("icon.png");
        fs::write(&png, [0u8, 1, 2, 0]).unwrap();
        let err = read_text_file(&png).unwrap_err();
        assert!(matches!(err, AppError::BinaryFile));
    }

    #[test]
    fn search_files_skips_excluded_and_matches_name() {
        let (_guard, root) = temp_project();
        let matches = search_files(&root, "App", 50).unwrap();
        assert!(matches.iter().any(|entry| entry.relative_path == "src/App.tsx"));
        assert!(!matches.iter().any(|entry| entry.relative_path.contains("node_modules")));
    }

    #[test]
    fn walk_files_lists_project_files_and_skips_excluded() {
        let (_guard, root) = temp_project();
        let files = walk_files(&root, false).unwrap();
        assert!(files.iter().any(|entry| entry.relative_path == "src/App.tsx"));
        assert!(files.iter().any(|entry| entry.relative_path == "package.json"));
        assert!(!files.iter().any(|entry| entry.relative_path.contains("node_modules")));
    }

    #[test]
    fn missing_text_file_says_it_does_not_exist() {
        let (_guard, root) = temp_project();
        let err = read_text_file(&root.join("missing.ts")).unwrap_err();
        assert_eq!(err.to_string(), "This file does not exist.");
    }

    #[test]
    fn read_bytes_file_returns_contents() {
        let (_guard, root) = temp_project();
        let file = root.join("src").join("App.tsx");
        let bytes = read_bytes_file(&file).unwrap();
        assert!(!bytes.is_empty());
    }

    #[test]
    fn writes_nested_file_creating_missing_parents() {
        let (_guard, root) = temp_project();
        let file = resolve_within_root(&root, "boiss/client/src/App.jsx", false).unwrap();
        write_text_file(&file, "export default function App() {}").unwrap();
        assert_eq!(read_text_file(&file).unwrap(), "export default function App() {}");
        assert!(root.join("boiss").join("client").join("src").is_dir());
    }

    #[test]
    fn create_directory_is_recursive_and_idempotent() {
        let (_guard, root) = temp_project();
        let folder = resolve_within_root(&root, "a/b/c", false).unwrap();
        create_directory(&folder).unwrap();
        create_directory(&folder).unwrap();
        assert!(folder.is_dir());
        let nested = resolve_within_root(&root, "a/b/c/ok.txt", false).unwrap();
        create_file(&nested).unwrap();
        write_text_file(&nested, "ok").unwrap();
        assert_eq!(read_text_file(&nested).unwrap(), "ok");
    }
}
