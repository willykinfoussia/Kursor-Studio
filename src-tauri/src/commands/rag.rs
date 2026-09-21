use crate::database::records::{IndexPlan, ProjectFileRecord, RagChunkInput, RagSearchHit};
use crate::error::{AppError, AppResult};
use crate::rag::index::plan_index;
use crate::rag::store::StoredDocument;
use crate::state::AppState;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexProgress {
    pub project_id: String,
    pub done: usize,
    pub total: usize,
    pub path: Option<String>,
    pub status: String,
}

#[tauri::command]
pub fn rag_plan_index(
    project_id: String,
    root_path: String,
    ignore_patterns: Option<Vec<String>>,
    state: State<'_, AppState>,
) -> AppResult<IndexPlan> {
    let extra = ignore_patterns.unwrap_or_default();
    let (to_index, to_delete) = plan_index(&state.db, &project_id, &PathBuf::from(root_path), &extra)?;
    Ok(IndexPlan {
        project_id,
        to_index,
        to_delete,
    })
}

#[tauri::command]
pub fn rag_upsert_chunks(
    chunks: Vec<RagChunkInput>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let docs: Vec<StoredDocument> = chunks
        .iter()
        .map(|chunk| StoredDocument {
            id: chunk.id.clone(),
            project_id: chunk.project_id.clone(),
            source_type: chunk.source_type.clone(),
            source_path: chunk.source_path.clone(),
            chunk_index: chunk.chunk_index,
            content: chunk.content.clone(),
            embedding: chunk.embedding.clone(),
            metadata: chunk.metadata.clone(),
        })
        .collect();
    state.vector.upsert(&docs)?;
    for chunk in &chunks {
        let path = chunk.source_path.as_deref().unwrap_or("");
        state
            .db
            .upsert_fts_chunk(&chunk.id, &chunk.project_id, path, &chunk.content)?;
    }
    Ok(())
}

#[tauri::command]
pub fn rag_mark_file_indexed(file: ProjectFileRecord, state: State<'_, AppState>) -> AppResult<()> {
    let mut record = file;
    record.indexed_at = Some(now_ms());
    record.updated_at = Some(now_ms());
    state.db.upsert_project_file(&record)
}

#[tauri::command]
pub fn rag_remove_file(
    project_id: String,
    path: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let _ = state.vector.remove_path(&project_id, &path)?;
    state.db.delete_fts_for_path(&project_id, &path)?;
    state.db.delete_project_file(&project_id, &path)?;
    Ok(())
}

#[tauri::command]
pub fn rag_search(
    project_id: String,
    embedding: Option<Vec<f32>>,
    query: Option<String>,
    top_k: Option<usize>,
    source_type: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Vec<RagSearchHit>> {
    let top_k = top_k.unwrap_or(8);
    let mut hits = if let Some(vector) = embedding.as_ref().filter(|item| !item.is_empty()) {
        state.vector.search(&project_id, vector, top_k, source_type.as_deref())?
    } else {
        Vec::new()
    };
    if let Some(text) = query.as_deref().filter(|item| !item.trim().is_empty()) {
        let fts = state.db.search_fts(&project_id, text, top_k as i64)?;
        for item in fts {
            if hits.iter().any(|hit| hit.id == item.chunk_id) {
                continue;
            }
            hits.push(RagSearchHit {
                id: item.chunk_id,
                project_id: item.project_id,
                source_type: "code".to_owned(),
                source_path: Some(item.path),
                chunk_index: None,
                content: item.content,
                score: 0.35 + item.score.abs().min(4.0) / 10.0,
                metadata: serde_json::json!({ "keyword": true }),
            });
        }
    }
    hits.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    hits.truncate(top_k);
    Ok(hits)
}

#[tauri::command]
pub fn rag_emit_progress(app: AppHandle, payload: IndexProgress) -> AppResult<()> {
    app.emit("rag:index-progress", payload)
        .map_err(|error| AppError::Rag(error.to_string()))
}
