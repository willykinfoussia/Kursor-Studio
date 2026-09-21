use crate::agent::events;
use crate::error::{AppError, AppResult};
use crate::filesystem::{walk_files, watch::ProjectWatcher, WalkedFile};
use crate::state::AppState;
use serde::Serialize;
use std::path::{Component, PathBuf};
use tauri::{AppHandle, State};

#[derive(Serialize)]
pub struct AppInfo {
    name: &'static str,
    version: &'static str,
    platform: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserDataEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: "Kursor",
        version: env!("KURSOR_VERSION"),
        platform: std::env::consts::OS,
    }
}

fn user_kind_root(kind: &str, state: &State<'_, AppState>) -> AppResult<PathBuf> {
    if kind != "skills" && kind != "rules" && kind != "specs" {
        return Err(AppError::InvalidRequest("Invalid user data path.".to_owned()));
    }
    let root = state.db.data_dir.join(kind);
    if kind == "specs" {
        let _ = std::fs::create_dir_all(root.join("account"));
    } else {
        let _ = std::fs::create_dir_all(&root);
    }
    Ok(root)
}

fn sanitize_relative(path: &str) -> AppResult<PathBuf> {
    let cleaned = path.replace('\\', "/");
    let relative = PathBuf::from(cleaned.trim_start_matches('/'));
    if relative.is_absolute()
        || relative.components().any(|component| matches!(component, Component::ParentDir))
    {
        return Err(AppError::InvalidRequest("Invalid user data path.".to_owned()));
    }
    Ok(relative)
}

fn resolved_user_path(kind: &str, relative_path: &str, state: &State<'_, AppState>) -> AppResult<PathBuf> {
    let root = user_kind_root(kind, state)?;
    let relative = sanitize_relative(relative_path)?;
    let path = root.join(relative);
    if !path.starts_with(&root) {
        return Err(AppError::InvalidRequest("Invalid user data path.".to_owned()));
    }
    Ok(path)
}

#[tauri::command]
pub fn user_data_list(kind: String, state: State<'_, AppState>) -> AppResult<Vec<UserDataEntry>> {
    let root = user_kind_root(&kind, &state)?;
    let _ = std::fs::create_dir_all(&root);
    let mut entries = Vec::new();
    let read = match std::fs::read_dir(&root) {
        Ok(read) => read,
        Err(_) => return Ok(entries),
    };
    for item in read.flatten() {
        let name = item.file_name().to_string_lossy().into_owned();
        let is_dir = item.path().is_dir();
        entries.push(UserDataEntry {
            name,
            path: format!("{kind}/{}", item.file_name().to_string_lossy()),
            kind: if is_dir { "directory".into() } else { "file".into() },
        });
    }
    entries.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(entries)
}

#[tauri::command]
pub fn user_data_walk(kind: String, state: State<'_, AppState>) -> AppResult<Vec<WalkedFile>> {
    let root = user_kind_root(&kind, &state)?;
    walk_files(&root, true)
}

#[tauri::command]
pub fn user_data_read(kind: String, relative_path: String, state: State<'_, AppState>) -> AppResult<String> {
    let path = resolved_user_path(&kind, &relative_path, &state)?;
    std::fs::read_to_string(&path).map_err(|_| {
        AppError::InvalidRequest("Unable to read the user skill or rule.".to_owned())
    })
}

#[tauri::command]
pub fn user_data_write(
    kind: String,
    relative_path: String,
    content: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let path = resolved_user_path(&kind, &relative_path, &state)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| AppError::WriteFailed)?;
    }
    std::fs::write(&path, content).map_err(|_| AppError::WriteFailed)
}

#[tauri::command]
pub fn user_data_create(kind: String, relative_path: String, state: State<'_, AppState>) -> AppResult<()> {
    let path = resolved_user_path(&kind, &relative_path, &state)?;
    if path.exists() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| AppError::WriteFailed)?;
    }
    std::fs::write(&path, "").map_err(|_| AppError::WriteFailed)
}

#[tauri::command]
pub fn user_data_delete(kind: String, relative_path: String, state: State<'_, AppState>) -> AppResult<()> {
    let path = resolved_user_path(&kind, &relative_path, &state)?;
    if path.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|_| AppError::WriteFailed)?;
    } else if path.exists() {
        std::fs::remove_file(&path).map_err(|_| AppError::WriteFailed)?;
    }
    Ok(())
}

#[tauri::command]
pub fn user_data_watch_specs(state: State<'_, AppState>, app: AppHandle) -> AppResult<()> {
    let root = user_kind_root("specs", &state)?;
    let mut watcher = state.specs_watcher.lock().map_err(|_| {
        AppError::InvalidRequest("Unable to watch account specs.".to_owned())
    })?;
    if watcher.is_some() {
        return Ok(());
    }
    *watcher = Some(ProjectWatcher::start_emitting(
        app,
        root,
        events::USER_SPECS_CHANGED,
        false,
    )?);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPackFile {
    pub relative_path: String,
    pub content: String,
}

const SKILL_PACK_SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "agents",
    "dist",
    "build",
    "target",
];
const SKILL_PACK_MAX_FILES: usize = 400;
const SKILL_PACK_MAX_BYTES: u64 = 256 * 1024;
const SKILL_PACK_MAX_DEPTH: usize = 8;

#[tauri::command]
pub fn skill_pack_read(path: String) -> AppResult<Vec<SkillPackFile>> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(AppError::InvalidRequest("Select a skill folder.".to_owned()));
    }
    let mut files = Vec::new();
    let walker = walkdir::WalkDir::new(&root)
        .max_depth(SKILL_PACK_MAX_DEPTH)
        .into_iter()
        .filter_entry(|entry| {
            if !entry.file_type().is_dir() {
                return true;
            }
            let name = entry.file_name().to_string_lossy();
            !SKILL_PACK_SKIP_DIRS.contains(&name.as_ref())
        });
    for entry in walker {
        let entry = entry.map_err(|_| AppError::InvalidRequest("Unable to read the skill folder.".to_owned()))?;
        if !entry.file_type().is_file() {
            continue;
        }
        if crate::filesystem::is_binary_extension(entry.path()) {
            continue;
        }
        let metadata = std::fs::metadata(entry.path()).map_err(|_| AppError::ReadFailed)?;
        if metadata.len() > SKILL_PACK_MAX_BYTES {
            continue;
        }
        let relative = crate::filesystem::to_relative(&root, entry.path())?;
        if relative.is_empty() {
            continue;
        }
        let content = match std::fs::read_to_string(entry.path()) {
            Ok(text) => text,
            Err(_) => continue,
        };
        files.push(SkillPackFile {
            relative_path: relative.replace('\\', "/"),
            content,
        });
        if files.len() >= SKILL_PACK_MAX_FILES {
            break;
        }
    }
    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}
