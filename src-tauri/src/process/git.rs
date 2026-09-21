use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::Path,
    process::{Command, Stdio},
    sync::Mutex,
    time::UNIX_EPOCH,
};

use super::filtered_env;

static GIT_PROGRAM: Mutex<Option<String>> = Mutex::new(None);

const MAX_DIFF_BYTES: u64 = 1_000_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemote {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileChange {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_path: Option<String>,
    pub index: String,
    pub worktree: String,
    pub kind: String,
    pub additions: i64,
    pub deletions: i64,
    pub staged: bool,
    pub unstaged: bool,
    pub binary: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    pub changed_files: Vec<String>,
    pub clean: bool,
    pub ahead: i64,
    pub behind: i64,
    pub staged_files: i64,
    pub files: Vec<GitFileChange>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchInfo {
    pub name: String,
    #[serde(rename = "ref")]
    pub r#ref: String,
    pub sha: String,
    pub current: bool,
    pub remote: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream: Option<String>,
    pub kind: String,
    pub timestamp: i64,
    pub subject: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitInfo {
    pub sha: String,
    pub short_sha: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub subject: String,
    pub body: String,
    pub refs: Vec<String>,
    pub insertions: i64,
    pub deletions: i64,
    pub files_changed: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogPage {
    pub commits: Vec<GitCommitInfo>,
    pub has_more: bool,
    pub skip: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCompare {
    pub ahead: i64,
    pub behind: i64,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileContents {
    pub path: String,
    pub original: Option<String>,
    pub modified: Option<String>,
    pub binary: bool,
    pub too_large: bool,
    pub size: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitFile {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_path: Option<String>,
    pub kind: String,
    pub additions: i64,
    pub deletions: i64,
    pub binary: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitDetail {
    pub commit: GitCommitInfo,
    pub files: Vec<GitCommitFile>,
}

#[derive(Debug, Clone)]
pub struct GitIdentity {
    pub name: String,
    pub email: String,
}

pub fn git_status(cwd: &Path) -> AppResult<GitStatus> {
    let output = git_output(cwd, &["status", "--porcelain=v1", "-b"])?;
    let mut status = parse_git_status(&output)?;
    let unstaged = parse_numstat(&git_output(cwd, &["diff", "--numstat"]).unwrap_or_default());
    let staged = parse_numstat(&git_output(cwd, &["diff", "--cached", "--numstat"]).unwrap_or_default());
    for file in &mut status.files {
        let staged_stat = staged.get(&file.path).copied();
        let unstaged_stat = unstaged.get(&file.path).copied();
        let (additions, deletions, binary) = merge_stats(staged_stat, unstaged_stat);
        file.additions = additions;
        file.deletions = deletions;
        file.binary = binary;
    }
    let has_upstream = porcelain_has_upstream(&output);
    let origin = git_remotes(cwd)
        .ok()
        .into_iter()
        .flatten()
        .any(|remote| remote.name == "origin");
    let local_commits = if git_has_commits(cwd) {
        git_output(cwd, &["rev-list", "--count", "HEAD"])
            .ok()
            .and_then(|value| value.trim().parse().ok())
            .unwrap_or(0)
    } else {
        0
    };
    status.ahead = effective_ahead(status.ahead, has_upstream, origin, local_commits);
    Ok(status)
}

pub fn git_diff(cwd: &Path, path: Option<&str>) -> AppResult<String> {
    git_diff_at(cwd, path, false, None, None)
}

pub fn git_diff_at(
    cwd: &Path,
    path: Option<&str>,
    staged: bool,
    from: Option<&str>,
    to: Option<&str>,
) -> AppResult<String> {
    let mut args: Vec<String> = vec!["diff".into(), "--no-color".into()];
    if staged {
        args.push("--cached".into());
    }
    if let Some(left) = from.filter(|value| !value.is_empty()) {
        args.push(left.to_owned());
        if let Some(right) = to.filter(|value| !value.is_empty()) {
            args.push(right.to_owned());
        }
    }
    if let Some(value) = path.filter(|value| !value.is_empty() && *value != ".") {
        args.push("--".into());
        args.push(value.replace('\\', "/"));
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    git_output(cwd, &refs)
}

pub fn git_file_contents(
    cwd: &Path,
    path: &str,
    staged: bool,
    from: Option<&str>,
    to: Option<&str>,
    force: bool,
) -> AppResult<GitFileContents> {
    let relative = path.replace('\\', "/");
    let worktree = cwd.join(&relative);
    let worktree_size = fs::metadata(&worktree).map(|meta| meta.len()).unwrap_or(0);
    let too_large = worktree_size > MAX_DIFF_BYTES && !force;
    let (original_rev, modified_rev, read_worktree) = if let Some(left) = from.filter(|value| !value.is_empty()) {
        (Some(left.to_owned()), to.filter(|value| !value.is_empty()).map(str::to_owned), false)
    } else if staged {
        (Some("HEAD".to_owned()), Some(":".to_owned()), false)
    } else {
        (Some(":".to_owned()), None, true)
    };

    let original = match original_rev.as_deref() {
        Some(":") => git_show_path(cwd, ":", &relative)?,
        Some(rev) => git_show_path(cwd, rev, &relative)?,
        None => None,
    };
    let modified = if read_worktree {
        if too_large {
            None
        } else {
            read_worktree_text(&worktree)
        }
    } else {
        match modified_rev.as_deref() {
            Some(":") => git_show_path(cwd, ":", &relative)?,
            Some(rev) => git_show_path(cwd, rev, &relative)?,
            None => None,
        }
    };

    let original_binary = original.as_ref().is_some_and(|value| is_binary(value.as_bytes()));
    let modified_binary = if read_worktree && worktree.is_file() {
        fs::read(&worktree).ok().is_some_and(|bytes| is_binary(&bytes))
    } else {
        modified.as_ref().is_some_and(|value| is_binary(value.as_bytes()))
    };
    let binary = original_binary || modified_binary;
    let size = worktree_size
        .max(original.as_ref().map(|value| value.len() as u64).unwrap_or(0))
        .max(modified.as_ref().map(|value| value.len() as u64).unwrap_or(0));

    Ok(GitFileContents {
        path: relative,
        original: if binary || too_large { None } else { original },
        modified: if binary || too_large { None } else { modified },
        binary,
        too_large: too_large && !force,
        size: size as i64,
    })
}

pub fn git_is_repo(cwd: &Path) -> bool {
    git_output(cwd, &["rev-parse", "--is-inside-work-tree"])
        .map(|value| value.trim() == "true")
        .unwrap_or(false)
}

pub fn git_stash_create(cwd: &Path) -> AppResult<String> {
    let created = git_output(cwd, &["stash", "create"])?;
    let sha = created.trim();
    if !sha.is_empty() {
        return Ok(sha.to_owned());
    }
    let head = git_output(cwd, &["rev-parse", "HEAD"])?;
    let head_sha = head.trim();
    if head_sha.is_empty() {
        return Err(AppError::InvalidRequest(
            "Unable to create a git checkpoint.".to_owned(),
        ));
    }
    Ok(head_sha.to_owned())
}

pub fn git_show_path(cwd: &Path, sha: &str, path: &str) -> AppResult<Option<String>> {
    let spec = if sha.trim() == ":" || sha.trim().is_empty() {
        format!(":{}", path.replace('\\', "/"))
    } else {
        format!("{}:{}", sha.trim(), path.replace('\\', "/"))
    };
    match git_output(cwd, &["show", &spec]) {
        Ok(content) => {
            if is_binary(content.as_bytes()) {
                Ok(None)
            } else {
                Ok(Some(content))
            }
        }
        Err(_) => Ok(None),
    }
}

pub fn git_restore_paths(cwd: &Path, sha: &str, paths: &[String]) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args: Vec<String> = vec!["checkout".into(), sha.trim().into(), "--".into()];
    append_paths(&mut args, paths);
    run_args(cwd, &args)
}

pub fn git_add_paths(cwd: &Path, paths: &[String]) -> AppResult<()> {
    if paths.is_empty() {
        return git_add_all(cwd);
    }
    let mut args: Vec<String> = vec!["add".into(), "--".into()];
    append_paths(&mut args, paths);
    run_args(cwd, &args)
}

pub fn git_unstage_paths(cwd: &Path, paths: &[String]) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut restore: Vec<String> = vec!["restore".into(), "--staged".into(), "--".into()];
    append_paths(&mut restore, paths);
    if run_args(cwd, &restore).is_ok() {
        return Ok(());
    }
    let mut reset: Vec<String> = vec!["reset".into(), "HEAD".into(), "--".into()];
    append_paths(&mut reset, paths);
    if run_args(cwd, &reset).is_ok() {
        return Ok(());
    }
    let mut cached: Vec<String> = vec!["rm".into(), "--cached".into(), "-f".into(), "--".into()];
    append_paths(&mut cached, paths);
    run_args(cwd, &cached)
}

pub fn git_discard_paths(cwd: &Path, paths: &[String]) -> AppResult<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut tracked: Vec<String> = vec!["restore".into(), "--worktree".into(), "--".into()];
    append_paths(&mut tracked, paths);
    let _ = run_args(cwd, &tracked);
    let mut clean: Vec<String> = vec!["clean".into(), "-fd".into(), "--".into()];
    append_paths(&mut clean, paths);
    let _ = run_args(cwd, &clean);
    Ok(())
}

pub fn git_apply_patch(cwd: &Path, patch: &str, cached: bool, reverse: bool) -> AppResult<()> {
    let mut args = vec!["apply".to_owned(), "--unidiff-zero".to_owned()];
    if cached {
        args.push("--cached".into());
    }
    if reverse {
        args.push("-R".into());
    }
    git_output_stdin(cwd, &args.iter().map(String::as_str).collect::<Vec<_>>(), patch.as_bytes())?;
    Ok(())
}

pub fn git_log(cwd: &Path, skip: i64, limit: i64, all: bool) -> AppResult<GitLogPage> {
    let take = limit.clamp(1, 500);
    let offset = skip.max(0);
    let skip_arg = offset.to_string();
    let max_arg = (take + 1).to_string();
    let pretty = format!("--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%d%x1f%s%x1f%b%x1e");
    let mut args = vec!["log"];
    if all {
        args.push("--all");
    }
    args.extend([
        "--topo-order",
        "--parents",
        "--decorate=full",
        pretty.as_str(),
        "--skip",
        skip_arg.as_str(),
        "-n",
        max_arg.as_str(),
    ]);
    let output = git_output(cwd, &args)?;
    let mut commits = parse_git_log(&output);
    let has_more = commits.len() as i64 > take;
    if has_more {
        commits.truncate(take as usize);
    }
    Ok(GitLogPage {
        commits,
        has_more,
        skip: offset,
    })
}

pub fn git_commit_detail(cwd: &Path, sha: &str) -> AppResult<GitCommitDetail> {
    let page = git_log_sha(cwd, sha)?;
    let commit = page
        .into_iter()
        .next()
        .ok_or_else(|| AppError::InvalidRequest("Commit was not found.".to_owned()))?;
    let stats = git_output(cwd, &["show", "--numstat", "--format=", sha.trim()]).unwrap_or_default();
    let files = parse_commit_files(&stats);
    let (insertions, deletions, files_changed) = files.iter().fold((0, 0, 0), |acc, file| {
        (acc.0 + file.additions, acc.1 + file.deletions, acc.2 + 1)
    });
    Ok(GitCommitDetail {
        commit: GitCommitInfo {
            insertions,
            deletions,
            files_changed,
            ..commit
        },
        files,
    })
}

pub fn git_branch_details(cwd: &Path) -> AppResult<Vec<GitBranchInfo>> {
    let output = git_output(
        cwd,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(HEAD)%01%(refname)%01%(refname:short)%01%(objectname)%01%(upstream:short)%01%(committerdate:unix)%01%(subject)",
            "refs/heads",
            "refs/remotes",
            "refs/tags",
        ],
    )?;
    Ok(parse_branches(&output))
}

pub fn git_delete_branch(cwd: &Path, branch: &str, force: bool) -> AppResult<()> {
    let flag = if force { "-D" } else { "-d" };
    git_output(cwd, &["branch", flag, branch.trim()])?;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitMergeResult {
    pub merged: bool,
    pub in_progress: bool,
    pub conflicts: Vec<String>,
    pub message: String,
}

pub fn git_unmerged_paths(cwd: &Path) -> Vec<String> {
    git_output(cwd, &["diff", "--name-only", "--diff-filter=U"])
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

pub fn git_merge_in_progress(cwd: &Path) -> bool {
    git_output(cwd, &["rev-parse", "-q", "--verify", "MERGE_HEAD"]).is_ok()
}

fn merge_result_from_tree(cwd: &Path, fallback: &str) -> GitMergeResult {
    let conflicts = git_unmerged_paths(cwd);
    let in_progress = git_merge_in_progress(cwd) || !conflicts.is_empty();
    let message = if conflicts.is_empty() {
        fallback.to_owned()
    } else {
        format!("Merge conflicts in {}.", conflicts.join(", "))
    };
    GitMergeResult {
        merged: !in_progress && conflicts.is_empty(),
        in_progress,
        conflicts,
        message,
    }
}

pub fn git_merge(cwd: &Path, branch: &str) -> AppResult<GitMergeResult> {
    match git_output(cwd, &["merge", "--no-edit", branch.trim()]) {
        Ok(_) => Ok(GitMergeResult {
            merged: true,
            in_progress: false,
            conflicts: Vec::new(),
            message: format!("Merged {}.", branch.trim()),
        }),
        Err(error) => {
            let result = merge_result_from_tree(cwd, &error.to_string());
            if result.in_progress {
                Ok(result)
            } else {
                Err(error)
            }
        }
    }
}

pub fn git_merge_continue(cwd: &Path) -> AppResult<GitMergeResult> {
    match git_output(cwd, &["-c", "core.editor=true", "merge", "--continue"]) {
        Ok(_) => Ok(GitMergeResult {
            merged: true,
            in_progress: false,
            conflicts: Vec::new(),
            message: "Merge continued.".to_owned(),
        }),
        Err(error) => {
            let result = merge_result_from_tree(cwd, &error.to_string());
            if result.in_progress {
                Ok(result)
            } else {
                Err(error)
            }
        }
    }
}

pub fn git_merge_abort(cwd: &Path) -> AppResult<()> {
    git_output(cwd, &["merge", "--abort"])?;
    Ok(())
}

pub fn git_rebase(cwd: &Path, branch: &str) -> AppResult<()> {
    git_output(cwd, &["rebase", branch.trim()])?;
    Ok(())
}

pub fn git_cherry_pick(cwd: &Path, sha: &str) -> AppResult<()> {
    git_output(cwd, &["cherry-pick", sha.trim()])?;
    Ok(())
}

pub fn git_revert(cwd: &Path, sha: &str) -> AppResult<()> {
    git_output(cwd, &["revert", "--no-edit", sha.trim()])?;
    Ok(())
}

pub fn git_reset(cwd: &Path, sha: &str, mode: &str) -> AppResult<()> {
    let flag = match mode.trim() {
        "soft" => "--soft",
        "hard" => "--hard",
        _ => "--mixed",
    };
    git_output(cwd, &["reset", flag, sha.trim()])?;
    Ok(())
}

pub fn git_drop_commit(cwd: &Path, sha: &str) -> AppResult<()> {
    let sha = sha.trim();
    if sha.is_empty() || !sha.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(AppError::InvalidRequest("Invalid commit.".to_owned()));
    }
    git_output(cwd, &["rebase", "--onto", &format!("{sha}~1"), sha])?;
    Ok(())
}

pub fn git_compare(cwd: &Path, from: &str, to: &str) -> AppResult<GitCompare> {
    let range = format!("{}...{}", from.trim(), to.trim());
    let output = git_output(cwd, &["rev-list", "--left-right", "--count", &range])?;
    let mut parts = output.split_whitespace();
    let ahead = parts.next().and_then(|value| value.parse().ok()).unwrap_or(0);
    let behind = parts.next().and_then(|value| value.parse().ok()).unwrap_or(0);
    Ok(GitCompare {
        ahead,
        behind,
        from: from.trim().to_owned(),
        to: to.trim().to_owned(),
    })
}

pub fn git_last_fetch(cwd: &Path) -> Option<i64> {
    let path = cwd.join(".git").join("FETCH_HEAD");
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_millis() as i64)
}

pub fn git_remotes(cwd: &Path) -> AppResult<Vec<GitRemote>> {
    let output = git_output(cwd, &["remote", "-v"])?;
    let mut remotes = Vec::new();
    for line in output.lines() {
        let mut parts = line.split_whitespace();
        let Some(name) = parts.next() else { continue };
        let Some(url) = parts.next() else { continue };
        let kind = parts.next().unwrap_or("");
        if kind.contains("fetch") {
            remotes.push(GitRemote {
                name: name.to_owned(),
                url: url.to_owned(),
            });
        }
    }
    Ok(remotes)
}

pub fn git_init(cwd: &Path) -> AppResult<()> {
    if git_output(cwd, &["init", "-b", "main"]).is_ok() {
        return Ok(());
    }
    git_output(cwd, &["init"])?;
    let _ = git_output(cwd, &["checkout", "-b", "main"]);
    Ok(())
}

pub fn git_clone(url: &str, dest: &Path, token: Option<&str>) -> AppResult<()> {
    let parent = dest
        .parent()
        .ok_or_else(|| AppError::InvalidRequest("Choose a valid clone directory.".to_owned()))?;
    fs::create_dir_all(parent)?;
    let dest_str = dest.to_string_lossy().into_owned();
    authenticated_git(parent, token, &["clone", url, &dest_str])
}

pub fn git_add_remote(cwd: &Path, name: &str, url: &str) -> AppResult<()> {
    match git_output(cwd, &["remote", "get-url", name]) {
        Ok(_) => {
            git_output(cwd, &["remote", "set-url", name, url])?;
        }
        Err(_) => {
            git_output(cwd, &["remote", "add", name, url])?;
        }
    }
    Ok(())
}

pub fn git_has_commits(cwd: &Path) -> bool {
    git_output(cwd, &["rev-parse", "--verify", "HEAD"]).is_ok()
}

pub fn git_add_all(cwd: &Path) -> AppResult<()> {
    git_output(cwd, &["add", "-A"])?;
    Ok(())
}

pub fn git_commit(cwd: &Path, message: &str, identity: Option<&GitIdentity>) -> AppResult<()> {
    let message = message.trim();
    if message.is_empty() {
        return Err(AppError::InvalidRequest("Commit message is required.".to_owned()));
    }
    let (summary, body) = split_commit_message(message);
    let summary = summary.to_owned();
    let body = body.map(str::to_owned);
    let mut args = vec!["-c".to_owned(), "commit.gpgsign=false".to_owned()];
    if let Some(identity) = identity {
        let name = sanitize_identity_value(&identity.name);
        let email = sanitize_identity_value(&identity.email);
        if !name.is_empty() && !email.is_empty() {
            args.push("-c".into());
            args.push(format!("user.name={name}"));
            args.push("-c".into());
            args.push(format!("user.email={email}"));
        }
    }
    args.push("commit".into());
    args.push("-m".into());
    args.push(summary);
    if let Some(body) = body {
        args.push("-m".into());
        args.push(body);
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    git_output(cwd, &refs)?;
    Ok(())
}

pub fn git_fetch(cwd: &Path, token: Option<&str>) -> AppResult<()> {
    authenticated_git(cwd, token, &["fetch", "--all", "--prune"])
}

pub fn git_pull(cwd: &Path, token: Option<&str>) -> AppResult<()> {
    let branch = current_branch(cwd)?;
    let remote = push_remote_name(cwd)?;
    authenticated_git(cwd, token, &["pull", "--rebase", &remote, &branch])
}

pub fn git_push(cwd: &Path, token: Option<&str>) -> AppResult<()> {
    let branch = current_branch(cwd)?;
    let remote = push_remote_name(cwd)?;
    let spec = push_refspec(&branch)?;
    authenticated_git(cwd, token, &["push", "-u", &remote, &spec])
}

fn current_branch(cwd: &Path) -> AppResult<String> {
    match git_output(cwd, &["symbolic-ref", "--short", "HEAD"]) {
        Ok(output) => parse_current_branch(&output),
        Err(_) => Err(AppError::InvalidRequest(DETACHED_HEAD_ERROR.to_owned())),
    }
}

fn push_remote_name(cwd: &Path) -> AppResult<String> {
    let remotes = git_remotes(cwd)?;
    let upstream = git_output(cwd, &["rev-parse", "--abbrev-ref", "@{upstream}"])
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    pick_push_remote(&remotes, upstream.as_deref())
}

const DETACHED_HEAD_ERROR: &str = "You are not on a branch. Checkout or create a branch before pushing.";
const NO_REMOTE_ERROR: &str = "No git remote is configured.";

fn parse_current_branch(symbolic_ref: &str) -> AppResult<String> {
    let name = symbolic_ref.trim();
    if !is_safe_git_name(name) || name == "HEAD" {
        return Err(AppError::InvalidRequest(DETACHED_HEAD_ERROR.to_owned()));
    }
    Ok(name.to_owned())
}

fn push_refspec(branch: &str) -> AppResult<String> {
    let branch = parse_current_branch(branch)?;
    Ok(format!("HEAD:refs/heads/{branch}"))
}

fn pick_push_remote(remotes: &[GitRemote], upstream: Option<&str>) -> AppResult<String> {
    let usable: Vec<&GitRemote> = remotes
        .iter()
        .filter(|remote| is_safe_git_name(&remote.name) && !remote.url.trim().is_empty())
        .collect();
    if usable.is_empty() {
        return Err(AppError::InvalidRequest(NO_REMOTE_ERROR.to_owned()));
    }
    if let Some(upstream) = upstream.map(str::trim).filter(|value| !value.is_empty()) {
        let remote_name = upstream.split('/').next().unwrap_or("");
        if let Some(found) = usable.iter().find(|remote| remote.name == remote_name) {
            return Ok(found.name.clone());
        }
    }
    if let Some(origin) = usable.iter().find(|remote| remote.name == "origin") {
        return Ok(origin.name.clone());
    }
    Ok(usable[0].name.clone())
}

fn is_safe_git_name(name: &str) -> bool {
    let name = name.trim();
    !name.is_empty()
        && !name.starts_with('-')
        && !name.contains("..")
        && !name.contains(':')
        && !name.contains(' ')
        && !name.contains('\0')
        && !name.contains('\\')
}

pub fn git_branch_list(cwd: &Path) -> AppResult<Vec<String>> {
    let output = git_output(cwd, &["branch", "--format=%(refname:short)"])?;
    Ok(output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect())
}

pub fn git_checkout(cwd: &Path, branch: &str) -> AppResult<()> {
    git_output(cwd, &["checkout", branch.trim()])?;
    Ok(())
}

pub fn git_create_branch(cwd: &Path, branch: &str, start: Option<&str>) -> AppResult<()> {
    let name = branch.trim();
    if let Some(from) = start.filter(|value| !value.trim().is_empty()) {
        git_output(cwd, &["checkout", "-b", name, from.trim()])?;
    } else {
        git_output(cwd, &["checkout", "-b", name])?;
    }
    Ok(())
}

fn authenticated_git(cwd: &Path, token: Option<&str>, args: &[&str]) -> AppResult<()> {
    let auth = github_auth_config(token);
    if auth.is_empty() {
        return git_output_sanitized(cwd, args);
    }
    let mut next = auth;
    next.extend(args.iter().map(|value| (*value).to_owned()));
    let refs: Vec<&str> = next.iter().map(String::as_str).collect();
    git_output_sanitized(cwd, &refs)
}

fn github_auth_config(token: Option<&str>) -> Vec<String> {
    let Some(token) = token.filter(|value| !value.is_empty()) else {
        return Vec::new();
    };
    let encoded = urlencoding::encode(token);
    let instead = format!("url.https://x-access-token:{encoded}@github.com/.insteadOf");
    vec![
        "-c".to_owned(),
        "credential.helper=".to_owned(),
        "-c".to_owned(),
        "credential.https://github.com.helper=".to_owned(),
        "-c".to_owned(),
        format!("{instead}=https://github.com/"),
        "-c".to_owned(),
        format!("{instead}=git@github.com:"),
        "-c".to_owned(),
        format!("{instead}=ssh://git@github.com/"),
    ]
}

fn is_git_auth_failure(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("x-access-token")
        || lower.contains("authorization: bearer")
        || lower.contains("authorization:bearer")
        || lower.contains("authentication failed")
        || lower.contains("invalid credentials")
        || lower.contains("invalid username or password")
        || lower.contains("could not read username")
}

fn sanitize_git_message(message: &str) -> String {
    if is_git_auth_failure(message) {
        "Git authentication failed.".to_owned()
    } else {
        message.to_owned()
    }
}

fn sanitize_identity_value(value: &str) -> String {
    value.replace(['\n', '\r', '\0'], " ").trim().to_owned()
}

fn porcelain_has_upstream(output: &str) -> bool {
    output
        .lines()
        .any(|line| line.strip_prefix("## ").is_some_and(|rest| rest.contains("...")))
}

fn effective_ahead(porcelain_ahead: i64, has_upstream: bool, origin_exists: bool, local_commit_count: i64) -> i64 {
    if has_upstream {
        porcelain_ahead
    } else if origin_exists {
        local_commit_count.max(0)
    } else {
        0
    }
}

fn git_output_sanitized(cwd: &Path, args: &[&str]) -> AppResult<()> {
    git_output(cwd, args).map(|_| ())
}

fn git_output(cwd: &Path, args: &[&str]) -> AppResult<String> {
    git_output_stdin(cwd, args, &[])
}

fn git_output_stdin(cwd: &Path, args: &[&str], stdin: &[u8]) -> AppResult<String> {
    let mut child = spawn_git(cwd, args, stdin)?;
    if !stdin.is_empty() {
        if let Some(mut pipe) = child.stdin.take() {
            pipe.write_all(stdin)
                .map_err(|_| AppError::InvalidRequest("Unable to write git patch.".to_owned()))?;
        }
    }
    let output = child
        .wait_with_output()
        .map_err(|_| AppError::InvalidRequest("Git is not available.".to_owned()))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(AppError::InvalidRequest(if stderr.is_empty() {
            "Git command failed.".to_owned()
        } else {
            sanitize_git_message(&stderr)
        }));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn spawn_git(cwd: &Path, args: &[&str], stdin: &[u8]) -> AppResult<std::process::Child> {
    let mut last_program = String::new();
    for attempt in 0..2 {
        if attempt == 1 {
            invalidate_git_program();
        }
        let program = git_program();
        if attempt == 1 && program == last_program {
            break;
        }
        last_program = program.clone();
        let mut command = Command::new(&program);
        command
            .args(args)
            .current_dir(cwd)
            .env_clear()
            .envs(git_command_env(&program))
            .stdin(if stdin.is_empty() { Stdio::null() } else { Stdio::piped() })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        match command.spawn() {
            Ok(child) => return Ok(child),
            Err(_) => continue,
        }
    }
    Err(AppError::InvalidRequest("Git is not available.".to_owned()))
}

fn git_program() -> String {
    if let Some(cached) = cached_git_program() {
        if Path::new(&cached).is_file() {
            return cached;
        }
        invalidate_git_program();
    }
    let discovered = discover_git().unwrap_or_else(|| "git".to_owned());
    if Path::new(&discovered).is_file() {
        store_git_program(&discovered);
    }
    discovered
}

fn cached_git_program() -> Option<String> {
    GIT_PROGRAM
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone()
}

fn store_git_program(path: &str) {
    *GIT_PROGRAM.lock().unwrap_or_else(|error| error.into_inner()) = Some(path.to_owned());
}

fn invalidate_git_program() {
    *GIT_PROGRAM.lock().unwrap_or_else(|error| error.into_inner()) = None;
}

fn discover_git() -> Option<String> {
    find_git_on_path().or_else(|| {
        git_install_candidates()
            .into_iter()
            .find(|path| Path::new(path).is_file())
    })
}

fn find_git_on_path() -> Option<String> {
    let path = std::env::var_os("PATH")?;
    let names: &[&str] = if cfg!(windows) {
        &["git.exe", "git.cmd", "git"]
    } else {
        &["git"]
    };
    std::env::split_paths(&path).find_map(|dir| {
        names.iter().find_map(|name| {
            let candidate = dir.join(name);
            candidate.is_file().then(|| candidate.to_string_lossy().into_owned())
        })
    })
}

fn git_install_candidates() -> Vec<String> {
    let mut candidates = Vec::new();
    #[cfg(windows)]
    {
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into());
        let program_files_x86 =
            std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| r"C:\Program Files (x86)".into());
        let local_app_data = std::env::var("LOCALAPPDATA").ok().or_else(|| {
            std::env::var("USERPROFILE")
                .ok()
                .map(|home| format!(r"{home}\AppData\Local"))
        });
        let home = std::env::var("USERPROFILE").unwrap_or_default();
        for root in [program_files, program_files_x86] {
            candidates.push(format!(r"{root}\Git\cmd\git.exe"));
            candidates.push(format!(r"{root}\Git\bin\git.exe"));
        }
        if let Some(local) = local_app_data {
            candidates.push(format!(r"{local}\Programs\Git\cmd\git.exe"));
        }
        if !home.is_empty() {
            candidates.push(format!(r"{home}\scoop\shims\git.exe"));
        }
        candidates.push(r"C:\ProgramData\chocolatey\bin\git.exe".into());
    }
    #[cfg(target_os = "macos")]
    {
        candidates.extend([
            "/opt/homebrew/bin/git".into(),
            "/usr/local/bin/git".into(),
            "/usr/bin/git".into(),
        ]);
    }
    #[cfg(target_os = "linux")]
    {
        candidates.extend(["/usr/bin/git".into(), "/usr/local/bin/git".into()]);
    }
    candidates
}

fn git_command_env(git_program: &str) -> Vec<(String, String)> {
    let mut env = filtered_env();
    let extra = git_helper_dirs(git_program);
    if !extra.is_empty() {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let prefix = extra.join(sep);
        if let Some((_, path)) = env.iter_mut().find(|(key, _)| key.eq_ignore_ascii_case("PATH")) {
            *path = format!("{prefix}{sep}{path}");
        } else {
            env.push(("PATH".into(), prefix));
        }
    }
    env.push(("GIT_TERMINAL_PROMPT".into(), "0".into()));
    env
}

fn git_helper_dirs(git_program: &str) -> Vec<String> {
    let path = Path::new(git_program);
    let Some(parent) = path.parent().filter(|dir| !dir.as_os_str().is_empty()) else {
        return Vec::new();
    };
    let mut dirs = vec![parent.to_string_lossy().into_owned()];
    if parent
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("cmd"))
    {
        if let Some(root) = parent.parent() {
            for extra in [["usr", "bin"], ["mingw64", "bin"]] {
                let dir = extra.iter().fold(root.to_path_buf(), |acc, part| acc.join(part));
                if dir.is_dir() {
                    dirs.push(dir.to_string_lossy().into_owned());
                }
            }
        }
    }
    dirs
}

fn run_args(cwd: &Path, args: &[String]) -> AppResult<()> {
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    git_output(cwd, &refs).map(|_| ())
}

fn append_paths(args: &mut Vec<String>, paths: &[String]) {
    for path in paths {
        let trimmed = path.replace('\\', "/");
        if !trimmed.is_empty() {
            args.push(trimmed);
        }
    }
}

fn split_commit_message(message: &str) -> (&str, Option<&str>) {
    if let Some((summary, body)) = message.split_once("\n\n") {
        let body = body.trim();
        if body.is_empty() {
            (summary.trim(), None)
        } else {
            (summary.trim(), Some(body))
        }
    } else {
        (message.trim(), None)
    }
}

fn read_worktree_text(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    if is_binary(&bytes) {
        return None;
    }
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

fn is_binary(bytes: &[u8]) -> bool {
    bytes.contains(&0)
}

fn merge_stats(
    staged: Option<(i64, i64, bool)>,
    unstaged: Option<(i64, i64, bool)>,
) -> (i64, i64, bool) {
    let (sa, sd, sb) = staged.unwrap_or((0, 0, false));
    let (ua, ud, ub) = unstaged.unwrap_or((0, 0, false));
    (sa + ua, sd + ud, sb || ub)
}

fn parse_numstat(output: &str) -> HashMap<String, (i64, i64, bool)> {
    let mut map = HashMap::new();
    for line in output.lines() {
        let mut parts = line.split('\t');
        let Some(added) = parts.next() else { continue };
        let Some(deleted) = parts.next() else { continue };
        let Some(path) = parts.next() else { continue };
        let path = path.replace('\\', "/");
        let binary = added == "-" || deleted == "-";
        let additions = if binary { 0 } else { added.parse().unwrap_or(0) };
        let deletions = if binary { 0 } else { deleted.parse().unwrap_or(0) };
        map.insert(path, (additions, deletions, binary));
    }
    map
}

pub fn parse_git_status(output: &str) -> AppResult<GitStatus> {
    let mut branch = "HEAD".to_owned();
    let mut changed_files = Vec::new();
    let mut files = Vec::new();
    let mut ahead = 0;
    let mut behind = 0;
    let mut staged_files = 0;
    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            let (next_branch, next_ahead, next_behind) = parse_branch_header(rest);
            branch = next_branch;
            ahead = next_ahead;
            behind = next_behind;
            continue;
        }
        if let Some(file) = parse_status_line(line) {
            if file.staged {
                staged_files += 1;
            }
            changed_files.push(file.path.clone());
            files.push(file);
        }
    }
    Ok(GitStatus {
        clean: changed_files.is_empty(),
        branch,
        changed_files,
        ahead,
        behind,
        staged_files,
        files,
    })
}

fn parse_status_line(line: &str) -> Option<GitFileChange> {
    if line.len() < 3 {
        return None;
    }
    let index = line.chars().next()?.to_string();
    let worktree = line.chars().nth(1)?.to_string();
    let rest = line.get(3..)?.trim();
    if rest.is_empty() {
        return None;
    }
    let (path, original_path) = if let Some((left, right)) = rest.split_once(" -> ") {
        (unquote(right), Some(unquote(left)))
    } else {
        (unquote(rest), None)
    };
    let staged = index != " " && index != "?";
    let unstaged = worktree != " ";
    let kind = file_kind(&index, &worktree);
    Some(GitFileChange {
        path,
        original_path,
        index,
        worktree,
        kind,
        additions: 0,
        deletions: 0,
        staged,
        unstaged,
        binary: false,
    })
}

fn file_kind(index: &str, worktree: &str) -> String {
    let codes = format!("{index}{worktree}");
    if codes.contains('?') {
        "U".into()
    } else if codes.contains('R') || codes.contains('C') {
        "R".into()
    } else if codes.contains('A') {
        "A".into()
    } else if codes.contains('D') {
        "D".into()
    } else {
        "M".into()
    }
}

fn unquote(value: &str) -> String {
    let trimmed = value.trim().replace('\\', "/");
    if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
        trimmed[1..trimmed.len() - 1].replace("\\n", "\n").replace("\\\"", "\"")
    } else {
        trimmed
    }
}

fn parse_branch_header(rest: &str) -> (String, i64, i64) {
    let (ahead, behind) = parse_ahead_behind(rest);
    let branch = if let Some(name) = rest.strip_prefix("No commits yet on ") {
        name.split("...")
            .next()
            .unwrap_or(name)
            .split_whitespace()
            .next()
            .unwrap_or("HEAD")
            .to_owned()
    } else if rest.starts_with("HEAD (no branch)") {
        "HEAD".to_owned()
    } else {
        rest.split("...")
            .next()
            .unwrap_or(rest)
            .split_whitespace()
            .next()
            .unwrap_or("HEAD")
            .to_owned()
    };
    (branch, ahead, behind)
}

fn parse_ahead_behind(rest: &str) -> (i64, i64) {
    let mut ahead = 0;
    let mut behind = 0;
    if let Some(start) = rest.find('[') {
        let inner = rest[start..].trim_matches(|ch| ch == '[' || ch == ']');
        for part in inner.split(',') {
            let part = part.trim();
            if let Some(value) = part.strip_prefix("ahead ") {
                ahead = value.trim().parse().unwrap_or(0);
            } else if let Some(value) = part.strip_prefix("behind ") {
                behind = value.trim().parse().unwrap_or(0);
            }
        }
    }
    (ahead, behind)
}

fn parse_git_log(output: &str) -> Vec<GitCommitInfo> {
    output
        .split('\u{1e}')
        .filter_map(|record| parse_commit_record(record.trim()))
        .collect()
}

fn git_log_sha(cwd: &Path, sha: &str) -> AppResult<Vec<GitCommitInfo>> {
    let output = git_output(
        cwd,
        &[
            "log",
            "--parents",
            "--decorate=full",
            &format!("--pretty=format:%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%d%x1f%s%x1f%b%x1e"),
            "-n",
            "1",
            sha.trim(),
        ],
    )?;
    Ok(parse_git_log(&output))
}

fn parse_commit_record(record: &str) -> Option<GitCommitInfo> {
    if record.is_empty() {
        return None;
    }
    let mut fields = record.split('\u{1f}');
    let sha = fields.next()?.trim();
    if sha.is_empty() {
        return None;
    }
    let parents = fields
        .next()
        .unwrap_or("")
        .split_whitespace()
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect();
    let author = fields.next().unwrap_or("").to_owned();
    let email = fields.next().unwrap_or("").to_owned();
    let timestamp = fields.next().unwrap_or("0").trim().parse().unwrap_or(0);
    let decorations = fields.next().unwrap_or("");
    let subject = fields.next().unwrap_or("").to_owned();
    let body = fields.collect::<Vec<_>>().join("\u{1f}").trim().to_owned();
    Some(GitCommitInfo {
        short_sha: sha.chars().take(7).collect(),
        sha: sha.to_owned(),
        parents,
        author,
        email,
        timestamp,
        subject,
        body,
        refs: parse_refs(decorations),
        insertions: 0,
        deletions: 0,
        files_changed: 0,
    })
}

fn parse_refs(decorations: &str) -> Vec<String> {
    let trimmed = decorations.trim().trim_start_matches('(').trim_end_matches(')');
    if trimmed.is_empty() {
        return Vec::new();
    }
    trimmed
        .split(", ")
        .map(|item| {
            item.trim()
                .trim_start_matches("HEAD -> ")
                .trim_start_matches("tag: ")
                .trim_start_matches("refs/heads/")
                .trim_start_matches("refs/remotes/")
                .trim_start_matches("refs/tags/")
                .to_owned()
        })
        .filter(|item| !item.is_empty() && item != "HEAD")
        .collect()
}

fn parse_branches(output: &str) -> Vec<GitBranchInfo> {
    let mut branches = Vec::new();
    for line in output.lines() {
        let mut parts = line.split('\u{1}');
        let head = parts.next().unwrap_or("");
        let Some(refname) = parts.next() else { continue };
        let name = parts.next().unwrap_or("").to_owned();
        let sha = parts.next().unwrap_or("").to_owned();
        let upstream = parts.next().filter(|value| !value.is_empty()).map(str::to_owned);
        let timestamp = parts.next().and_then(|value| value.parse().ok()).unwrap_or(0);
        let subject = parts.next().unwrap_or("").to_owned();
        if name.is_empty() {
            continue;
        }
        let remote = refname.starts_with("refs/remotes/");
        let kind = if refname.starts_with("refs/tags/") {
            "tag"
        } else if remote {
            "remote"
        } else {
            "local"
        };
        branches.push(GitBranchInfo {
            current: head.contains('*'),
            r#ref: refname.to_owned(),
            name,
            sha,
            remote,
            upstream,
            kind: kind.into(),
            timestamp,
            subject,
        });
    }
    branches
}

fn parse_commit_files(output: &str) -> Vec<GitCommitFile> {
    let mut files = Vec::new();
    for line in output.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let mut parts = line.split('\t');
        let Some(added) = parts.next() else { continue };
        let Some(deleted) = parts.next() else { continue };
        let Some(path) = parts.next() else { continue };
        let binary = added == "-" || deleted == "-";
        let (path, original_path) = if let Some((left, right)) = path.split_once(" => ") {
            (right.replace('\\', "/"), Some(left.replace('\\', "/")))
        } else {
            (path.replace('\\', "/"), None)
        };
        let kind = if original_path.is_some() {
            "R"
        } else if added == "0" && deleted != "0" && deleted != "-" {
            "D"
        } else if deleted == "0" && added != "0" && added != "-" {
            "A"
        } else {
            "M"
        };
        files.push(GitCommitFile {
            path,
            original_path,
            kind: kind.into(),
            additions: if binary { 0 } else { added.parse().unwrap_or(0) },
            deletions: if binary { 0 } else { deleted.parse().unwrap_or(0) },
            binary,
        });
    }
    files
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_porcelain_status() {
        let status = parse_git_status("## main...origin/main\n M src/App.tsx\n?? README.md\n").unwrap();
        assert_eq!(status.branch, "main");
        assert_eq!(status.changed_files, vec!["src/App.tsx", "README.md"]);
        assert!(!status.clean);
        assert_eq!(status.ahead, 0);
        assert_eq!(status.staged_files, 0);
        assert_eq!(status.files[0].kind, "M");
        assert!(!status.files[0].staged);
        assert_eq!(status.files[1].kind, "U");
    }

    #[test]
    fn parses_ahead_behind_and_rename() {
        let status = parse_git_status(
            "## feature...origin/feature [ahead 3, behind 1]\nR  src/a.ts -> src/b.ts\n",
        )
        .unwrap();
        assert_eq!(status.ahead, 3);
        assert_eq!(status.behind, 1);
        assert_eq!(status.files[0].kind, "R");
        assert_eq!(status.files[0].path, "src/b.ts");
        assert_eq!(status.files[0].original_path.as_deref(), Some("src/a.ts"));
        assert!(status.files[0].staged);
    }

    #[test]
    fn parses_no_commits_yet_on_main() {
        let status = parse_git_status("## No commits yet on main\n?? README.md\n").unwrap();
        assert_eq!(status.branch, "main");
        assert_eq!(status.changed_files, vec!["README.md"]);
        assert_eq!(status.ahead, 0);
    }

    #[test]
    fn unpublished_ahead_without_upstream() {
        assert_eq!(effective_ahead(0, false, true, 2), 2);
        assert_eq!(effective_ahead(0, true, true, 2), 0);
        assert_eq!(effective_ahead(3, true, true, 5), 3);
        assert_eq!(effective_ahead(0, false, false, 2), 0);
    }

    #[test]
    fn sanitizes_bearer_header() {
        assert_eq!(
            sanitize_git_message("fatal: AUTHORIZATION: bearer ghp_secret failed"),
            "Git authentication failed."
        );
        assert_eq!(sanitize_git_message("nothing here"), "nothing here");
    }

    #[test]
    fn sanitizes_https_credential_failures() {
        assert_eq!(
            sanitize_git_message("remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/acme/app.git/'"),
            "Git authentication failed."
        );
        assert_eq!(
            sanitize_git_message("remote: Invalid credentials\nfatal: Authentication failed"),
            "Git authentication failed."
        );
        assert_eq!(
            sanitize_git_message("fatal: could not read Username for 'https://github.com': terminal prompts disabled"),
            "Git authentication failed."
        );
    }

    #[test]
    fn git_install_candidates_include_platform_defaults() {
        let candidates = git_install_candidates();
        #[cfg(windows)]
        {
            assert!(candidates.iter().any(|path| path.ends_with(r"Git\cmd\git.exe")));
        }
        #[cfg(target_os = "macos")]
        {
            assert!(candidates.iter().any(|path| path == "/opt/homebrew/bin/git"));
        }
        #[cfg(target_os = "linux")]
        {
            assert!(candidates.iter().any(|path| path == "/usr/bin/git"));
        }
    }

    #[test]
    fn git_helper_dirs_include_cmd_parent() {
        let git = PathBuf::from("C:")
            .join("Program Files")
            .join("Git")
            .join("cmd")
            .join("git.exe");
        let dirs = git_helper_dirs(&git.to_string_lossy());
        assert!(dirs.first().is_some_and(|dir| Path::new(dir).file_name().is_some_and(|name| name == "cmd")));
        assert!(git_helper_dirs("git").is_empty());
    }

    #[test]
    fn github_auth_config_rewrites_https_and_ssh() {
        let config = github_auth_config(Some("gho_secret"));
        assert!(config.iter().any(|item| item == "credential.helper="));
        assert!(config.iter().any(|item| item == "credential.https://github.com.helper="));
        let joined = config.join("\n");
        assert!(joined.contains("x-access-token:gho_secret@github.com/.insteadOf=https://github.com/"));
        assert!(joined.contains("insteadOf=git@github.com:"));
        assert!(joined.contains("insteadOf=ssh://git@github.com/"));
        assert!(!joined.contains("AUTHORIZATION: bearer"));
    }

    #[test]
    fn github_auth_config_empty_without_token() {
        assert!(github_auth_config(None).is_empty());
        assert!(github_auth_config(Some("")).is_empty());
    }

    #[test]
    fn drop_commit_rejects_invalid_sha() {
        let err = git_drop_commit(Path::new("."), "HEAD").unwrap_err();
        assert!(err.to_string().contains("Invalid commit"));
        let err = git_drop_commit(Path::new("."), "").unwrap_err();
        assert!(err.to_string().contains("Invalid commit"));
    }

    #[test]
    fn push_refspec_uses_full_branch_ref() {
        assert_eq!(push_refspec("main").unwrap(), "HEAD:refs/heads/main");
        assert_eq!(push_refspec("feature/foo").unwrap(), "HEAD:refs/heads/feature/foo");
        assert!(push_refspec("HEAD").unwrap_err().to_string().contains("not on a branch"));
        assert!(push_refspec("").unwrap_err().to_string().contains("not on a branch"));
        assert!(parse_current_branch("HEAD (no branch)").is_err());
    }

    #[test]
    fn pick_push_remote_requires_url_and_prefers_upstream() {
        let origin = GitRemote {
            name: "origin".into(),
            url: "https://github.com/acme/app.git".into(),
        };
        let empty = GitRemote {
            name: "origin".into(),
            url: "  ".into(),
        };
        let other = GitRemote {
            name: "github".into(),
            url: "https://github.com/acme/app.git".into(),
        };
        assert!(pick_push_remote(&[empty.clone()], None).unwrap_err().to_string().contains("No git remote"));
        assert_eq!(pick_push_remote(&[origin.clone()], None).unwrap(), "origin");
        assert_eq!(
            pick_push_remote(&[other.clone(), origin.clone()], Some("github/main")).unwrap(),
            "github"
        );
        assert_eq!(pick_push_remote(&[other.clone()], None).unwrap(), "github");
        assert_eq!(pick_push_remote(&[empty.clone(), other.clone()], None).unwrap(), "github");
        assert!(pick_push_remote(&[], None).is_err());
    }
}
