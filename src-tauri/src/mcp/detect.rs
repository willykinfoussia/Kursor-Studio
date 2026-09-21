use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

const BLENDER_REQUIRED: &str = "5.1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedExecutable {
    pub name: String,
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub display_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlenderInstallation {
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub compatible: bool,
    pub required: String,
}

pub fn which(name: &str) -> DetectedExecutable {
    let program = resolve_lookup_name(name);
    if let Some(path) = find_on_path(&program) {
        return DetectedExecutable {
            name: name.into(),
            found: true,
            version: version_of(&path),
            display_path: Some(path.clone()),
            path: Some(path),
        };
    }
    DetectedExecutable {
        name: name.into(),
        found: false,
        path: None,
        version: None,
        display_path: None,
    }
}

pub fn detect_blender() -> BlenderInstallation {
    let mut candidates = Vec::new();
    if let Some(path) = find_on_path("blender") {
        candidates.push(path);
    }
    #[cfg(windows)]
    {
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".into());
        let foundation = PathBuf::from(program_files).join("Blender Foundation");
        if let Ok(entries) = std::fs::read_dir(foundation) {
            for entry in entries.flatten() {
                let exe = entry.path().join("blender.exe");
                if exe.is_file() {
                    candidates.push(exe.to_string_lossy().into_owned());
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let app = PathBuf::from("/Applications/Blender.app/Contents/MacOS/Blender");
        if app.is_file() {
            candidates.push(app.to_string_lossy().into_owned());
        }
    }
    #[cfg(target_os = "linux")]
    {
        for path in ["/usr/bin/blender", "/usr/local/bin/blender", "/snap/bin/blender"] {
            if Path::new(path).is_file() {
                candidates.push(path.to_string());
            }
        }
    }
    let Some(path) = candidates.into_iter().next() else {
        return BlenderInstallation {
            installed: false,
            path: None,
            version: None,
            compatible: false,
            required: BLENDER_REQUIRED.into(),
        };
    };
    let version = version_of(&path);
    let compatible = version.as_deref().is_some_and(blender_compatible);
    BlenderInstallation {
        installed: true,
        path: Some(path),
        version,
        compatible,
        required: BLENDER_REQUIRED.into(),
    }
}

pub fn probe_tcp(host: &str, port: u16) -> bool {
    let Ok(addr) = format!("{host}:{port}").parse() else { return false };
    std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok()
}

fn blender_compatible(version: &str) -> bool {
    let mut parts = version.split(|ch: char| !ch.is_ascii_digit()).filter(|part| !part.is_empty());
    let major = parts.next().and_then(|value| value.parse::<u32>().ok()).unwrap_or(0);
    let minor = parts.next().and_then(|value| value.parse::<u32>().ok()).unwrap_or(0);
    major > 5 || (major == 5 && minor >= 1)
}

fn version_of(path: &str) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().next()?.trim();
    let version = line.split_whitespace().find(|token| token.chars().next().is_some_and(|ch| ch.is_ascii_digit()))?;
    Some(version.trim_start_matches('v').to_string())
}

fn find_on_path(name: &str) -> Option<String> {
    if Path::new(name).exists() {
        return Some(name.to_string());
    }
    let path = std::env::var("PATH").ok()?;
    std::env::split_paths(&path).find_map(|dir| {
        let direct = dir.join(name);
        if direct.is_file() {
            return Some(direct.to_string_lossy().into_owned());
        }
        for ext in [".exe", ".cmd", ".bat"] {
            let candidate = dir.join(format!("{name}{ext}"));
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
        None
    })
}

fn resolve_lookup_name(name: &str) -> String {
    #[cfg(windows)]
    {
        if name.eq_ignore_ascii_case("npx") {
            return "npx.cmd".into();
        }
        if name.eq_ignore_ascii_case("npm") {
            return "npm.cmd".into();
        }
    }
    name.to_string()
}

#[cfg(test)]
mod tests {
    use super::blender_compatible;

    #[test]
    fn blender_51_is_compatible() {
        assert!(blender_compatible("5.1.0"));
        assert!(blender_compatible("5.2"));
        assert!(!blender_compatible("4.5.1"));
    }
}
