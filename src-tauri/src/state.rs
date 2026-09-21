use crate::database::Database;
use crate::mcp::McpRuntime;
use crate::rag::store::LanceStore;
use crate::secrets::SecretStore;
use crate::terminal::TerminalManager;
use crate::filesystem::watch::ProjectWatcher;
use crate::process::ProcessManager;
use std::{path::PathBuf, sync::Mutex};

pub struct AppState {
    pub project_root: Mutex<Option<PathBuf>>,
    pub secrets: SecretStore,
    pub watcher: Mutex<Option<ProjectWatcher>>,
    pub specs_watcher: Mutex<Option<ProjectWatcher>>,
    pub terminals: TerminalManager,
    pub jobs: ProcessManager,
    pub db: Database,
    pub vector: LanceStore,
    pub mcp: McpRuntime,
}

impl AppState {
    pub fn new(db: Database, vector: LanceStore) -> Self {
        Self {
            project_root: Mutex::new(None),
            secrets: SecretStore::default(),
            watcher: Mutex::new(None),
            specs_watcher: Mutex::new(None),
            terminals: TerminalManager::default(),
            jobs: ProcessManager::default(),
            db,
            vector,
            mcp: McpRuntime::default(),
        }
    }
}
