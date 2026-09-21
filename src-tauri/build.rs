use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let version = frontend_version(&manifest_dir);
    println!("cargo:rustc-env=KURSOR_VERSION={version}");
    sync_cargo_toml_version(&manifest_dir, &version);
    tauri_build::build();
}

fn frontend_version(manifest_dir: &Path) -> String {
    let package_json = manifest_dir.join("../package.json");
    println!("cargo:rerun-if-changed={}", package_json.display());
    let text = fs::read_to_string(&package_json).expect("failed to read ../package.json");
    parse_package_version(&text)
}

fn parse_package_version(text: &str) -> String {
    for line in text.lines() {
        let trimmed = line.trim().trim_end_matches(',');
        let Some(rest) = trimmed.strip_prefix("\"version\"") else {
            continue;
        };
        let value = rest.trim().trim_start_matches(':').trim().trim_matches('"');
        if !value.is_empty() {
            return value.to_string();
        }
    }
    panic!("package.json is missing a version field");
}

fn sync_cargo_toml_version(manifest_dir: &Path, version: &str) {
    let path = manifest_dir.join("Cargo.toml");
    let text = fs::read_to_string(&path).expect("failed to read Cargo.toml");
    let expected = format!("version = \"{version}\"");
    let mut replaced = false;
    let mut out = String::with_capacity(text.len());
    for (index, line) in text.lines().enumerate() {
        if index > 0 {
            out.push('\n');
        }
        if !replaced && line.starts_with("version = \"") {
            out.push_str(&expected);
            replaced = true;
            continue;
        }
        out.push_str(line);
    }
    if text.ends_with('\n') {
        out.push('\n');
    }
    if !replaced {
        panic!("Cargo.toml is missing a package version");
    }
    if out != text {
        fs::write(&path, out).expect("failed to sync Cargo.toml version");
    }
}
