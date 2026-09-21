use crate::database::records::RagSearchHit;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredDocument {
    pub id: String,
    pub project_id: String,
    pub source_type: String,
    pub source_path: Option<String>,
    pub chunk_index: Option<i32>,
    pub content: String,
    pub embedding: Vec<f32>,
    pub metadata: serde_json::Value,
}

#[derive(Clone)]
pub struct LanceStore {
    root: PathBuf,
}

impl LanceStore {
    pub fn open(data_dir: &Path) -> AppResult<Self> {
        let root = data_dir.join("vector").join("lancedb");
        fs::create_dir_all(&root)?;
        Ok(Self { root })
    }

    fn project_file(&self, project_id: &str) -> PathBuf {
        let safe: String = project_id
            .chars()
            .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
            .collect();
        self.root.join(format!("{safe}.jsonl"))
    }

    fn load(&self, project_id: &str) -> AppResult<Vec<StoredDocument>> {
        let path = self.project_file(project_id);
        if !path.exists() {
            return Ok(Vec::new());
        }
        let raw = fs::read_to_string(path)?;
        let mut docs = Vec::new();
        for line in raw.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(doc) = serde_json::from_str::<StoredDocument>(line) {
                docs.push(doc);
            }
        }
        Ok(docs)
    }

    fn save(&self, project_id: &str, docs: &[StoredDocument]) -> AppResult<()> {
        let path = self.project_file(project_id);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut body = String::new();
        for doc in docs {
            body.push_str(&serde_json::to_string(doc).map_err(|error| AppError::Rag(error.to_string()))?);
            body.push('\n');
        }
        fs::write(path, body)?;
        Ok(())
    }

    pub fn upsert(&self, docs: &[StoredDocument]) -> AppResult<()> {
        let mut by_project: std::collections::HashMap<String, Vec<StoredDocument>> =
            std::collections::HashMap::new();
        for doc in docs {
            by_project
                .entry(doc.project_id.clone())
                .or_default()
                .push(doc.clone());
        }
        for (project_id, incoming) in by_project {
            let mut existing = self.load(&project_id)?;
            for doc in incoming {
                existing.retain(|item| item.id != doc.id);
                existing.push(doc);
            }
            self.save(&project_id, &existing)?;
        }
        Ok(())
    }

    pub fn remove_path(&self, project_id: &str, source_path: &str) -> AppResult<Vec<String>> {
        let mut existing = self.load(project_id)?;
        let removed: Vec<String> = existing
            .iter()
            .filter(|item| item.source_path.as_deref() == Some(source_path))
            .map(|item| item.id.clone())
            .collect();
        existing.retain(|item| item.source_path.as_deref() != Some(source_path));
        self.save(project_id, &existing)?;
        Ok(removed)
    }

    pub fn search(
        &self,
        project_id: &str,
        embedding: &[f32],
        top_k: usize,
        source_type: Option<&str>,
    ) -> AppResult<Vec<RagSearchHit>> {
        let docs = self.load(project_id)?;
        let mut scored: Vec<(f32, StoredDocument)> = docs
            .into_iter()
            .filter(|doc| source_type.map(|kind| doc.source_type == kind).unwrap_or(true))
            .filter(|doc| !doc.embedding.is_empty())
            .map(|doc| (cosine(&doc.embedding, embedding), doc))
            .collect();
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        Ok(scored
            .into_iter()
            .take(top_k)
            .map(|(score, doc)| RagSearchHit {
                id: doc.id,
                project_id: doc.project_id,
                source_type: doc.source_type,
                source_path: doc.source_path,
                chunk_index: doc.chunk_index,
                content: doc.content,
                score,
                metadata: doc.metadata,
            })
            .collect())
    }

    pub fn clear(&self) -> AppResult<()> {
        if self.root.exists() {
            fs::remove_dir_all(&self.root)?;
            fs::create_dir_all(&self.root)?;
        }
        Ok(())
    }
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let len = a.len().min(b.len());
    let mut dot = 0.0f32;
    let mut na = 0.0f32;
    let mut nb = 0.0f32;
    for i in 0..len {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    let denom = na.sqrt() * nb.sqrt();
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn upsert_and_search_prefers_similar_vector() {
        let dir = tempdir().unwrap();
        let store = LanceStore::open(dir.path()).unwrap();
        store
            .upsert(&[StoredDocument {
                id: "a".into(),
                project_id: "p".into(),
                source_type: "code".into(),
                source_path: Some("src/a.ts".into()),
                chunk_index: Some(0),
                content: "todo list".into(),
                embedding: vec![1.0, 0.0, 0.0],
                metadata: serde_json::json!({}),
            }])
            .unwrap();
        store
            .upsert(&[StoredDocument {
                id: "b".into(),
                project_id: "p".into(),
                source_type: "code".into(),
                source_path: Some("src/b.ts".into()),
                chunk_index: Some(0),
                content: "unrelated".into(),
                embedding: vec![0.0, 1.0, 0.0],
                metadata: serde_json::json!({}),
            }])
            .unwrap();
        let hits = store.search("p", &[1.0, 0.0, 0.0], 2, None).unwrap();
        assert_eq!(hits[0].id, "a");
        let removed = store.remove_path("p", "src/a.ts").unwrap();
        assert_eq!(removed, vec!["a".to_string()]);
        let hits = store.search("p", &[1.0, 0.0, 0.0], 2, None).unwrap();
        assert!(hits.iter().all(|hit| hit.id != "a"));
    }
}
