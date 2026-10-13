use crate::error::{AppError, AppResult};
use crate::state::AppState;
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use tar::Archive;
use tauri::State;
use zip::ZipArchive;

pub const NODE_VERSION: &str = "22.23.3";
pub const UV_VERSION: &str = "0.13.0";
pub const CODEGRAPH_VERSION: &str = "1.6.2";
pub const GRAPHIFY_VERSION: &str = "0.9.88";

const PINS: InstallMarker = InstallMarker {
    node: NODE_VERSION,
    uv: UV_VERSION,
    codegraph: CODEGRAPH_VERSION,
    graphify: GRAPHIFY_VERSION,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallMarker {
    pub node: &'static str,
    pub uv: &'static str,
    pub codegraph: &'static str,
    pub graphify: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredMarker {
    node: String,
    uv: String,
    codegraph: String,
    graphify: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeIntelTools {
    pub codegraph: String,
    pub graphify: String,
}

struct ArchiveSpec {
    url: String,
    sha256: &'static str,
    gzip: bool,
}

fn needs_install(saved: Option<&StoredMarker>, pins: &InstallMarker, binaries_present: bool) -> bool {
    if !binaries_present {
        return true;
    }
    let Some(saved) = saved else {
        return true;
    };
    saved.node != pins.node
        || saved.uv != pins.uv
        || saved.codegraph != pins.codegraph
        || saved.graphify != pins.graphify
}

fn install_lock() -> &'static Mutex<()> {
    static LOCK: Mutex<()> = Mutex::new(());
    &LOCK
}

#[tauri::command]
pub async fn code_intel_ensure(state: State<'_, AppState>) -> AppResult<CodeIntelTools> {
    let data_dir = state.db.data_dir.clone();
    match tauri::async_runtime::spawn_blocking(move || ensure(&data_dir)).await {
        Ok(result) => result,
        Err(error) => Err(AppError::InvalidRequest(error.to_string())),
    }
}

pub fn ensure(data_dir: &Path) -> AppResult<CodeIntelTools> {
    let _guard = install_lock().lock().unwrap_or_else(|error| error.into_inner());
    let root = data_dir.join("tools").join("code-intel");
    fs::create_dir_all(&root)?;
    let codegraph = launcher_path(&root);
    let graphify = graphify_binary(&root);
    let saved = read_marker(&root.join("installed.json"));
    if !needs_install(saved.as_ref(), &PINS, codegraph.is_file() && graphify.is_file()) {
        return Ok(CodeIntelTools {
            codegraph: codegraph.to_string_lossy().into_owned(),
            graphify: graphify.to_string_lossy().into_owned(),
        });
    }

    let node_home = ensure_runtime(&root, "node", node_archive()?, &["node.exe", "node"])?;
    let uv_binary = ensure_runtime(&root, "uv", uv_archive()?, &["uv.exe", "uv"])?;
    install_codegraph(&root, &node_home)?;
    install_graphify(&root, &uv_binary)?;
    write_codegraph_launcher(&root, &node_home)?;
    let codegraph = launcher_path(&root);
    let graphify = graphify_binary(&root);
    if !codegraph.is_file() || !graphify.is_file() {
        return Err(AppError::InvalidRequest(
            "Code intelligence install finished without both executables.".into(),
        ));
    }
    write_marker(&root.join("installed.json"))?;
    Ok(CodeIntelTools {
        codegraph: codegraph.to_string_lossy().into_owned(),
        graphify: graphify.to_string_lossy().into_owned(),
    })
}

fn node_archive() -> AppResult<ArchiveSpec> {
    let (name, sha256, gzip) = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => (
            "node-v22.23.3-win-x64.zip",
            "2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71",
            false,
        ),
        ("macos", "aarch64") => (
            "node-v22.23.3-darwin-arm64.tar.gz",
            "23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53",
            true,
        ),
        ("macos", "x86_64") => (
            "node-v22.23.3-darwin-x64.tar.gz",
            "8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8",
            true,
        ),
        ("linux", "x86_64") => (
            "node-v22.23.3-linux-x64.tar.gz",
            "1084aa36196bba4c3a5e69a1ee388a6e4ff729dad09445fbcd434b28fe3c24af",
            true,
        ),
        (os, arch) => {
            return Err(AppError::InvalidRequest(format!(
                "No private Node build for {os} {arch}."
            )))
        }
    };
    Ok(ArchiveSpec {
        url: format!("https://nodejs.org/dist/v{NODE_VERSION}/{name}"),
        sha256,
        gzip,
    })
}

fn uv_archive() -> AppResult<ArchiveSpec> {
    let (name, sha256, gzip) = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => (
            "uv-x86_64-pc-windows-msvc.zip",
            "088962f9e7b7bd9ea740c04c650b2a21c8928c345bd99ac24350dc924dba656c",
            false,
        ),
        ("macos", "aarch64") => (
            "uv-aarch64-apple-darwin.tar.gz",
            "a9c1b29002cf3c83f07fa9cd8a887a3be0107d90e23189721221e7257db8e3d6",
            true,
        ),
        ("macos", "x86_64") => (
            "uv-x86_64-apple-darwin.tar.gz",
            "5f44dcbde809b632f47c36fadb241cb4d6f9af71d0c8f172b5d2026d3dde742c",
            true,
        ),
        ("linux", "x86_64") => (
            "uv-x86_64-unknown-linux-gnu.tar.gz",
            "1468ebd5a5541121837c5a2817b9972ba6090fa6caa3d142620850a47fb75154",
            true,
        ),
        (os, arch) => {
            return Err(AppError::InvalidRequest(format!(
                "No private uv build for {os} {arch}."
            )))
        }
    };
    Ok(ArchiveSpec {
        url: format!("https://github.com/astral-sh/uv/releases/download/{UV_VERSION}/{name}"),
        sha256,
        gzip,
    })
}

fn ensure_runtime(root: &Path, folder: &str, archive: ArchiveSpec, names: &[&str]) -> AppResult<PathBuf> {
    let dest = root.join("runtimes").join(folder);
    let stamp = root.join("runtimes").join(format!("{folder}.version"));
    if stamp.is_file() && fs::read_to_string(&stamp).ok().as_deref().map(str::trim) == Some(archive_version(folder)) {
        if let Some(binary) = find_named(&dest, names) {
            return Ok(binary);
        }
    }
    let _ = fs::remove_dir_all(&dest);
    fs::create_dir_all(&dest)?;
    let bytes = download(&archive.url, archive.sha256)?;
    if archive.gzip {
        extract_tar_gz(&bytes, &dest)?;
    } else {
        extract_zip(&bytes, &dest)?;
    }
    let binary = find_named(&dest, names).ok_or_else(|| {
        AppError::InvalidRequest(format!("Downloaded {folder} archive did not contain the executable."))
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&binary, fs::Permissions::from_mode(0o755));
    }
    fs::write(&stamp, archive_version(folder))?;
    Ok(binary)
}

fn archive_version(folder: &str) -> &'static str {
    if folder == "node" { NODE_VERSION } else { UV_VERSION }
}

fn download(url: &str, expected: &str) -> AppResult<Vec<u8>> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(600))
        .build();
    let response = agent
        .get(url)
        .set("User-Agent", "Kursor")
        .call()
        .map_err(|error| AppError::InvalidRequest(format!("Download failed for {url}: {error}")))?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(80 * 1024 * 1024)
        .read_to_end(&mut bytes)
        .map_err(|error| AppError::InvalidRequest(format!("Download failed for {url}: {error}")))?;
    let actual = hex::encode(Sha256::digest(&bytes));
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(AppError::InvalidRequest(format!(
            "Checksum mismatch for {url}."
        )));
    }
    Ok(bytes)
}

fn extract_zip(bytes: &[u8], dest: &Path) -> AppResult<()> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| AppError::InvalidRequest(format!("Invalid zip archive: {error}")))?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| AppError::InvalidRequest(format!("Invalid zip entry: {error}")))?;
        let Some(relative) = file.enclosed_name().map(|path| path.to_path_buf()) else {
            continue;
        };
        let target = dest.join(relative);
        if file.is_dir() {
            fs::create_dir_all(&target)?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut output = fs::File::create(&target)?;
        std::io::copy(&mut file, &mut output)?;
    }
    Ok(())
}

fn extract_tar_gz(bytes: &[u8], dest: &Path) -> AppResult<()> {
    let mut archive = Archive::new(GzDecoder::new(Cursor::new(bytes)));
    for entry in archive
        .entries()
        .map_err(|error| AppError::InvalidRequest(format!("Invalid tar archive: {error}")))?
    {
        let mut entry = entry.map_err(|error| AppError::InvalidRequest(format!("Invalid tar entry: {error}")))?;
        let path = entry
            .path()
            .map_err(|error| AppError::InvalidRequest(format!("Invalid tar path: {error}")))?;
        if !path_is_safe(&path) {
            continue;
        }
        let target = dest.join(path);
        if entry.header().entry_type().is_dir() {
            fs::create_dir_all(&target)?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        entry
            .unpack(&target)
            .map_err(|error| AppError::InvalidRequest(format!("Unable to unpack {target:?}: {error}")))?;
    }
    Ok(())
}

fn path_is_safe(path: &Path) -> bool {
    !path.is_absolute() && !path.components().any(|component| matches!(component, Component::ParentDir))
}

fn find_named(dir: &Path, names: &[&str]) -> Option<PathBuf> {
    let mut stack = vec![(dir.to_path_buf(), 0usize)];
    while let Some((current, depth)) = stack.pop() {
        if depth > 3 {
            continue;
        }
        let Ok(entries) = fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push((path, depth + 1));
                continue;
            }
            let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            if names.iter().any(|wanted| *wanted == name) {
                return Some(path);
            }
        }
    }
    None
}

fn install_codegraph(root: &Path, node_binary: &Path) -> AppResult<()> {
    let prefix = root.join("codegraph");
    let _ = fs::remove_dir_all(&prefix);
    fs::create_dir_all(&prefix)?;
    let node_home = node_binary.parent().unwrap_or(node_binary);
    let npm = if cfg!(windows) {
        node_home.join("npm.cmd")
    } else {
        node_home.join("npm")
    };
    run_command(
        &npm,
        &[
            "install".into(),
            "--prefix".into(),
            prefix.to_string_lossy().into_owned(),
            "--no-fund".into(),
            "--no-audit".into(),
            format!("@colbymchenry/codegraph@{CODEGRAPH_VERSION}"),
        ],
        node_home,
        &[],
    )
}

fn install_graphify(root: &Path, uv_binary: &Path) -> AppResult<()> {
    let bin = root.join("bin");
    let tools = root.join("uv-tools");
    let python = root.join("python");
    let cache = root.join("uv-cache");
    fs::create_dir_all(&bin)?;
    fs::create_dir_all(&tools)?;
    fs::create_dir_all(&python)?;
    let bin_dir = bin.to_string_lossy().into_owned();
    let tools_dir = tools.to_string_lossy().into_owned();
    let python_dir = python.to_string_lossy().into_owned();
    let cache_dir = cache.to_string_lossy().into_owned();
    run_command(
        uv_binary,
        &[
            "tool".into(),
            "install".into(),
            "--force".into(),
            format!("graphifyy[mcp,watch]=={GRAPHIFY_VERSION}"),
        ],
        uv_binary.parent().unwrap_or(uv_binary),
        &[
            ("UV_TOOL_BIN_DIR", bin_dir.as_str()),
            ("UV_TOOL_DIR", tools_dir.as_str()),
            ("UV_PYTHON_INSTALL_DIR", python_dir.as_str()),
            ("UV_CACHE_DIR", cache_dir.as_str()),
        ],
    )
}

fn write_codegraph_launcher(root: &Path, node_binary: &Path) -> AppResult<()> {
    let node_home = node_binary.parent().unwrap_or(node_binary);
    let shim = codegraph_shim(root);
    if !shim.is_file() {
        return Err(AppError::InvalidRequest(
            "CodeGraph installed without a node shim.".into(),
        ));
    }
    let bin = root.join("bin");
    fs::create_dir_all(&bin)?;
    if cfg!(windows) {
        let body = format!(
            "@echo off\r\nset \"PATH={};%PATH%\"\r\ncall \"{}\" %*\r\n",
            node_home.display(),
            shim.display()
        );
        fs::write(bin.join("codegraph.cmd"), body)?;
    } else {
        let path = bin.join("codegraph");
        let body = format!(
            "#!/bin/sh\nexport PATH=\"{}:$PATH\"\nexec \"{}\" \"$@\"\n",
            node_home.display(),
            shim.display()
        );
        fs::write(&path, body)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o755));
        }
    }
    Ok(())
}

fn codegraph_shim(root: &Path) -> PathBuf {
    let bin = root.join("codegraph").join("node_modules").join(".bin");
    if cfg!(windows) {
        bin.join("codegraph.cmd")
    } else {
        bin.join("codegraph")
    }
}

fn launcher_path(root: &Path) -> PathBuf {
    if cfg!(windows) {
        root.join("bin").join("codegraph.cmd")
    } else {
        root.join("bin").join("codegraph")
    }
}

fn graphify_binary(root: &Path) -> PathBuf {
    let bin = root.join("bin");
    for name in ["graphify.exe", "graphify.cmd", "graphify"] {
        let path = bin.join(name);
        if path.is_file() {
            return path;
        }
    }
    if cfg!(windows) {
        bin.join("graphify.exe")
    } else {
        bin.join("graphify")
    }
}

fn run_command(program: &Path, args: &[String], path_prefix: &Path, extra: &[(&str, &str)]) -> AppResult<()> {
    let path_value = joined_path(path_prefix);
    let mut command = if is_script(program) {
        let mut cmd = Command::new("cmd.exe");
        cmd.args(["/d", "/s", "/c", &command_line(program, args)]);
        cmd
    } else {
        let mut cmd = Command::new(program);
        cmd.args(args);
        cmd
    };
    command.env("PATH", path_value);
    for (key, value) in extra {
        command.env(key, value);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let output = command.output().map_err(|error| {
        AppError::InvalidRequest(format!("Unable to start {}: {error}", program.display()))
    })?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = if stderr.trim().is_empty() { stdout } else { stderr };
    let clipped: String = detail.chars().take(2_000).collect();
    Err(AppError::InvalidRequest(format!(
        "{} failed.\n{clipped}",
        program.file_name().and_then(|name| name.to_str()).unwrap_or("command")
    )))
}

fn is_script(program: &Path) -> bool {
    program
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("cmd") || value.eq_ignore_ascii_case("bat"))
}

fn command_line(program: &Path, args: &[String]) -> String {
    std::iter::once(program.to_string_lossy().into_owned())
        .chain(args.iter().cloned())
        .map(|part| quote_arg(&part))
        .collect::<Vec<_>>()
        .join(" ")
}

fn quote_arg(value: &str) -> String {
    if value.is_empty() || value.chars().any(|ch| ch.is_whitespace() || matches!(ch, '"' | '&' | '|' | '<' | '>')) {
        format!("\"{}\"", value.replace('"', "\\\""))
    } else {
        value.to_string()
    }
}

fn joined_path(prefix: &Path) -> String {
    let mut path = prefix.display().to_string();
    if let Ok(existing) = std::env::var("PATH") {
        path.push(if cfg!(windows) { ';' } else { ':' });
        path.push_str(&existing);
    }
    path
}

fn read_marker(path: &Path) -> Option<StoredMarker> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_marker(path: &Path) -> AppResult<()> {
    let stored = StoredMarker {
        node: PINS.node.into(),
        uv: PINS.uv.into(),
        codegraph: PINS.codegraph.into(),
        graphify: PINS.graphify.into(),
    };
    let text = serde_json::to_string_pretty(&stored)
        .map_err(|error| AppError::InvalidRequest(error.to_string()))?;
    let mut file = fs::File::create(path)?;
    file.write_all(text.as_bytes())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{needs_install, InstallMarker, StoredMarker, PINS};

    fn stored(node: &str, codegraph: &str) -> StoredMarker {
        StoredMarker {
            node: node.into(),
            uv: PINS.uv.into(),
            codegraph: codegraph.into(),
            graphify: PINS.graphify.into(),
        }
    }

    #[test]
    fn current_marker_skips_install_when_binaries_exist() {
        let saved = stored(PINS.node, PINS.codegraph);
        assert!(!needs_install(Some(&saved), &PINS, true));
    }

    #[test]
    fn version_change_or_missing_binaries_reinstall() {
        let saved = stored("0.0.1", PINS.codegraph);
        assert!(needs_install(Some(&saved), &PINS, true));
        let current = stored(PINS.node, PINS.codegraph);
        assert!(needs_install(Some(&current), &PINS, false));
        assert!(needs_install(None, &PINS, true));
        let _: &InstallMarker = &PINS;
    }
}
