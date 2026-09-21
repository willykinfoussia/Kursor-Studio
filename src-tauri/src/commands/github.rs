use crate::database::records::{AccountRecord, GitHubAccountRecord};
use crate::error::{AppError, AppResult};
use crate::github::{self, GitHubIssue, GitHubPull, GitHubRelease, GitHubRepository, GitHubUser};
use crate::state::AppState;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub async fn github_sign_in(app: AppHandle) -> AppResult<GitHubUser> {
    let client_id = {
        let state = app.state::<AppState>();
        let account = state.db.current_account()?;
        let stored = state
            .db
            .global_settings_list(&account.id)
            .ok()
            .and_then(|rows| {
                rows.into_iter()
                    .find(|row| row.key == github::CLIENT_ID_SETTING)
                    .map(|row| row.value)
            });
        github::resolve_client_id(stored.as_deref())?
    };

    github::emit_progress(&app, "Opening GitHub…");
    let token = match github::request_device_code(&client_id) {
        Ok(device) => {
            let uri = device
                .verification_uri_complete
                .clone()
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| device.verification_uri.clone());
            github::emit_sign_in_progress(
                &app,
                github::SignInProgress {
                    message: format!(
                        "Enter {} in the browser to finish GitHub sign-in",
                        device.user_code
                    ),
                    user_code: Some(device.user_code.clone()),
                    verification_uri: Some(device.verification_uri.clone()),
                },
            );
            github::open_browser(&app, &uri)?;
            let client_id = client_id.clone();
            tauri::async_runtime::spawn_blocking(move || github::poll_device_token(&client_id, device))
                .await
                .map_err(|_| AppError::InvalidRequest("GitHub sign-in failed.".to_owned()))??
        }
        Err(_) => {
            let session = github::prepare_pkce(&client_id)?;
            github::emit_progress(&app, "Complete sign-in in the browser");
            github::open_browser(&app, &session.authorize_url)?;
            tauri::async_runtime::spawn_blocking(move || {
                let code = github::wait_for_code(session.listener, &session.state)?;
                github::exchange_token(&session.client_id, &code, &session.redirect_uri, &session.verifier)
            })
            .await
            .map_err(|_| AppError::InvalidRequest("GitHub sign-in failed.".to_owned()))??
        }
    };

    let state = app.state::<AppState>();
    github::store_token(&state.secrets, token)?;
    let user = github::current_user(&state.secrets)?.ok_or_else(|| {
        AppError::InvalidRequest("GitHub signed in but the user profile could not be loaded.".to_owned())
    })?;
    let now = now_ms();
    let mut next = state.db.current_account()?;
    next.provider = "github".to_owned();
    next.username = Some(user.login.clone());
    next.display_name = user.name.clone().or_else(|| Some(user.login.clone()));
    next.avatar_url = user.avatar_url.clone();
    next.onboarded = 1;
    next.updated_at = now;
    state.db.upsert_account(&next)?;
    state.db.upsert_github_account(&GitHubAccountRecord {
        id: format!("github-{}", user.id),
        account_id: next.id,
        github_user_id: user.id.clone(),
        username: user.login.clone(),
        avatar_url: user.avatar_url.clone(),
        created_at: now,
        updated_at: now,
    })?;
    Ok(user)
}

#[tauri::command]
pub fn github_sign_out(state: State<'_, AppState>) -> AppResult<()> {
    github::sign_out(&state.secrets)?;
    if let Ok(account) = state.db.current_account() {
        state.db.delete_github_account(&account.id)?;
        let mut next = account;
        next.provider = "local".to_owned();
        next.updated_at = now_ms();
        state.db.upsert_account(&next)?;
    }
    Ok(())
}

#[tauri::command]
pub fn github_current_user(state: State<'_, AppState>) -> AppResult<Option<GitHubUser>> {
    github::current_user(&state.secrets)
}

#[tauri::command]
pub fn github_is_authenticated(state: State<'_, AppState>) -> bool {
    github::is_authenticated(&state.secrets)
}

#[tauri::command]
pub fn github_list_repositories(query: Option<String>, state: State<'_, AppState>) -> AppResult<Vec<GitHubRepository>> {
    github::list_repositories(&state.secrets, query.as_deref())
}

#[tauri::command]
pub fn github_get_repository(owner: String, name: String, state: State<'_, AppState>) -> AppResult<GitHubRepository> {
    github::get_repository(&state.secrets, &owner, &name)
}

#[tauri::command]
pub fn github_create_repository(name: String, private: Option<bool>, state: State<'_, AppState>) -> AppResult<GitHubRepository> {
    github::create_repository(&state.secrets, &name, private.unwrap_or(true))
}

#[tauri::command]
pub fn github_list_issues(owner: String, repo: String, state: State<'_, AppState>) -> AppResult<Vec<GitHubIssue>> {
    github::list_issues(&state.secrets, &owner, &repo)
}

#[tauri::command]
pub fn github_create_issue(
    owner: String,
    repo: String,
    title: String,
    body: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<GitHubIssue> {
    github::create_issue(&state.secrets, &owner, &repo, &title, body.as_deref())
}

#[tauri::command]
pub fn github_list_pulls(owner: String, repo: String, state: State<'_, AppState>) -> AppResult<Vec<GitHubPull>> {
    github::list_pulls(&state.secrets, &owner, &repo)
}

#[tauri::command]
pub fn github_create_pull(
    owner: String,
    repo: String,
    title: String,
    head: String,
    base: String,
    body: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<GitHubPull> {
    github::create_pull(&state.secrets, &owner, &repo, &title, &head, &base, body.as_deref())
}

#[tauri::command]
pub fn github_list_releases(owner: String, repo: String, state: State<'_, AppState>) -> AppResult<Vec<GitHubRelease>> {
    github::list_releases(&state.secrets, &owner, &repo)
}

#[tauri::command]
pub fn github_create_release(
    owner: String,
    repo: String,
    tag: String,
    name: Option<String>,
    body: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<GitHubRelease> {
    github::create_release(&state.secrets, &owner, &repo, &tag, name.as_deref(), body.as_deref())
}

#[tauri::command]
pub fn account_current(state: State<'_, AppState>) -> AppResult<AccountRecord> {
    state.db.current_account()
}

#[tauri::command]
pub fn account_upsert(account: AccountRecord, state: State<'_, AppState>) -> AppResult<AccountRecord> {
    state.db.upsert_account(&account)
}

#[tauri::command]
pub fn account_mark_onboarded(state: State<'_, AppState>) -> AppResult<AccountRecord> {
    let mut account = state.db.current_account()?;
    account.onboarded = 1;
    account.updated_at = now_ms();
    state.db.upsert_account(&account)
}
