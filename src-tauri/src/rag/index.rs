use crate::database::{records::IndexFilePlan, Database};
use crate::error::AppResult;
use crate::filesystem::{is_binary_extension, to_relative, DEFAULT_EXCLUDED_DIRECTORIES};
use sha2::{Digest, Sha256};
use std::path::Path;

const INDEXABLE_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "md", "markdown", "css", "scss",
    "html", "htm", "rs", "py", "go", "java", "kt", "c", "h", "cpp", "hpp", "cs", "rb",
    "php", "sql", "toml", "yaml", "yml", "xml", "txt", "sh", "bash",
];

pub fn should_ignore(root: &Path, path: &Path, extra: &[String]) -> bool {
    let Ok(relative) = to_relative(root, path) else {
        return true;
    };
    if relative.split('/').any(|segment| {
        DEFAULT_EXCLUDED_DIRECTORIES.contains(&segment)
            || extra.iter().any(|pattern| pattern == segment || pattern == &relative)
    }) {
        return true;
    }
    if path.file_name().and_then(|name| name.to_str()) == Some(".env") {
        return true;
    }
    if is_binary_extension(path) {
        return true;
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if extension.is_empty() {
        return true;
    }
    !INDEXABLE_EXTENSIONS.contains(&extension.as_str())
}

pub fn hash_bytes(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn language_of(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
}

pub fn plan_index(
    database: &Database,
    project_id: &str,
    root: &Path,
    extra_ignore: &[String],
) -> AppResult<(Vec<IndexFilePlan>, Vec<String>)> {
    let known = database.list_project_files(project_id)?;
    let mut seen = std::collections::HashSet::new();
    let mut to_index = Vec::new();

    for entry in walkdir::WalkDir::new(root).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_file() || should_ignore(root, path, extra_ignore) {
            continue;
        }
        let Ok(relative) = to_relative(root, path) else {
            continue;
        };
        seen.insert(relative.clone());
        let bytes = std::fs::read(path).unwrap_or_default();
        let hash = hash_bytes(&bytes);
        let unchanged = known.iter().any(|item| {
            item.path == relative && item.content_hash.as_deref() == Some(hash.as_str())
        });
        if unchanged {
            continue;
        }
        to_index.push(IndexFilePlan {
            path: relative,
            hash,
            size: bytes.len() as i64,
            language: language_of(path),
        });
    }

    let to_delete: Vec<String> = known
        .into_iter()
        .filter(|item| !seen.contains(&item.path))
        .map(|item| item.path)
        .collect();

    Ok((to_index, to_delete))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn ignores_node_modules_env_and_binaries() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        fs::create_dir(root.join("node_modules")).unwrap();
        fs::write(root.join("node_modules").join("pkg.js"), "x").unwrap();
        fs::write(root.join(".env"), "SECRET=1").unwrap();
        fs::write(root.join("icon.png"), [0u8, 1, 2, 0]).unwrap();
        fs::write(root.join("App.tsx"), "export const x = 1;").unwrap();

        assert!(should_ignore(root, &root.join("node_modules").join("pkg.js"), &[]));
        assert!(should_ignore(root, &root.join(".env"), &[]));
        assert!(should_ignore(root, &root.join("icon.png"), &[]));
        assert!(!should_ignore(root, &root.join("App.tsx"), &[]));
        assert_eq!(hash_bytes(b"hello"), hash_bytes(b"hello"));
        assert_ne!(hash_bytes(b"hello"), hash_bytes(b"world"));
    }

    #[test]
    fn skips_unchanged_files_and_reindexes_changed_ones() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        fs::create_dir(root.join("src")).unwrap();
        fs::write(root.join("src").join("App.tsx"), "export const x = 1;").unwrap();
        let db = Database::open_memory().unwrap();
        let (first, deleted) = plan_index(&db, "p1", root, &[]).unwrap();
        assert_eq!(deleted.len(), 0);
        assert_eq!(first.len(), 1);
        let file = &first[0];
        db.upsert_project_file(&crate::database::records::ProjectFileRecord {
            id: "p1:src/App.tsx".into(),
            project_id: "p1".into(),
            path: file.path.clone(),
            language: file.language.clone(),
            file_type: Some("code".into()),
            file_size: Some(file.size),
            content_hash: Some(file.hash.clone()),
            indexed_at: Some(1),
            updated_at: Some(1),
        })
        .unwrap();
        let (second, _) = plan_index(&db, "p1", root, &[]).unwrap();
        assert!(second.is_empty());
        fs::write(root.join("src").join("App.tsx"), "export const x = 2;").unwrap();
        let (third, _) = plan_index(&db, "p1", root, &[]).unwrap();
        assert_eq!(third.len(), 1);
        fs::remove_file(root.join("src").join("App.tsx")).unwrap();
        let (_, removed) = plan_index(&db, "p1", root, &[]).unwrap();
        assert_eq!(removed, vec!["src/App.tsx".to_string()]);
    }
}
