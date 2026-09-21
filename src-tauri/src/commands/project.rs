use crate::{
    database::records::ProjectRecord,
    error::{AppError, AppResult},
    filesystem::{
        create_directory, create_file, delete_entry, detect_project_type, list_directory,
        read_bytes_file, read_text_file, rename_entry, resolve_within_root, reveal_in_file_manager,
        search_files, walk_files, watch::ProjectWatcher, write_text_file, FileEntry, WalkedFile,
    },
    github,
    process,
    state::AppState,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, State};

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    pub name: String,
    pub root_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub github_owner: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub github_repo: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_branch: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_opened_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiff {
    path: Option<String>,
    diff: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitShowPath {
    path: String,
    content: Option<String>,
}

fn resolve_git_paths(root: &std::path::Path, paths: &[String]) -> AppResult<()> {
    for path in paths {
        if path.is_empty() || path == "." {
            continue;
        }
        resolve_within_root(root, path, false)?;
    }
    Ok(())
}

fn project_to_info(project: ProjectRecord, project_type: Option<String>, github: Option<&crate::database::records::ProjectGithubRepositoryRecord>) -> ProjectInfo {
    ProjectInfo {
        id: project.id,
        account_id: project.account_id,
        name: project.name,
        root_path: project.root_path,
        project_type,
        github_owner: github.and_then(|item| item.owner.clone()),
        github_repo: github.and_then(|item| item.name.clone()),
        default_branch: github.and_then(|item| item.default_branch.clone()),
        created_at: project.created_at,
        updated_at: project.updated_at,
        last_opened_at: project.last_opened_at,
    }
}

fn enrich_project(state: &State<'_, AppState>, project: ProjectRecord) -> ProjectInfo {
    let project_type = detect_project_type(&PathBuf::from(&project.root_path)).map(str::to_owned);
    let github = state.db.get_project_github(&project.id).ok().flatten();
    project_to_info(project, project_type, github.as_ref())
}

pub fn active_root(state: &State<'_, AppState>) -> AppResult<PathBuf> {
    let root = state
        .project_root
        .lock()
        .map_err(|_| AppError::InvalidRequest("Project state is unavailable.".to_owned()))?
        .clone()
        .ok_or(AppError::NoProject)?;
    if !root.is_dir() {
        return Err(AppError::ProjectMissing);
    }
    Ok(root)
}

#[tauri::command]
pub fn project_open(path: String, state: State<'_, AppState>, app: AppHandle) -> AppResult<ProjectInfo> {
    let root = PathBuf::from(&path)
        .canonicalize()
        .map_err(|_| AppError::ProjectMissing)?;
    if !root.is_dir() {
        return Err(AppError::InvalidRequest(
            "The selected project root is not a directory.".to_owned(),
        ));
    }
    let root = crate::filesystem::strip_verbatim(&root);
    *state
        .project_root
        .lock()
        .map_err(|_| AppError::InvalidRequest("Project state is unavailable.".to_owned()))? =
        Some(root.clone());

    if let Ok(watcher) = ProjectWatcher::start(app.clone(), root.clone()) {
        if let Ok(mut slot) = state.watcher.lock() {
            *slot = Some(watcher);
        }
    }

    let name = root
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Project".to_owned());
    let now = now_ms();
    let root_path = root.to_string_lossy().into_owned();
    let account_id = state.db.current_account().ok().map(|item| item.id);
    let existing = state.db.get_project_by_path(&root_path).ok().flatten();
    let record = if let Some(mut existing) = existing {
        existing.last_opened_at = Some(now);
        existing.updated_at = now;
        existing.name = name;
        state.db.upsert_project(&existing).unwrap_or(existing)
    } else {
        state.db.upsert_project(&ProjectRecord {
            id: uuid::Uuid::new_v4().to_string(),
            account_id: account_id.clone(),
            name,
            root_path,
            created_at: now,
            updated_at: now,
            last_opened_at: Some(now),
        })?
    };
    if let Some(account_id) = account_id {
        let _ = state.db.global_settings_set(&account_id, "last_opened_project_id", &record.id);
    }
    Ok(enrich_project(&state, record))
}

#[tauri::command]
pub fn project_list_recent(state: State<'_, AppState>) -> Vec<ProjectInfo> {
    state
        .db
        .list_recent_projects(12)
        .unwrap_or_default()
        .into_iter()
        .map(|project| enrich_project(&state, project))
        .collect()
}

#[tauri::command]
pub fn project_list(state: State<'_, AppState>) -> Vec<ProjectInfo> {
    let account_id = state.db.current_account().ok().map(|item| item.id);
    state
        .db
        .list_projects(account_id.as_deref())
        .unwrap_or_default()
        .into_iter()
        .map(|project| enrich_project(&state, project))
        .collect()
}

#[tauri::command]
pub fn project_remove(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.db.delete_project_github(&id)?;
    state.db.delete_project_metadata(&id)
}

#[tauri::command]
pub fn project_git_remotes(state: State<'_, AppState>) -> AppResult<Vec<process::GitRemote>> {
    process::git_remotes(&active_root(&state)?)
}

#[tauri::command]
pub fn project_git_init(state: State<'_, AppState>) -> AppResult<()> {
    process::git_init(&active_root(&state)?)
}

#[tauri::command]
pub fn project_git_add_remote(name: String, url: String, state: State<'_, AppState>) -> AppResult<()> {
    process::git_add_remote(&active_root(&state)?, &name, &url)
}

#[tauri::command]
pub fn project_git_clone(url: String, dest: String, state: State<'_, AppState>) -> AppResult<()> {
    let token = github_token(&state);
    process::git_clone(&url, &PathBuf::from(dest), token.as_deref())
}

#[tauri::command]
pub fn project_create_folder(path: String) -> AppResult<()> {
    std::fs::create_dir_all(&path)?;
    Ok(())
}

#[tauri::command]
pub fn project_list_files(
    path: String,
    show_excluded: Option<bool>,
    state: State<'_, AppState>,
) -> AppResult<Vec<FileEntry>> {
    let root = active_root(&state)?;
    let directory = resolve_within_root(&root, &path, true)?;
    if !directory.is_dir() {
        return Err(AppError::InvalidRequest(
            "The requested path is not a directory.".to_owned(),
        ));
    }
    list_directory(&root, &directory, show_excluded.unwrap_or(false))
}

#[tauri::command]
pub fn project_read_file(path: String, state: State<'_, AppState>) -> AppResult<String> {
    let root = active_root(&state)?;
    let file = resolve_within_root(&root, &path, true)?;
    if !file.is_file() {
        return Err(AppError::InvalidRequest(
            "The requested path is not a file.".to_owned(),
        ));
    }
    read_text_file(&file)
}

#[tauri::command]
pub fn project_write_file(
    path: String,
    content: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let root = active_root(&state)?;
    let file = resolve_within_root(&root, &path, false)?;
    write_text_file(&file, &content)
}

#[tauri::command]
pub fn project_create_file(path: String, state: State<'_, AppState>) -> AppResult<()> {
    let root = active_root(&state)?;
    let file = resolve_within_root(&root, &path, false)?;
    create_file(&file)
}

#[tauri::command]
pub fn project_create_directory(path: String, state: State<'_, AppState>) -> AppResult<()> {
    let root = active_root(&state)?;
    let directory = resolve_within_root(&root, &path, false)?;
    create_directory(&directory)
}

#[tauri::command]
pub fn project_rename(
    path: String,
    new_path: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let root = active_root(&state)?;
    let from = resolve_within_root(&root, &path, true)?;
    let to = resolve_within_root(&root, &new_path, false)?;
    rename_entry(&from, &to)
}

#[tauri::command]
pub fn project_delete(path: String, state: State<'_, AppState>) -> AppResult<()> {
    let root = active_root(&state)?;
    let target = resolve_within_root(&root, &path, true)?;
    delete_entry(&target)
}

#[tauri::command]
pub fn project_reveal(path: String, state: State<'_, AppState>) -> AppResult<()> {
    let root = active_root(&state)?;
    let target = resolve_within_root(&root, &path, true)?;
    reveal_in_file_manager(&target)
}

#[tauri::command]
pub fn project_detect_type(state: State<'_, AppState>) -> AppResult<Option<String>> {
    let root = active_root(&state)?;
    Ok(detect_project_type(&root).map(str::to_owned))
}

#[tauri::command]
pub fn project_search_files(
    query: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<FileEntry>> {
    let root = active_root(&state)?;
    search_files(&root, &query, 50)
}

#[tauri::command]
pub fn project_walk_files(
    show_excluded: Option<bool>,
    state: State<'_, AppState>,
) -> AppResult<Vec<WalkedFile>> {
    let root = active_root(&state)?;
    walk_files(&root, show_excluded.unwrap_or(false))
}

#[tauri::command]
pub fn project_read_bytes(path: String, state: State<'_, AppState>) -> AppResult<String> {
    let root = active_root(&state)?;
    let file = resolve_within_root(&root, &path, true)?;
    if !file.is_file() {
        return Err(AppError::InvalidRequest(
            "The requested path is not a file.".to_owned(),
        ));
    }
    let bytes = read_bytes_file(&file)?;
    Ok(STANDARD.encode(bytes))
}

#[tauri::command]
pub fn project_git_status(state: State<'_, AppState>) -> AppResult<process::GitStatus> {
    let root = active_root(&state)?;
    process::git_status(&root)
}

#[tauri::command]
pub fn project_git_diff(path: Option<String>, state: State<'_, AppState>) -> AppResult<GitDiff> {
    let root = active_root(&state)?;
    if let Some(relative) = path.as_deref() {
        if !relative.is_empty() && relative != "." {
            resolve_within_root(&root, relative, false)?;
        }
    }
    Ok(GitDiff {
        path: path.clone(),
        diff: process::git_diff(&root, path.as_deref())?,
    })
}

#[tauri::command]
pub fn project_git_is_repo(state: State<'_, AppState>) -> AppResult<bool> {
    let root = active_root(&state)?;
    Ok(process::git_is_repo(&root))
}

#[tauri::command]
pub fn project_git_stash_create(state: State<'_, AppState>) -> AppResult<String> {
    let root = active_root(&state)?;
    process::git_stash_create(&root)
}

#[tauri::command]
pub fn project_git_show_path(
    sha: String,
    path: String,
    state: State<'_, AppState>,
) -> AppResult<GitShowPath> {
    let root = active_root(&state)?;
    resolve_within_root(&root, &path, false)?;
    Ok(GitShowPath {
        path: path.clone(),
        content: process::git_show_path(&root, &sha, &path)?,
    })
}

#[tauri::command]
pub fn project_git_restore_paths(
    sha: String,
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let root = active_root(&state)?;
    for path in &paths {
        resolve_within_root(&root, path, false)?;
    }
    process::git_restore_paths(&root, &sha, &paths)
}

fn github_token(state: &State<'_, AppState>) -> Option<String> {
    github::access_token(&state.secrets).ok().flatten()
}

fn git_commit_identity(state: &State<'_, AppState>) -> Option<process::GitIdentity> {
    let user = github::current_user(&state.secrets).ok().flatten()?;
    let login = user.login;
    let name = user
        .name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| login.clone());
    let email = user
        .email
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("{}+{}@users.noreply.github.com", user.id, login));
    Some(process::GitIdentity { name, email })
}

#[tauri::command]
pub fn project_git_add(state: State<'_, AppState>) -> AppResult<()> {
    process::git_add_all(&active_root(&state)?)
}

#[tauri::command]
pub fn project_git_commit(message: String, state: State<'_, AppState>) -> AppResult<()> {
    process::git_commit(&active_root(&state)?, &message, git_commit_identity(&state).as_ref())
}

#[tauri::command]
pub fn project_git_push(state: State<'_, AppState>) -> AppResult<()> {
    let token = github_token(&state);
    process::git_push(&active_root(&state)?, token.as_deref())
}

#[tauri::command]
pub fn project_git_pull(state: State<'_, AppState>) -> AppResult<()> {
    let token = github_token(&state);
    process::git_pull(&active_root(&state)?, token.as_deref())
}

#[tauri::command]
pub fn project_git_fetch(state: State<'_, AppState>) -> AppResult<()> {
    let token = github_token(&state);
    process::git_fetch(&active_root(&state)?, token.as_deref())
}

#[tauri::command]
pub fn project_git_branch_list(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    process::git_branch_list(&active_root(&state)?)
}

#[tauri::command]
pub fn project_git_checkout(branch: String, state: State<'_, AppState>) -> AppResult<()> {
    process::git_checkout(&active_root(&state)?, &branch)
}

#[tauri::command]
pub fn project_git_create_branch(branch: String, start: Option<String>, state: State<'_, AppState>) -> AppResult<()> {
    process::git_create_branch(&active_root(&state)?, &branch, start.as_deref())
}

#[tauri::command]
pub fn project_git_has_commits(state: State<'_, AppState>) -> AppResult<bool> {
    Ok(process::git_has_commits(&active_root(&state)?))
}

#[tauri::command]
pub fn project_git_diff_at(
    path: Option<String>,
    staged: Option<bool>,
    from: Option<String>,
    to: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<GitDiff> {
    let root = active_root(&state)?;
    if let Some(relative) = path.as_deref() {
        if !relative.is_empty() && relative != "." {
            resolve_within_root(&root, relative, false)?;
        }
    }
    Ok(GitDiff {
        path: path.clone(),
        diff: process::git_diff_at(
            &root,
            path.as_deref(),
            staged.unwrap_or(false),
            from.as_deref(),
            to.as_deref(),
        )?,
    })
}

#[tauri::command]
pub fn project_git_file_contents(
    path: String,
    staged: Option<bool>,
    from: Option<String>,
    to: Option<String>,
    force: Option<bool>,
    state: State<'_, AppState>,
) -> AppResult<process::GitFileContents> {
    let root = active_root(&state)?;
    resolve_within_root(&root, &path, false)?;
    process::git_file_contents(
        &root,
        &path,
        staged.unwrap_or(false),
        from.as_deref(),
        to.as_deref(),
        force.unwrap_or(false),
    )
}

#[tauri::command]
pub fn project_git_add_paths(paths: Vec<String>, state: State<'_, AppState>) -> AppResult<()> {
    let root = active_root(&state)?;
    resolve_git_paths(&root, &paths)?;
    process::git_add_paths(&root, &paths)
}

#[tauri::command]
pub fn project_git_unstage_paths(paths: Vec<String>, state: State<'_, AppState>) -> AppResult<()> {
    let root = active_root(&state)?;
    resolve_git_paths(&root, &paths)?;
    process::git_unstage_paths(&root, &paths)
}

#[tauri::command]
pub fn project_git_discard_paths(paths: Vec<String>, state: State<'_, AppState>) -> AppResult<()> {
    let root = active_root(&state)?;
    resolve_git_paths(&root, &paths)?;
    process::git_discard_paths(&root, &paths)
}

#[tauri::command]
pub fn project_git_apply_patch(
    patch: String,
    cached: Option<bool>,
    reverse: Option<bool>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    process::git_apply_patch(
        &active_root(&state)?,
        &patch,
        cached.unwrap_or(false),
        reverse.unwrap_or(false),
    )
}

#[tauri::command]
pub fn project_git_log(
    skip: Option<i64>,
    limit: Option<i64>,
    all: Option<bool>,
    state: State<'_, AppState>,
) -> AppResult<process::GitLogPage> {
    process::git_log(
        &active_root(&state)?,
        skip.unwrap_or(0),
        limit.unwrap_or(200),
        all.unwrap_or(false),
    )
}

#[tauri::command]
pub fn project_git_commit_detail(sha: String, state: State<'_, AppState>) -> AppResult<process::GitCommitDetail> {
    process::git_commit_detail(&active_root(&state)?, &sha)
}

#[tauri::command]
pub fn project_git_branch_details(state: State<'_, AppState>) -> AppResult<Vec<process::GitBranchInfo>> {
    process::git_branch_details(&active_root(&state)?)
}

#[tauri::command]
pub fn project_git_delete_branch(branch: String, force: Option<bool>, state: State<'_, AppState>) -> AppResult<()> {
    process::git_delete_branch(&active_root(&state)?, &branch, force.unwrap_or(false))
}

#[tauri::command]
pub fn project_git_merge(branch: String, state: State<'_, AppState>) -> AppResult<process::GitMergeResult> {
    process::git_merge(&active_root(&state)?, &branch)
}

#[tauri::command]
pub fn project_git_merge_continue(state: State<'_, AppState>) -> AppResult<process::GitMergeResult> {
    process::git_merge_continue(&active_root(&state)?)
}

#[tauri::command]
pub fn project_git_merge_abort(state: State<'_, AppState>) -> AppResult<()> {
    process::git_merge_abort(&active_root(&state)?)
}

#[tauri::command]
pub fn project_git_rebase(branch: String, state: State<'_, AppState>) -> AppResult<()> {
    process::git_rebase(&active_root(&state)?, &branch)
}

#[tauri::command]
pub fn project_git_cherry_pick(sha: String, state: State<'_, AppState>) -> AppResult<()> {
    process::git_cherry_pick(&active_root(&state)?, &sha)
}

#[tauri::command]
pub fn project_git_revert(sha: String, state: State<'_, AppState>) -> AppResult<()> {
    process::git_revert(&active_root(&state)?, &sha)
}

#[tauri::command]
pub fn project_git_reset(sha: String, mode: Option<String>, state: State<'_, AppState>) -> AppResult<()> {
    process::git_reset(&active_root(&state)?, &sha, mode.as_deref().unwrap_or("mixed"))
}

#[tauri::command]
pub fn project_git_drop_commit(sha: String, state: State<'_, AppState>) -> AppResult<()> {
    process::git_drop_commit(&active_root(&state)?, &sha)
}

#[tauri::command]
pub fn project_git_compare(from: String, to: String, state: State<'_, AppState>) -> AppResult<process::GitCompare> {
    process::git_compare(&active_root(&state)?, &from, &to)
}

#[tauri::command]
pub fn project_git_last_fetch(state: State<'_, AppState>) -> AppResult<Option<i64>> {
    Ok(process::git_last_fetch(&active_root(&state)?))
}
