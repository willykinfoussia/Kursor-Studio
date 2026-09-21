use crate::agent::events;
use crate::error::AppResult;
use crate::filesystem::{is_excluded_path, to_relative};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeEvent {
    pub relative_path: String,
    pub kind: &'static str,
}

pub struct ProjectWatcher {
    _watcher: RecommendedWatcher,
}

impl ProjectWatcher {
    pub fn start(app: AppHandle, root: PathBuf) -> AppResult<Self> {
        Self::start_emitting(app, root, events::PROJECT_FILE_CHANGED, true)
    }

    pub fn start_emitting(
        app: AppHandle,
        root: PathBuf,
        event: &'static str,
        skip_excluded: bool,
    ) -> AppResult<Self> {
        let (tx, rx) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |result| {
            let _ = tx.send(result);
        })
        .map_err(|error| crate::error::AppError::InvalidRequest(error.to_string()))?;

        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|error| crate::error::AppError::InvalidRequest(error.to_string()))?;

        let watch_root = root.clone();
        thread::spawn(move || {
            let mut last_emit: Option<(String, Instant)> = None;
            while let Ok(result) = rx.recv() {
                let Ok(event_result) = result else { continue };
                let kind = match event_result.kind {
                    EventKind::Create(_) => "create",
                    EventKind::Modify(_) => "modify",
                    EventKind::Remove(_) => "remove",
                    EventKind::Any => "modify",
                    _ => continue,
                };
                for path in event_result.paths {
                    if skip_excluded && is_excluded_path(&watch_root, &path) {
                        continue;
                    }
                    let Ok(relative) = to_relative(&watch_root, &path) else {
                        continue;
                    };
                    if relative.is_empty() {
                        continue;
                    }
                    let now = Instant::now();
                    if let Some((previous, at)) = &last_emit {
                        if previous == &relative && now.duration_since(*at) < Duration::from_millis(120) {
                            continue;
                        }
                    }
                    last_emit = Some((relative.clone(), now));
                    let payload = FileChangeEvent {
                        relative_path: relative,
                        kind,
                    };
                    let _ = app.emit(event, payload);
                }
            }
        });

        Ok(Self { _watcher: watcher })
    }
}
