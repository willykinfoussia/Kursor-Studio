use crate::error::{AppError, AppResult};
use crate::secrets::SecretStore;
use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use std::{
    io::{ErrorKind, Read, Write},
    net::TcpListener,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

const GITHUB_TOKEN_KEY: &str = "GITHUB_ACCESS_TOKEN";
const OAUTH_PORT: u16 = 8742;
const AUTH_URL: &str = "https://github.com/login/oauth/authorize";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const API_URL: &str = "https://api.github.com";
const USER_AGENT: &str = "Kursor-Desktop";
const OAUTH_SCOPE: &str = "read:user user:email repo";
pub const CLIENT_ID_SETTING: &str = "github_oauth_client_id";
const PROGRESS_EVENT: &str = "github-sign-in-progress";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInProgress {
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_uri: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubUser {
    pub id: String,
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepository {
    pub id: String,
    pub name: String,
    pub full_name: String,
    pub owner: String,
    pub html_url: String,
    pub clone_url: String,
    pub default_branch: String,
    pub private: bool,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssue {
    pub id: String,
    pub number: i64,
    pub title: String,
    pub state: String,
    pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPull {
    pub id: String,
    pub number: i64,
    pub title: String,
    pub state: String,
    pub html_url: String,
    pub head: String,
    pub base: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRelease {
    pub id: String,
    pub tag_name: String,
    pub name: String,
    pub html_url: String,
    pub draft: bool,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Clone, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    #[serde(default)]
    pub verification_uri_complete: Option<String>,
    pub expires_in: u64,
    #[serde(default)]
    pub interval: Option<u64>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

pub struct PkceSession {
    pub listener: TcpListener,
    pub authorize_url: String,
    pub redirect_uri: String,
    pub verifier: String,
    pub state: String,
    pub client_id: String,
}

fn normalize_secret(value: &str) -> String {
    value.trim().trim_matches(|ch| ch == '"' || ch == '\'').trim().to_owned()
}

pub fn emit_progress(app: &AppHandle, message: &str) {
    emit_sign_in_progress(
        app,
        SignInProgress {
            message: message.to_owned(),
            user_code: None,
            verification_uri: None,
        },
    );
}

pub fn emit_sign_in_progress(app: &AppHandle, payload: SignInProgress) {
    let _ = app.emit(PROGRESS_EVENT, payload);
}

pub fn resolve_client_id(stored: Option<&str>) -> AppResult<String> {
    if let Ok(value) = std::env::var("KURSOR_GITHUB_CLIENT_ID") {
        let value = normalize_secret(&value);
        if !value.is_empty() {
            return Ok(value);
        }
    }
    stored
        .map(normalize_secret)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AppError::InvalidRequest(
                "GitHub is not configured. Paste an OAuth client ID in Settings → GitHub, or set KURSOR_GITHUB_CLIENT_ID in .env.".to_owned(),
            )
        })
}

#[derive(Deserialize)]
struct ApiUser {
    id: i64,
    login: String,
    name: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
}

#[derive(Deserialize)]
struct ApiRepo {
    id: i64,
    name: String,
    full_name: String,
    html_url: String,
    clone_url: String,
    default_branch: Option<String>,
    private: bool,
    description: Option<String>,
    owner: ApiOwner,
}

#[derive(Deserialize)]
struct ApiOwner {
    login: String,
}

#[derive(Deserialize)]
struct ApiIssue {
    id: i64,
    number: i64,
    title: String,
    state: String,
    html_url: String,
    pull_request: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct ApiPull {
    id: i64,
    number: i64,
    title: String,
    state: String,
    html_url: String,
    head: ApiRef,
    base: ApiRef,
}

#[derive(Deserialize)]
struct ApiRef {
    #[serde(rename = "ref")]
    name: String,
}

#[derive(Deserialize)]
struct ApiRelease {
    id: i64,
    tag_name: String,
    name: Option<String>,
    html_url: String,
    draft: bool,
}

fn pkce_pair() -> (String, String) {
    let raw: [u8; 32] = rand::random();
    let verifier = URL_SAFE_NO_PAD.encode(raw);
    let digest = Sha256::digest(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(digest);
    (verifier, challenge)
}

fn bind_listener() -> AppResult<TcpListener> {
    TcpListener::bind(("127.0.0.1", OAUTH_PORT)).map_err(|_| {
        AppError::InvalidRequest(
            "Port 8742 is already in use. Close the other app using it, then try GitHub sign-in again.".to_owned(),
        )
    })
}

pub fn wait_for_code(listener: TcpListener, expected_state: &str) -> AppResult<String> {
    listener
        .set_nonblocking(true)
        .map_err(|_| AppError::InvalidRequest("Unable to start the GitHub sign-in callback server.".to_owned()))?;
    let deadline = Instant::now() + Duration::from_secs(180);
    let (mut stream, _) = loop {
        match listener.accept() {
            Ok(accepted) => break accepted,
            Err(error) if error.kind() == ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err(AppError::InvalidRequest("GitHub sign-in timed out. Approve the request in the browser, then try again.".to_owned()));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(_) => return Err(AppError::InvalidRequest("GitHub sign-in timed out.".to_owned())),
        }
    };
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let mut buf = [0_u8; 8192];
    let n = stream
        .read(&mut buf)
        .map_err(|_| AppError::InvalidRequest("GitHub sign-in failed.".to_owned()))?;
    let request = String::from_utf8_lossy(&buf[..n]);
    let first = request.lines().next().unwrap_or_default();
    let path = first.split_whitespace().nth(1).unwrap_or_default();
    let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
    let mut code = None;
    let mut state = None;
    let mut oauth_error = None;
    let mut oauth_description = None;
    for part in query.split('&') {
        if let Some((key, value)) = part.split_once('=') {
            let value = urlencoding::decode(value).unwrap_or_default().into_owned();
            match key {
                "code" => code = Some(value),
                "state" => state = Some(value),
                "error" => oauth_error = Some(value),
                "error_description" => oauth_description = Some(value.replace('+', " ")),
                _ => {}
            }
        }
    }
    let body = "<html><body style=\"font-family:sans-serif;background:#090b10;color:#e5e9f2;display:grid;place-items:center;height:100vh\"><p>Kursor is signed in. You can close this window.</p></body></html>";
    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    if let Some(error) = oauth_error {
        return Err(AppError::InvalidRequest(
            oauth_description.unwrap_or(error),
        ));
    }
    if state.as_deref() != Some(expected_state) {
        return Err(AppError::InvalidRequest("GitHub sign-in was rejected.".to_owned()));
    }
    code.ok_or_else(|| AppError::InvalidRequest("GitHub did not return an authorization code.".to_owned()))
}

fn parse_token_response(body: &str) -> AppResult<String> {
    let response: TokenResponse = serde_json::from_str(body)
        .map_err(|_| AppError::InvalidRequest("GitHub authentication failed.".to_owned()))?;
    if let Some(error) = response.error {
        return Err(AppError::InvalidRequest(
            response.error_description.unwrap_or(error),
        ));
    }
    response
        .access_token
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::InvalidRequest("GitHub did not return an access token.".to_owned()))
}

fn read_ureq_body(error: ureq::Error) -> String {
    match error {
        ureq::Error::Status(_, response) => response.into_string().unwrap_or_default(),
        other => other.to_string(),
    }
}

fn github_error_message(body: &str, fallback: &str) -> String {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(message) = value.get("message").and_then(|item| item.as_str()) {
            let message = message.trim();
            if !message.is_empty() {
                return message.to_owned();
            }
        }
    }
    let trimmed = body.trim();
    if trimmed.is_empty() {
        fallback.to_owned()
    } else {
        trimmed.chars().take(280).collect()
    }
}

pub fn exchange_token(client_id: &str, code: &str, redirect_uri: &str, verifier: &str) -> AppResult<String> {
    let mut form = format!(
        "client_id={}&code={}&redirect_uri={}&code_verifier={}&grant_type=authorization_code",
        urlencoding::encode(client_id),
        urlencoding::encode(code),
        urlencoding::encode(redirect_uri),
        urlencoding::encode(verifier)
    );
    if let Ok(secret) = std::env::var("KURSOR_GITHUB_CLIENT_SECRET") {
        let secret = normalize_secret(&secret);
        if !secret.is_empty() {
            form.push_str("&client_secret=");
            form.push_str(&urlencoding::encode(&secret));
        }
    }
    match ureq::post(TOKEN_URL)
        .set("Accept", "application/json")
        .set("User-Agent", USER_AGENT)
        .send_string(&form)
    {
        Ok(response) => {
            let body = response
                .into_string()
                .map_err(|_| AppError::InvalidRequest("GitHub authentication failed.".to_owned()))?;
            parse_token_response(&body)
        }
        Err(error) => {
            let body = read_ureq_body(error);
            if body.trim().is_empty() {
                Err(AppError::InvalidRequest("GitHub authentication failed.".to_owned()))
            } else {
                parse_token_response(&body).or_else(|_| {
                    Err(AppError::InvalidRequest(body.chars().take(280).collect()))
                })
            }
        }
    }
}

pub fn request_device_code(client_id: &str) -> AppResult<DeviceCodeResponse> {
    let form = format!(
        "client_id={}&scope={}",
        urlencoding::encode(client_id),
        urlencoding::encode(OAUTH_SCOPE)
    );
    let body = match ureq::post(DEVICE_CODE_URL)
        .set("Accept", "application/json")
        .set("User-Agent", USER_AGENT)
        .send_string(&form)
    {
        Ok(response) => response
            .into_string()
            .map_err(|_| AppError::InvalidRequest("GitHub device sign-in is unavailable.".to_owned()))?,
        Err(error) => {
            let body = read_ureq_body(error);
            return Err(AppError::InvalidRequest(if body.trim().is_empty() {
                "GitHub device sign-in is unavailable.".to_owned()
            } else {
                body.chars().take(280).collect()
            }));
        }
    };
    let response: DeviceCodeResponse = serde_json::from_str(&body)
        .map_err(|_| AppError::InvalidRequest("GitHub device sign-in is unavailable.".to_owned()))?;
    if let Some(error) = response.error {
        return Err(AppError::InvalidRequest(
            response.error_description.unwrap_or(error),
        ));
    }
    if response.device_code.is_empty() || response.user_code.is_empty() {
        return Err(AppError::InvalidRequest("GitHub device sign-in is unavailable.".to_owned()));
    }
    Ok(response)
}

pub fn poll_device_token(client_id: &str, device: DeviceCodeResponse) -> AppResult<String> {
    let mut interval = Duration::from_secs(device.interval.unwrap_or(5).max(1) as u64);
    let deadline = Instant::now() + Duration::from_secs(device.expires_in.max(30));
    let form = format!(
        "client_id={}&device_code={}&grant_type={}",
        urlencoding::encode(client_id),
        urlencoding::encode(&device.device_code),
        urlencoding::encode("urn:ietf:params:oauth:grant-type:device_code")
    );
    loop {
        if Instant::now() >= deadline {
            return Err(AppError::InvalidRequest("GitHub sign-in timed out.".to_owned()));
        }
        std::thread::sleep(interval);
        let body = match ureq::post(TOKEN_URL)
            .set("Accept", "application/json")
            .set("User-Agent", USER_AGENT)
            .send_string(&form)
        {
            Ok(response) => response.into_string().unwrap_or_default(),
            Err(error) => read_ureq_body(error),
        };
        if let Ok(token) = parse_token_response(&body) {
            return Ok(token);
        }
        if let Ok(response) = serde_json::from_str::<TokenResponse>(&body) {
            match response.error.as_deref() {
                Some("authorization_pending") => continue,
                Some("slow_down") => {
                    interval += Duration::from_secs(5);
                    continue;
                }
                Some("expired_token") => {
                    return Err(AppError::InvalidRequest("GitHub sign-in timed out.".to_owned()));
                }
                Some("access_denied") => {
                    return Err(AppError::InvalidRequest("GitHub sign-in was denied.".to_owned()));
                }
                Some(error) => {
                    return Err(AppError::InvalidRequest(
                        response.error_description.unwrap_or_else(|| error.to_owned()),
                    ));
                }
                None => continue,
            }
        }
    }
}

pub fn prepare_pkce(client_id: &str) -> AppResult<PkceSession> {
    let listener = bind_listener()?;
    let redirect_uri = format!("http://127.0.0.1:{OAUTH_PORT}/callback");
    let (verifier, challenge) = pkce_pair();
    let state = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 16]>());
    let authorize_url = format!(
        "{AUTH_URL}?client_id={}&redirect_uri={}&scope={}&state={}&code_challenge={}&code_challenge_method=S256",
        urlencoding::encode(client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(OAUTH_SCOPE),
        urlencoding::encode(&state),
        urlencoding::encode(&challenge)
    );
    Ok(PkceSession {
        listener,
        authorize_url,
        redirect_uri,
        verifier,
        state,
        client_id: client_id.to_owned(),
    })
}

pub fn store_token(secrets: &SecretStore, token: String) -> AppResult<()> {
    secrets.set(GITHUB_TOKEN_KEY, token)
}

fn authorized_get(token: &str, path: &str) -> AppResult<ureq::Response> {
    ureq::get(&format!("{API_URL}{path}"))
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", USER_AGENT)
        .set("Authorization", &format!("Bearer {token}"))
        .call()
        .map_err(|_| AppError::InvalidRequest("GitHub is unavailable.".to_owned()))
}

fn authorized_post(token: &str, path: &str, body: serde_json::Value) -> AppResult<ureq::Response> {
    ureq::post(&format!("{API_URL}{path}"))
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", USER_AGENT)
        .set("Authorization", &format!("Bearer {token}"))
        .send_json(body)
        .map_err(|error| match error {
            ureq::Error::Status(status, _) if status == 422 || status == 409 => {
                AppError::InvalidRequest("GitHub rejected this request because it already exists.".to_owned())
            }
            _ => AppError::InvalidRequest("GitHub is unavailable.".to_owned()),
        })
}

pub fn sign_out(secrets: &SecretStore) -> AppResult<()> {
    secrets.delete(GITHUB_TOKEN_KEY)?;
    let _ = secrets.delete("GITHUB_REFRESH_TOKEN");
    Ok(())
}

pub fn is_authenticated(secrets: &SecretStore) -> bool {
    secrets
        .get(GITHUB_TOKEN_KEY)
        .ok()
        .flatten()
        .is_some()
}

fn token(secrets: &SecretStore) -> AppResult<String> {
    secrets
        .get(GITHUB_TOKEN_KEY)?
        .ok_or_else(|| AppError::InvalidRequest("GitHub is not connected.".to_owned()))
}

pub fn access_token(secrets: &SecretStore) -> AppResult<Option<String>> {
    secrets.get(GITHUB_TOKEN_KEY)
}

pub fn current_user(secrets: &SecretStore) -> AppResult<Option<GitHubUser>> {
    let Ok(token) = token(secrets) else {
        return Ok(None);
    };
    let user: ApiUser = authorized_get(&token, "/user")?
        .into_json()
        .map_err(|_| AppError::InvalidRequest("Unable to load the GitHub profile.".to_owned()))?;
    Ok(Some(GitHubUser {
        id: user.id.to_string(),
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        email: user.email,
    }))
}

pub fn list_repositories(secrets: &SecretStore, query: Option<&str>) -> AppResult<Vec<GitHubRepository>> {
    let token = token(secrets)?;
    let mut repos: Vec<ApiRepo> = authorized_get(&token, "/user/repos?per_page=100&sort=updated")?
        .into_json()
        .map_err(|_| AppError::InvalidRequest("Unable to list GitHub repositories.".to_owned()))?;
    if let Some(query) = query.map(str::trim).filter(|value| !value.is_empty()) {
        let needle = query.to_lowercase();
        repos.retain(|repo| {
            repo.full_name.to_lowercase().contains(&needle) || repo.name.to_lowercase().contains(&needle)
        });
    }
    Ok(repos.into_iter().map(map_repo).collect())
}

pub fn get_repository(secrets: &SecretStore, owner: &str, name: &str) -> AppResult<GitHubRepository> {
    let token = token(secrets)?;
    let repo: ApiRepo = authorized_get(&token, &format!("/repos/{owner}/{name}"))?
        .into_json()
        .map_err(|_| AppError::InvalidRequest("Repository unavailable.".to_owned()))?;
    Ok(map_repo(repo))
}

pub fn create_repository(secrets: &SecretStore, name: &str, private: bool) -> AppResult<GitHubRepository> {
    let token = token(secrets)?;
    let body = serde_json::json!({ "name": name, "private": private });
    match ureq::post(&format!("{API_URL}/user/repos"))
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", USER_AGENT)
        .set("Authorization", &format!("Bearer {token}"))
        .send_json(body)
    {
        Ok(response) => {
            let repo: ApiRepo = response
                .into_json()
                .map_err(|_| AppError::InvalidRequest("Unable to create the GitHub repository.".to_owned()))?;
            Ok(map_repo(repo))
        }
        Err(ureq::Error::Status(status, _)) if status == 422 || status == 409 => {
            let login = current_user(secrets)?
                .map(|user| user.login)
                .ok_or_else(|| AppError::InvalidRequest("GitHub is not connected.".to_owned()))?;
            get_repository(secrets, &login, name)
        }
        Err(error) => Err(AppError::InvalidRequest(github_error_message(
            &read_ureq_body(error),
            "Unable to create the GitHub repository.",
        ))),
    }
}

pub fn list_issues(secrets: &SecretStore, owner: &str, repo: &str) -> AppResult<Vec<GitHubIssue>> {
    let token = token(secrets)?;
    let issues: Vec<ApiIssue> = authorized_get(&token, &format!("/repos/{owner}/{repo}/issues?state=open&per_page=50"))?
        .into_json()
        .map_err(|_| AppError::InvalidRequest("Unable to list issues.".to_owned()))?;
    Ok(issues
        .into_iter()
        .filter(|issue| issue.pull_request.is_none())
        .map(|issue| GitHubIssue {
            id: issue.id.to_string(),
            number: issue.number,
            title: issue.title,
            state: issue.state,
            html_url: issue.html_url,
        })
        .collect())
}

pub fn create_issue(secrets: &SecretStore, owner: &str, repo: &str, title: &str, body: Option<&str>) -> AppResult<GitHubIssue> {
    let token = token(secrets)?;
    let issue: ApiIssue = authorized_post(
        &token,
        &format!("/repos/{owner}/{repo}/issues"),
        serde_json::json!({ "title": title, "body": body.unwrap_or("") }),
    )?
    .into_json()
    .map_err(|_| AppError::InvalidRequest("Unable to create the issue.".to_owned()))?;
    Ok(GitHubIssue {
        id: issue.id.to_string(),
        number: issue.number,
        title: issue.title,
        state: issue.state,
        html_url: issue.html_url,
    })
}

pub fn list_pulls(secrets: &SecretStore, owner: &str, repo: &str) -> AppResult<Vec<GitHubPull>> {
    let token = token(secrets)?;
    let pulls: Vec<ApiPull> = authorized_get(&token, &format!("/repos/{owner}/{repo}/pulls?state=open&per_page=50"))?
        .into_json()
        .map_err(|_| AppError::InvalidRequest("Unable to list pull requests.".to_owned()))?;
    Ok(pulls
        .into_iter()
        .map(|pull| GitHubPull {
            id: pull.id.to_string(),
            number: pull.number,
            title: pull.title,
            state: pull.state,
            html_url: pull.html_url,
            head: pull.head.name,
            base: pull.base.name,
        })
        .collect())
}

pub fn create_pull(
    secrets: &SecretStore,
    owner: &str,
    repo: &str,
    title: &str,
    head: &str,
    base: &str,
    body: Option<&str>,
) -> AppResult<GitHubPull> {
    let token = token(secrets)?;
    let pull: ApiPull = authorized_post(
        &token,
        &format!("/repos/{owner}/{repo}/pulls"),
        serde_json::json!({ "title": title, "head": head, "base": base, "body": body.unwrap_or("") }),
    )?
    .into_json()
    .map_err(|_| AppError::InvalidRequest("Unable to create the pull request.".to_owned()))?;
    Ok(GitHubPull {
        id: pull.id.to_string(),
        number: pull.number,
        title: pull.title,
        state: pull.state,
        html_url: pull.html_url,
        head: pull.head.name,
        base: pull.base.name,
    })
}

pub fn list_releases(secrets: &SecretStore, owner: &str, repo: &str) -> AppResult<Vec<GitHubRelease>> {
    let token = token(secrets)?;
    let releases: Vec<ApiRelease> = authorized_get(&token, &format!("/repos/{owner}/{repo}/releases?per_page=30"))?
        .into_json()
        .map_err(|_| AppError::InvalidRequest("Unable to list releases.".to_owned()))?;
    Ok(releases
        .into_iter()
        .map(|release| GitHubRelease {
            id: release.id.to_string(),
            tag_name: release.tag_name.clone(),
            name: release.name.unwrap_or(release.tag_name),
            html_url: release.html_url,
            draft: release.draft,
        })
        .collect())
}

pub fn create_release(
    secrets: &SecretStore,
    owner: &str,
    repo: &str,
    tag: &str,
    name: Option<&str>,
    body: Option<&str>,
) -> AppResult<GitHubRelease> {
    let token = token(secrets)?;
    let release: ApiRelease = authorized_post(
        &token,
        &format!("/repos/{owner}/{repo}/releases"),
        serde_json::json!({
            "tag_name": tag,
            "name": name.unwrap_or(tag),
            "body": body.unwrap_or(""),
            "draft": false
        }),
    )?
    .into_json()
    .map_err(|_| AppError::InvalidRequest("Unable to create the release.".to_owned()))?;
    Ok(GitHubRelease {
        id: release.id.to_string(),
        tag_name: release.tag_name.clone(),
        name: release.name.unwrap_or(release.tag_name),
        html_url: release.html_url,
        draft: release.draft,
    })
}

pub fn parse_github_remote(url: &str) -> Option<(String, String)> {
    let trimmed = url.trim();
    let marker = if let Some(index) = trimmed.find("github.com/") {
        index + "github.com/".len()
    } else if let Some(index) = trimmed.find("github.com:") {
        index + "github.com:".len()
    } else {
        return None;
    };
    let rest = trimmed[marker..].trim_end_matches('/');
    let rest = rest.strip_suffix(".git").unwrap_or(rest);
    let mut parts = rest.split('/');
    let owner = parts.next()?.trim();
    let repo = parts.next()?.trim().trim_end_matches(".git");
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner.to_owned(), repo.to_owned()))
}

fn map_repo(repo: ApiRepo) -> GitHubRepository {
    GitHubRepository {
        id: repo.id.to_string(),
        name: repo.name,
        full_name: repo.full_name,
        owner: repo.owner.login,
        html_url: repo.html_url,
        clone_url: repo.clone_url,
        default_branch: repo.default_branch.unwrap_or_else(|| "main".to_owned()),
        private: repo.private,
        description: repo.description,
    }
}

pub fn open_browser(app: &AppHandle, url: &str) -> AppResult<()> {
    if app.opener().open_url(url, None::<&str>).is_ok() {
        return Ok(());
    }
    let result = {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("cmd")
                .arg("/C")
                .arg(format!("start \"\" \"{url}\""))
                .spawn()
                .or_else(|_| {
                    std::process::Command::new("powershell")
                        .args([
                            "-NoProfile",
                            "-Command",
                            &format!("Start-Process '{}'", url.replace('\'', "''")),
                        ])
                        .spawn()
                })
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open").arg(url).spawn()
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            std::process::Command::new("xdg-open").arg(url).spawn()
        }
    };
    result
        .map(|_| ())
        .map_err(|_| AppError::InvalidRequest(
            format!("Unable to open the browser. Open this URL manually: {url}"),
        ))
}

#[cfg(test)]
mod tests {
    use super::parse_github_remote;

    #[test]
    fn parses_github_remotes() {
        assert_eq!(
            parse_github_remote("git@github.com:acme/app.git"),
            Some(("acme".to_owned(), "app".to_owned()))
        );
        assert_eq!(
            parse_github_remote("https://github.com/acme/app.git"),
            Some(("acme".to_owned(), "app".to_owned()))
        );
        assert_eq!(
            parse_github_remote("https://x-access-token:secret@github.com/acme/app"),
            Some(("acme".to_owned(), "app".to_owned()))
        );
    }
}
