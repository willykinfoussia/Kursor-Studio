pub mod records;

use crate::error::{AppError, AppResult};
use records::*;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, OptionalExtension, Row};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const MIGRATIONS: &[(&str, &str)] = &[
    ("001_initial", include_str!("migrations/001_initial.sql")),
    ("002_sessions", include_str!("migrations/002_sessions.sql")),
    ("003_harness_observability", include_str!("migrations/003_harness_observability.sql")),
    ("004_account_project", include_str!("migrations/004_account_project.sql")),
    ("005_run_observability", include_str!("migrations/005_run_observability.sql")),
    ("006_mcp", include_str!("migrations/006_mcp.sql")),
    ("007_ai_review", include_str!("migrations/007_ai_review.sql")),
    ("008_knowledge_proposals", include_str!("migrations/008_knowledge_proposals.sql")),
];
const CODING_AGENT_ID: &str = "coding-agent";
const LOCAL_ACCOUNT_ID: &str = "local-account";

#[derive(Clone)]
pub struct Database {
    pool: Pool<SqliteConnectionManager>,
    pub path: PathBuf,
    pub data_dir: PathBuf,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or(0)
}

fn map_session_row(row: &Row<'_>) -> rusqlite::Result<AgentSessionRecord> {
    Ok(AgentSessionRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        conversation_id: row.get(2)?,
        status: row.get(3)?,
        started_at: row.get(4)?,
        updated_at: row.get(5)?,
        current_step: row.get(6)?,
        current_goal: row.get(7)?,
        checkpoint_json: row.get(8)?,
    })
}

fn map_run_row(row: &Row<'_>) -> rusqlite::Result<AgentRunRecord> {
    Ok(AgentRunRecord {
        id: row.get(0)?,
        account_id: row.get(1)?,
        conversation_id: row.get(2)?,
        project_id: row.get(3)?,
        agent_id: row.get(4)?,
        status: row.get(5)?,
        model: row.get(6)?,
        started_at: row.get(7)?,
        finished_at: row.get(8)?,
        error: row.get(9)?,
        session_id: row.get(10)?,
        task_id: row.get(11)?,
    })
}

fn map_project_row(row: &Row<'_>) -> rusqlite::Result<ProjectRecord> {
    Ok(ProjectRecord {
        id: row.get(0)?,
        account_id: row.get(1)?,
        name: row.get(2)?,
        root_path: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        last_opened_at: row.get(6)?,
    })
}

fn map_account_row(row: &Row<'_>) -> rusqlite::Result<AccountRecord> {
    Ok(AccountRecord {
        id: row.get(0)?,
        provider: row.get(1)?,
        username: row.get(2)?,
        display_name: row.get(3)?,
        avatar_url: row.get(4)?,
        onboarded: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn map_memory_row(row: &Row<'_>) -> rusqlite::Result<MemoryRecord> {
    Ok(MemoryRecord {
        id: row.get(0)?,
        agent_id: row.get(1)?,
        project_id: row.get(2)?,
        scope: row.get(3)?,
        memory_type: row.get(4)?,
        memory_key: row.get(5)?,
        content: row.get(6)?,
        importance: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn looks_like_uuid(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 36
        && bytes[8] == b'-'
        && bytes[13] == b'-'
        && bytes[18] == b'-'
        && bytes[23] == b'-'
        && value.chars().all(|ch| ch.is_ascii_hexdigit() || ch == '-')
}

pub fn app_data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::InvalidRequest("Unable to access application data.".to_owned()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

impl Database {
    pub fn open(app: &AppHandle) -> AppResult<Self> {
        let data_dir = app_data_dir(app)?;
        let path = data_dir.join("kursor.db");
        let manager = SqliteConnectionManager::file(&path).with_init(|connection| {
            connection.execute_batch(
                "PRAGMA journal_mode=WAL;
                 PRAGMA foreign_keys=ON;
                 PRAGMA busy_timeout=5000;",
            )?;
            Ok(())
        });
        let pool = Pool::builder().max_size(8).build(manager)?;
        let database = Self {
            pool,
            path,
            data_dir,
        };
        let _ = fs::create_dir_all(database.data_dir.join("skills"));
        let _ = fs::create_dir_all(database.data_dir.join("rules"));
        let _ = fs::create_dir_all(database.data_dir.join("mcp"));
        database.migrate()?;
        database.seed_agents()?;
        database.import_recents_json(app)?;
        database.bootstrap_account_model()?;
        Ok(database)
    }

    #[cfg(test)]
    pub fn open_memory() -> AppResult<Self> {
        let manager = SqliteConnectionManager::memory().with_init(|connection| {
            connection.execute_batch("PRAGMA foreign_keys=ON;")?;
            Ok(())
        });
        let pool = Pool::builder().max_size(1).build(manager)?;
        let database = Self {
            pool,
            path: PathBuf::from(":memory:"),
            data_dir: PathBuf::from("."),
        };
        database.migrate()?;
        database.bootstrap_account_model()?;
        Ok(database)
    }

    fn conn(&self) -> AppResult<r2d2::PooledConnection<SqliteConnectionManager>> {
        Ok(self.pool.get()?)
    }

    fn migrate(&self) -> AppResult<()> {
        let connection = self.conn()?;
        connection.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at INTEGER NOT NULL
            );",
        )?;
        for (version, sql) in MIGRATIONS {
            let applied: Option<String> = connection
                .query_row(
                    "SELECT version FROM schema_migrations WHERE version = ?1",
                    [version],
                    |row| row.get(0),
                )
                .optional()?;
            if applied.is_none() {
                connection.execute_batch(sql)?;
                connection.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
                    params![*version, now_ms()],
                )?;
            }
        }
        drop(connection);
        self.ensure_column("agent_runs", "session_id", "TEXT")?;
        self.ensure_column("agent_runs", "task_id", "TEXT")?;
        self.ensure_column("agent_runs", "account_id", "TEXT")?;
        self.ensure_column("projects", "account_id", "TEXT")?;
        self.ensure_column("agent_memory", "scope", "TEXT")?;
        self.conn()?.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_projects_account ON projects(account_id);
             CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_root_path ON projects(root_path);
             CREATE INDEX IF NOT EXISTS idx_projects_last_opened ON projects(last_opened_at DESC);",
        )?;
        Ok(())
    }

    fn ensure_column(&self, table: &str, column: &str, decl: &str) -> AppResult<()> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
        let names: Vec<String> = statement
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(Result::ok)
            .collect();
        drop(statement);
        if !names.iter().any(|name| name == column) {
            connection.execute(
                &format!("ALTER TABLE {table} ADD COLUMN {column} {decl}"),
                [],
            )?;
        }
        Ok(())
    }

    fn seed_agents(&self) -> AppResult<()> {
        let now = now_ms();
        self.conn()?.execute(
            "INSERT OR IGNORE INTO agents (id, name, description, system_prompt, model, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)",
            params![
                CODING_AGENT_ID,
                "Coding Agent",
                "Helps build and edit software in the local workspace.",
                "You are Kursor's coding agent.",
                Option::<String>::None,
                now
            ],
        )?;
        Ok(())
    }

    fn import_recents_json(&self, app: &AppHandle) -> AppResult<()> {
        let count: i64 = self
            .conn()?
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))?;
        if count > 0 {
            return Ok(());
        }
        let path = app
            .path()
            .app_config_dir()
            .ok()
            .map(|dir| dir.join("recent-projects.json"));
        let Some(path) = path.filter(|item| item.exists()) else {
            return Ok(());
        };
        let raw = fs::read_to_string(path)?;
        let recents: Vec<Value> = serde_json::from_str(&raw).unwrap_or_default();
        let now = now_ms();
        for (index, item) in recents.into_iter().enumerate() {
            let id = item
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("Project")
                .to_owned();
            let root_path = item
                .get("rootPath")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            if id.is_empty() || root_path.is_empty() {
                continue;
            }
            let opened = now - (index as i64 * 1000);
            self.upsert_project(&ProjectRecord {
                id,
                account_id: Some(LOCAL_ACCOUNT_ID.to_owned()),
                name,
                root_path,
                created_at: opened,
                updated_at: opened,
                last_opened_at: Some(opened),
            })?;
        }
        Ok(())
    }

    pub fn bootstrap_account_model(&self) -> AppResult<()> {
        let now = now_ms();
        let project_count: i64 = self
            .conn()?
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))?;
        let onboarded = if project_count > 0 { 1 } else { 0 };
        self.conn()?.execute(
            "INSERT OR IGNORE INTO accounts (id, provider, username, display_name, avatar_url, onboarded, created_at, updated_at)
             VALUES (?1, 'local', 'local', 'Local Account', NULL, ?2, ?3, ?3)",
            params![LOCAL_ACCOUNT_ID, onboarded, now],
        )?;
        if onboarded == 1 {
            self.conn()?.execute(
                "UPDATE accounts SET onboarded = 1 WHERE id = ?1 AND onboarded = 0",
                params![LOCAL_ACCOUNT_ID],
            )?;
        }
        self.conn()?.execute(
            "UPDATE projects SET account_id = ?1 WHERE account_id IS NULL OR account_id = ''",
            params![LOCAL_ACCOUNT_ID],
        )?;
        self.conn()?.execute(
            "UPDATE agent_memory SET scope = CASE WHEN project_id IS NULL OR project_id = '' THEN 'global' ELSE 'project' END
             WHERE scope IS NULL OR scope = ''",
            [],
        )?;
        let existing_global: i64 = self
            .conn()?
            .query_row("SELECT COUNT(*) FROM global_settings", [], |row| row.get(0))?;
        if existing_global == 0 {
            let settings = self.settings_list()?;
            for setting in settings {
                self.global_settings_set(LOCAL_ACCOUNT_ID, &setting.key, &setting.value)?;
            }
        }
        self.remap_legacy_project_ids()?;
        Ok(())
    }

    fn remap_legacy_project_ids(&self) -> AppResult<()> {
        let projects = self.list_projects(None)?;
        for project in projects {
            if looks_like_uuid(&project.id) {
                continue;
            }
            let new_id = uuid::Uuid::new_v4().to_string();
            self.rebind_project_id(&project.id, &new_id)?;
            self.rename_vector_file(&project.id, &new_id);
        }
        Ok(())
    }

    fn rebind_project_id(&self, old_id: &str, new_id: &str) -> AppResult<()> {
        let connection = self.conn()?;
        let tables = [
            "conversations",
            "agent_runs",
            "tasks",
            "agent_memory",
            "project_files",
            "agent_sessions",
            "project_settings",
            "project_github_repositories",
        ];
        for table in tables {
            let sql = format!("UPDATE {table} SET project_id = ?1 WHERE project_id = ?2");
            let _ = connection.execute(&sql, params![new_id, old_id]);
        }
        let _ = connection.execute(
            "UPDATE rag_chunks_fts SET project_id = ?1 WHERE project_id = ?2",
            params![new_id, old_id],
        );
        connection.execute(
            "UPDATE projects SET id = ?1 WHERE id = ?2",
            params![new_id, old_id],
        )?;
        Ok(())
    }

    fn rename_vector_file(&self, old_id: &str, new_id: &str) {
        let root = self.data_dir.join("vector").join("lancedb");
        let sanitize = |value: &str| {
            value
                .chars()
                .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
                .collect::<String>()
        };
        let from = root.join(format!("{}.jsonl", sanitize(old_id)));
        let to = root.join(format!("{}.jsonl", sanitize(new_id)));
        if from.exists() && !to.exists() {
            let _ = fs::rename(from, to);
        }
    }

    pub fn settings_list(&self) -> AppResult<Vec<SettingRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare("SELECT key, value, updated_at FROM settings")?;
        let rows = statement.query_map([], |row| {
            Ok(SettingRecord {
                key: row.get(0)?,
                value: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn settings_set(&self, key: &str, value: &str) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, now_ms()],
        )?;
        self.global_settings_set(LOCAL_ACCOUNT_ID, key, value)
    }

    pub fn global_settings_list(&self, account_id: &str) -> AppResult<Vec<SettingRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT key, value, updated_at FROM global_settings WHERE account_id = ?1",
        )?;
        let rows = statement.query_map([account_id], |row| {
            Ok(SettingRecord {
                key: row.get(0)?,
                value: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn global_settings_set(&self, account_id: &str, key: &str, value: &str) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO global_settings (account_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(account_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![account_id, key, value, now_ms()],
        )?;
        Ok(())
    }

    pub fn project_settings_list(&self, project_id: &str) -> AppResult<Vec<SettingRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT key, value, updated_at FROM project_settings WHERE project_id = ?1",
        )?;
        let rows = statement.query_map([project_id], |row| {
            Ok(SettingRecord {
                key: row.get(0)?,
                value: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn project_settings_set(&self, project_id: &str, key: &str, value: &str) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO project_settings (project_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(project_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![project_id, key, value, now_ms()],
        )?;
        Ok(())
    }

    pub fn upsert_account(&self, account: &AccountRecord) -> AppResult<AccountRecord> {
        self.conn()?.execute(
            "INSERT INTO accounts (id, provider, username, display_name, avatar_url, onboarded, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                provider = excluded.provider,
                username = excluded.username,
                display_name = excluded.display_name,
                avatar_url = excluded.avatar_url,
                onboarded = excluded.onboarded,
                updated_at = excluded.updated_at",
            params![
                account.id,
                account.provider,
                account.username,
                account.display_name,
                account.avatar_url,
                account.onboarded,
                account.created_at,
                account.updated_at
            ],
        )?;
        Ok(account.clone())
    }

    pub fn get_account(&self, id: &str) -> AppResult<Option<AccountRecord>> {
        self.conn()?
            .query_row(
                "SELECT id, provider, username, display_name, avatar_url, onboarded, created_at, updated_at
                 FROM accounts WHERE id = ?1",
                [id],
                map_account_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn current_account(&self) -> AppResult<AccountRecord> {
        if let Some(account) = self.get_account(LOCAL_ACCOUNT_ID)? {
            return Ok(account);
        }
        self.bootstrap_account_model()?;
        self.get_account(LOCAL_ACCOUNT_ID)?
            .ok_or_else(|| AppError::Database("Unable to create a local account.".to_owned()))
    }

    pub fn upsert_github_account(&self, record: &GitHubAccountRecord) -> AppResult<GitHubAccountRecord> {
        self.conn()?.execute(
            "INSERT INTO github_accounts (id, account_id, github_user_id, username, avatar_url, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                github_user_id = excluded.github_user_id,
                username = excluded.username,
                avatar_url = excluded.avatar_url,
                updated_at = excluded.updated_at",
            params![
                record.id,
                record.account_id,
                record.github_user_id,
                record.username,
                record.avatar_url,
                record.created_at,
                record.updated_at
            ],
        )?;
        Ok(record.clone())
    }

    pub fn get_github_account(&self, account_id: &str) -> AppResult<Option<GitHubAccountRecord>> {
        self.conn()?
            .query_row(
                "SELECT id, account_id, github_user_id, username, avatar_url, created_at, updated_at
                 FROM github_accounts WHERE account_id = ?1 LIMIT 1",
                [account_id],
                |row| {
                    Ok(GitHubAccountRecord {
                        id: row.get(0)?,
                        account_id: row.get(1)?,
                        github_user_id: row.get(2)?,
                        username: row.get(3)?,
                        avatar_url: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn delete_github_account(&self, account_id: &str) -> AppResult<()> {
        self.conn()?
            .execute("DELETE FROM github_accounts WHERE account_id = ?1", [account_id])?;
        Ok(())
    }

    pub fn upsert_project_github(&self, record: &ProjectGithubRepositoryRecord) -> AppResult<ProjectGithubRepositoryRecord> {
        self.conn()?.execute(
            "INSERT INTO project_github_repositories (
                id, project_id, github_repository_id, owner, name, full_name, html_url, clone_url, default_branch, private
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                github_repository_id = excluded.github_repository_id,
                owner = excluded.owner,
                name = excluded.name,
                full_name = excluded.full_name,
                html_url = excluded.html_url,
                clone_url = excluded.clone_url,
                default_branch = excluded.default_branch,
                private = excluded.private",
            params![
                record.id,
                record.project_id,
                record.github_repository_id,
                record.owner,
                record.name,
                record.full_name,
                record.html_url,
                record.clone_url,
                record.default_branch,
                record.private
            ],
        )?;
        Ok(record.clone())
    }

    pub fn get_project_github(&self, project_id: &str) -> AppResult<Option<ProjectGithubRepositoryRecord>> {
        self.conn()?
            .query_row(
                "SELECT id, project_id, github_repository_id, owner, name, full_name, html_url, clone_url, default_branch, private
                 FROM project_github_repositories WHERE project_id = ?1 LIMIT 1",
                [project_id],
                |row| {
                    Ok(ProjectGithubRepositoryRecord {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        github_repository_id: row.get(2)?,
                        owner: row.get(3)?,
                        name: row.get(4)?,
                        full_name: row.get(5)?,
                        html_url: row.get(6)?,
                        clone_url: row.get(7)?,
                        default_branch: row.get(8)?,
                        private: row.get(9)?,
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn delete_project_github(&self, project_id: &str) -> AppResult<()> {
        self.conn()?.execute(
            "DELETE FROM project_github_repositories WHERE project_id = ?1",
            [project_id],
        )?;
        Ok(())
    }

    pub fn upsert_project(&self, project: &ProjectRecord) -> AppResult<ProjectRecord> {
        let account_id = project
            .account_id
            .clone()
            .unwrap_or_else(|| LOCAL_ACCOUNT_ID.to_owned());
        self.conn()?.execute(
            "INSERT INTO projects (id, account_id, name, root_path, created_at, updated_at, last_opened_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                account_id = excluded.account_id,
                name = excluded.name,
                root_path = excluded.root_path,
                updated_at = excluded.updated_at,
                last_opened_at = excluded.last_opened_at",
            params![
                project.id,
                account_id,
                project.name,
                project.root_path,
                project.created_at,
                project.updated_at,
                project.last_opened_at
            ],
        )?;
        let mut stored = project.clone();
        stored.account_id = Some(account_id);
        Ok(stored)
    }

    pub fn list_projects(&self, account_id: Option<&str>) -> AppResult<Vec<ProjectRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, account_id, name, root_path, created_at, updated_at, last_opened_at
             FROM projects
             WHERE ?1 IS NULL OR account_id = ?1
             ORDER BY COALESCE(last_opened_at, updated_at) DESC",
        )?;
        let rows = statement.query_map([account_id], map_project_row)?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn list_recent_projects(&self, limit: i64) -> AppResult<Vec<ProjectRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, account_id, name, root_path, created_at, updated_at, last_opened_at
             FROM projects ORDER BY COALESCE(last_opened_at, updated_at) DESC LIMIT ?1",
        )?;
        let rows = statement.query_map([limit], map_project_row)?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn get_project(&self, id: &str) -> AppResult<Option<ProjectRecord>> {
        self.conn()?
            .query_row(
                "SELECT id, account_id, name, root_path, created_at, updated_at, last_opened_at FROM projects WHERE id = ?1",
                [id],
                map_project_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn get_project_by_path(&self, root_path: &str) -> AppResult<Option<ProjectRecord>> {
        self.conn()?
            .query_row(
                "SELECT id, account_id, name, root_path, created_at, updated_at, last_opened_at
                 FROM projects WHERE root_path = ?1",
                [root_path],
                map_project_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn delete_project_metadata(&self, id: &str) -> AppResult<()> {
        let connection = self.conn()?;
        connection.execute("DELETE FROM project_settings WHERE project_id = ?1", [id])?;
        connection.execute("DELETE FROM project_github_repositories WHERE project_id = ?1", [id])?;
        connection.execute("DELETE FROM projects WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn upsert_conversation(&self, conversation: &ConversationRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO conversations (id, project_id, title, created_at, updated_at, archived)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                project_id = excluded.project_id,
                title = excluded.title,
                updated_at = excluded.updated_at,
                archived = excluded.archived",
            params![
                conversation.id,
                conversation.project_id,
                conversation.title,
                conversation.created_at,
                conversation.updated_at,
                conversation.archived
            ],
        )?;
        Ok(())
    }

    pub fn list_conversations(
        &self,
        project_id: Option<&str>,
        include_archived: bool,
    ) -> AppResult<Vec<ConversationRecord>> {
        let connection = self.conn()?;
        let archived_flag = if include_archived { 1 } else { 0 };
        let map_row = |row: &rusqlite::Row| -> rusqlite::Result<ConversationRecord> {
            Ok(ConversationRecord {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                archived: row.get(5)?,
            })
        };
        if let Some(project_id) = project_id {
            let mut statement = connection.prepare(
                "SELECT id, project_id, title, created_at, updated_at, archived FROM conversations
                 WHERE project_id = ?1 AND (?2 = 1 OR archived = 0)
                 ORDER BY updated_at DESC",
            )?;
            let rows = statement.query_map(params![project_id, archived_flag], map_row)?;
            Ok(rows.filter_map(Result::ok).collect())
        } else {
            let mut statement = connection.prepare(
                "SELECT id, project_id, title, created_at, updated_at, archived FROM conversations
                 WHERE project_id IS NULL AND (?1 = 1 OR archived = 0)
                 ORDER BY updated_at DESC",
            )?;
            let rows = statement.query_map(params![archived_flag], map_row)?;
            Ok(rows.filter_map(Result::ok).collect())
        }
    }

    pub fn get_conversation(&self, id: &str) -> AppResult<Option<ConversationRecord>> {
        self.conn()?
            .query_row(
                "SELECT id, project_id, title, created_at, updated_at, archived FROM conversations WHERE id = ?1",
                [id],
                |row| {
                    Ok(ConversationRecord {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        title: row.get(2)?,
                        created_at: row.get(3)?,
                        updated_at: row.get(4)?,
                        archived: row.get(5)?,
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn archive_conversation(&self, id: &str) -> AppResult<()> {
        self.conn()?.execute(
            "UPDATE conversations SET archived = 1, updated_at = ?2 WHERE id = ?1",
            params![id, now_ms()],
        )?;
        Ok(())
    }

    pub fn upsert_message(&self, message: &MessageRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO messages (id, conversation_id, role, content, model, created_at, token_input, token_output, latency_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                content = excluded.content,
                model = excluded.model,
                token_input = excluded.token_input,
                token_output = excluded.token_output,
                latency_ms = excluded.latency_ms",
            params![
                message.id,
                message.conversation_id,
                message.role,
                message.content,
                message.model,
                message.created_at,
                message.token_input,
                message.token_output,
                message.latency_ms
            ],
        )?;
        Ok(())
    }

    pub fn list_messages(
        &self,
        conversation_id: &str,
        limit: i64,
        before: Option<i64>,
    ) -> AppResult<Vec<MessageRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, conversation_id, role, content, model, created_at, token_input, token_output, latency_ms
             FROM messages
             WHERE conversation_id = ?1 AND (?2 IS NULL OR created_at < ?2)
             ORDER BY created_at DESC
             LIMIT ?3",
        )?;
        let rows = statement.query_map(params![conversation_id, before, limit], |row| {
            Ok(MessageRecord {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                model: row.get(4)?,
                created_at: row.get(5)?,
                token_input: row.get(6)?,
                token_output: row.get(7)?,
                latency_ms: row.get(8)?,
            })
        })?;
        let mut messages: Vec<_> = rows.filter_map(Result::ok).collect();
        messages.reverse();
        Ok(messages)
    }

    pub fn upsert_run(&self, run: &AgentRunRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO agent_runs (id, account_id, conversation_id, project_id, agent_id, status, model, started_at, finished_at, error, session_id, task_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(id) DO UPDATE SET
                account_id = excluded.account_id,
                status = excluded.status,
                model = excluded.model,
                finished_at = excluded.finished_at,
                error = excluded.error,
                session_id = excluded.session_id,
                task_id = excluded.task_id",
            params![
                run.id,
                run.account_id,
                run.conversation_id,
                run.project_id,
                run.agent_id,
                run.status,
                run.model,
                run.started_at,
                run.finished_at,
                run.error,
                run.session_id,
                run.task_id
            ],
        )?;
        Ok(())
    }

    pub fn list_runs(&self, project_id: Option<&str>, limit: i64) -> AppResult<Vec<AgentRunRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, account_id, conversation_id, project_id, agent_id, status, model, started_at, finished_at, error, session_id, task_id
             FROM agent_runs
             WHERE ?1 IS NULL OR project_id = ?1
             ORDER BY started_at DESC
             LIMIT ?2",
        )?;
        let rows = statement.query_map(params![project_id, limit], map_run_row)?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn get_run(&self, id: &str) -> AppResult<Option<AgentRunRecord>> {
        self.conn()?
            .query_row(
                "SELECT id, account_id, conversation_id, project_id, agent_id, status, model, started_at, finished_at, error, session_id, task_id
                 FROM agent_runs WHERE id = ?1",
                [id],
                map_run_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn upsert_session(&self, session: &AgentSessionRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO agent_sessions (
                id, project_id, conversation_id, status, started_at, updated_at, current_step, current_goal, checkpoint_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                project_id = excluded.project_id,
                conversation_id = excluded.conversation_id,
                status = excluded.status,
                updated_at = excluded.updated_at,
                current_step = excluded.current_step,
                current_goal = excluded.current_goal,
                checkpoint_json = excluded.checkpoint_json",
            params![
                session.id,
                session.project_id,
                session.conversation_id,
                session.status,
                session.started_at,
                session.updated_at,
                session.current_step,
                session.current_goal,
                session.checkpoint_json
            ],
        )?;
        Ok(())
    }

    pub fn get_session(&self, id: &str) -> AppResult<Option<AgentSessionRecord>> {
        self.conn()?
            .query_row(
                "SELECT id, project_id, conversation_id, status, started_at, updated_at, current_step, current_goal, checkpoint_json
                 FROM agent_sessions WHERE id = ?1",
                [id],
                map_session_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_sessions(
        &self,
        project_id: Option<&str>,
        status: Option<&str>,
    ) -> AppResult<Vec<AgentSessionRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, project_id, conversation_id, status, started_at, updated_at, current_step, current_goal, checkpoint_json
             FROM agent_sessions
             WHERE (?1 IS NULL OR project_id = ?1)
               AND (?2 IS NULL OR status = ?2)
             ORDER BY updated_at DESC",
        )?;
        let rows = statement.query_map(params![project_id, status], map_session_row)?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn list_interrupted_sessions(
        &self,
        project_id: Option<&str>,
    ) -> AppResult<Vec<AgentSessionRecord>> {
        self.list_sessions(project_id, Some("interrupted"))
    }

    pub fn upsert_task(&self, task: &TaskRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO tasks (id, project_id, agent_run_id, title, description, status, progress, created_at, updated_at, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                status = excluded.status,
                progress = excluded.progress,
                updated_at = excluded.updated_at,
                completed_at = excluded.completed_at",
            params![
                task.id,
                task.project_id,
                task.agent_run_id,
                task.title,
                task.description,
                task.status,
                task.progress,
                task.created_at,
                task.updated_at,
                task.completed_at
            ],
        )?;
        Ok(())
    }

    pub fn list_tasks(&self, project_id: Option<&str>) -> AppResult<Vec<TaskRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, project_id, agent_run_id, title, description, status, progress, created_at, updated_at, completed_at
             FROM tasks WHERE ?1 IS NULL OR project_id = ?1 ORDER BY updated_at DESC",
        )?;
        let rows = statement.query_map([project_id], |row| {
            Ok(TaskRecord {
                id: row.get(0)?,
                project_id: row.get(1)?,
                agent_run_id: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                status: row.get(5)?,
                progress: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                completed_at: row.get(9)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn upsert_step(&self, step: &AgentStepRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO agent_steps (id, agent_run_id, step_index, kind, status, started_at, finished_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                finished_at = excluded.finished_at",
            params![
                step.id,
                step.agent_run_id,
                step.index,
                step.kind,
                step.status,
                step.started_at,
                step.finished_at
            ],
        )?;
        Ok(())
    }

    pub fn list_steps(&self, agent_run_id: &str) -> AppResult<Vec<AgentStepRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, agent_run_id, step_index, kind, status, started_at, finished_at
             FROM agent_steps WHERE agent_run_id = ?1 ORDER BY step_index ASC",
        )?;
        let rows = statement.query_map([agent_run_id], |row| {
            Ok(AgentStepRecord {
                id: row.get(0)?,
                agent_run_id: row.get(1)?,
                index: row.get(2)?,
                kind: row.get(3)?,
                status: row.get(4)?,
                started_at: row.get(5)?,
                finished_at: row.get(6)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn append_event_trace(&self, record: &EventTraceRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT OR IGNORE INTO agent_event_traces (id, run_id, session_id, task_id, seq, event_type, payload_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                record.id,
                record.run_id,
                record.session_id,
                record.task_id,
                record.seq,
                record.event_type,
                record.payload_json,
                record.created_at
            ],
        )?;
        if let Some(run_id) = &record.run_id {
            self.append_trace_jsonl(run_id, &record.payload_json)?;
        }
        Ok(())
    }

    pub fn list_event_traces(&self, run_id: &str) -> AppResult<Vec<EventTraceRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, run_id, session_id, task_id, seq, event_type, payload_json, created_at
             FROM agent_event_traces WHERE run_id = ?1 ORDER BY seq ASC",
        )?;
        let rows = statement.query_map([run_id], |row| {
            Ok(EventTraceRecord {
                id: row.get(0)?,
                run_id: row.get(1)?,
                session_id: row.get(2)?,
                task_id: row.get(3)?,
                seq: row.get(4)?,
                event_type: row.get(5)?,
                payload_json: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    fn append_trace_jsonl(&self, run_id: &str, line: &str) -> AppResult<()> {
        let dir = self.data_dir.join("traces");
        fs::create_dir_all(&dir)?;
        let safe: String = run_id
            .chars()
            .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
            .collect();
        let path = dir.join(format!("{safe}.jsonl"));
        let mut file = fs::OpenOptions::new().create(true).append(true).open(path)?;
        use std::io::Write;
        writeln!(file, "{line}")?;
        Ok(())
    }

    pub fn upsert_tool_call(&self, call: &ToolCallRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO tool_calls (id, agent_run_id, tool_name, input_json, output_json, status, started_at, finished_at, error)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                output_json = excluded.output_json,
                status = excluded.status,
                finished_at = excluded.finished_at,
                error = excluded.error",
            params![
                call.id,
                call.agent_run_id,
                call.tool_name,
                call.input_json,
                call.output_json,
                call.status,
                call.started_at,
                call.finished_at,
                call.error
            ],
        )?;
        Ok(())
    }

    pub fn list_tool_calls(&self, agent_run_id: &str) -> AppResult<Vec<ToolCallRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, agent_run_id, tool_name, input_json, output_json, status, started_at, finished_at, error
             FROM tool_calls WHERE agent_run_id = ?1 ORDER BY started_at ASC",
        )?;
        let rows = statement.query_map([agent_run_id], |row| {
            Ok(ToolCallRecord {
                id: row.get(0)?,
                agent_run_id: row.get(1)?,
                tool_name: row.get(2)?,
                input_json: row.get(3)?,
                output_json: row.get(4)?,
                status: row.get(5)?,
                started_at: row.get(6)?,
                finished_at: row.get(7)?,
                error: row.get(8)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn list_agents(&self) -> AppResult<Vec<AgentRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, name, description, system_prompt, model, enabled, created_at, updated_at FROM agents ORDER BY name",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(AgentRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                system_prompt: row.get(3)?,
                model: row.get(4)?,
                enabled: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn upsert_agent(&self, agent: &AgentRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO agents (id, name, description, system_prompt, model, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                system_prompt = excluded.system_prompt,
                model = excluded.model,
                enabled = excluded.enabled,
                updated_at = excluded.updated_at",
            params![
                agent.id,
                agent.name,
                agent.description,
                agent.system_prompt,
                agent.model,
                agent.enabled,
                agent.created_at,
                agent.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn upsert_memory(&self, memory: &MemoryRecord) -> AppResult<()> {
        let scope = memory.scope.clone().unwrap_or_else(|| {
            if memory.project_id.as_deref().filter(|value| !value.is_empty()).is_some() {
                "project".to_owned()
            } else {
                "global".to_owned()
            }
        });
        self.conn()?.execute(
            "INSERT INTO agent_memory (id, agent_id, project_id, scope, memory_type, memory_key, content, importance, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                project_id = excluded.project_id,
                scope = excluded.scope,
                memory_type = excluded.memory_type,
                memory_key = excluded.memory_key,
                content = excluded.content,
                importance = excluded.importance,
                updated_at = excluded.updated_at",
            params![
                memory.id,
                memory.agent_id,
                memory.project_id,
                scope,
                memory.memory_type,
                memory.memory_key,
                memory.content,
                memory.importance,
                memory.created_at,
                memory.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_memory(&self, id: &str) -> AppResult<Option<MemoryRecord>> {
        self.conn()?
            .query_row(
                "SELECT id, agent_id, project_id, scope, memory_type, memory_key, content, importance, created_at, updated_at
                 FROM agent_memory WHERE id = ?1",
                [id],
                map_memory_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn search_memory(&self, project_id: Option<&str>, query: &str) -> AppResult<Vec<MemoryRecord>> {
        let connection = self.conn()?;
        let like = format!("%{}%", query);
        let mut statement = connection.prepare(
            "SELECT id, agent_id, project_id, scope, memory_type, memory_key, content, importance, created_at, updated_at
             FROM agent_memory
             WHERE (
                    (?1 IS NOT NULL AND ((scope = 'project' AND project_id = ?1) OR scope = 'global'))
                    OR (?1 IS NULL AND scope = 'global')
                  )
               AND (?2 = '' OR content LIKE ?3 OR IFNULL(memory_key, '') LIKE ?3)
             ORDER BY CASE WHEN scope = 'project' THEN 0 ELSE 1 END,
                      COALESCE(importance, 0) DESC, updated_at DESC",
        )?;
        let rows = statement.query_map(params![project_id, query, like], map_memory_row)?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn delete_memory(&self, id: &str) -> AppResult<()> {
        self.conn()?
            .execute("DELETE FROM agent_memory WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn upsert_project_file(&self, file: &ProjectFileRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO project_files (id, project_id, path, language, file_type, file_size, content_hash, indexed_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(project_id, path) DO UPDATE SET
                language = excluded.language,
                file_type = excluded.file_type,
                file_size = excluded.file_size,
                content_hash = excluded.content_hash,
                indexed_at = excluded.indexed_at,
                updated_at = excluded.updated_at",
            params![
                file.id,
                file.project_id,
                file.path,
                file.language,
                file.file_type,
                file.file_size,
                file.content_hash,
                file.indexed_at,
                file.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn list_project_files(&self, project_id: &str) -> AppResult<Vec<ProjectFileRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, project_id, path, language, file_type, file_size, content_hash, indexed_at, updated_at
             FROM project_files WHERE project_id = ?1",
        )?;
        let rows = statement.query_map([project_id], |row| {
            Ok(ProjectFileRecord {
                id: row.get(0)?,
                project_id: row.get(1)?,
                path: row.get(2)?,
                language: row.get(3)?,
                file_type: row.get(4)?,
                file_size: row.get(5)?,
                content_hash: row.get(6)?,
                indexed_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn delete_project_file(&self, project_id: &str, path: &str) -> AppResult<()> {
        self.conn()?.execute(
            "DELETE FROM project_files WHERE project_id = ?1 AND path = ?2",
            params![project_id, path],
        )?;
        Ok(())
    }

    pub fn insert_usage(&self, usage: &UsageRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO model_usage (id, agent_run_id, model, input_tokens, output_tokens, latency_ms, status, fallback_from, fallback_to, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                usage.id,
                usage.agent_run_id,
                usage.model,
                usage.input_tokens,
                usage.output_tokens,
                usage.latency_ms,
                usage.status,
                usage.fallback_from,
                usage.fallback_to,
                usage.created_at
            ],
        )?;
        Ok(())
    }

    pub fn list_usage(&self, limit: i64) -> AppResult<Vec<UsageRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, agent_run_id, model, input_tokens, output_tokens, latency_ms, status, fallback_from, fallback_to, created_at
             FROM model_usage ORDER BY created_at DESC LIMIT ?1",
        )?;
        let rows = statement.query_map([limit], |row| {
            Ok(UsageRecord {
                id: row.get(0)?,
                agent_run_id: row.get(1)?,
                model: row.get(2)?,
                input_tokens: row.get(3)?,
                output_tokens: row.get(4)?,
                latency_ms: row.get(5)?,
                status: row.get(6)?,
                fallback_from: row.get(7)?,
                fallback_to: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn upsert_fts_chunk(
        &self,
        chunk_id: &str,
        project_id: &str,
        path: &str,
        content: &str,
    ) -> AppResult<()> {
        let connection = self.conn()?;
        connection.execute(
            "DELETE FROM rag_chunks_fts WHERE chunk_id = ?1",
            [chunk_id],
        )?;
        connection.execute(
            "INSERT INTO rag_chunks_fts (chunk_id, project_id, path, content) VALUES (?1, ?2, ?3, ?4)",
            params![chunk_id, project_id, path, content],
        )?;
        Ok(())
    }

    pub fn delete_fts_for_path(&self, project_id: &str, path: &str) -> AppResult<()> {
        self.conn()?.execute(
            "DELETE FROM rag_chunks_fts WHERE project_id = ?1 AND path = ?2",
            params![project_id, path],
        )?;
        Ok(())
    }

    pub fn search_fts(
        &self,
        project_id: &str,
        query: &str,
        limit: i64,
    ) -> AppResult<Vec<FtsHit>> {
        let match_query = fts_query(query);
        if match_query.is_empty() {
            return Ok(Vec::new());
        }
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT chunk_id, project_id, path, content, bm25(rag_chunks_fts) AS score
             FROM rag_chunks_fts
             WHERE project_id = ?1 AND rag_chunks_fts MATCH ?2
             ORDER BY score LIMIT ?3",
        )?;
        let rows = statement.query_map(params![project_id, match_query, limit], |row| {
            Ok(FtsHit {
                chunk_id: row.get(0)?,
                project_id: row.get(1)?,
                path: row.get(2)?,
                content: row.get(3)?,
                score: row.get::<_, f64>(4)? as f32,
            })
        });
        match rows {
            Ok(mapped) => Ok(mapped.filter_map(Result::ok).collect()),
            Err(_) => Ok(Vec::new()),
        }
    }

    fn map_mcp_server_row(row: &Row<'_>) -> rusqlite::Result<McpServerRecord> {
        Ok(McpServerRecord {
            id: row.get(0)?,
            name: row.get(1)?,
            display_name: row.get(2)?,
            scope: row.get(3)?,
            origin: row.get(4)?,
            transport: row.get(5)?,
            command: row.get(6)?,
            args_json: row.get(7)?,
            url: row.get(8)?,
            env_json: row.get(9)?,
            enabled: row.get(10)?,
            status: row.get(11)?,
            trust: row.get(12)?,
            version: row.get(13)?,
            timeout_ms: row.get(14)?,
            project_id: row.get(15)?,
            last_connected_at: row.get(16)?,
            last_error: row.get(17)?,
            restart_count: row.get(18)?,
            tool_count: row.get(19)?,
            resource_count: row.get(20)?,
            prompt_count: row.get(21)?,
            metadata_json: row.get(22)?,
            created_at: row.get(23)?,
            updated_at: row.get(24)?,
        })
    }

    pub fn upsert_mcp_server(&self, record: &McpServerRecord) -> AppResult<McpServerRecord> {
        self.conn()?.execute(
            "INSERT INTO mcp_servers (
                id, name, display_name, scope, origin, transport, command, args_json, url, env_json,
                enabled, status, trust, version, timeout_ms, project_id, last_connected_at, last_error,
                restart_count, tool_count, resource_count, prompt_count, metadata_json, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                display_name = excluded.display_name,
                scope = excluded.scope,
                origin = excluded.origin,
                transport = excluded.transport,
                command = excluded.command,
                args_json = excluded.args_json,
                url = excluded.url,
                env_json = excluded.env_json,
                enabled = excluded.enabled,
                status = excluded.status,
                trust = excluded.trust,
                version = excluded.version,
                timeout_ms = excluded.timeout_ms,
                project_id = excluded.project_id,
                last_connected_at = excluded.last_connected_at,
                last_error = excluded.last_error,
                restart_count = excluded.restart_count,
                tool_count = excluded.tool_count,
                resource_count = excluded.resource_count,
                prompt_count = excluded.prompt_count,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at",
            params![
                record.id,
                record.name,
                record.display_name,
                record.scope,
                record.origin,
                record.transport,
                record.command,
                record.args_json,
                record.url,
                record.env_json,
                record.enabled,
                record.status,
                record.trust,
                record.version,
                record.timeout_ms,
                record.project_id,
                record.last_connected_at,
                record.last_error,
                record.restart_count,
                record.tool_count,
                record.resource_count,
                record.prompt_count,
                record.metadata_json,
                record.created_at,
                record.updated_at
            ],
        )?;
        Ok(record.clone())
    }

    pub fn get_mcp_server(&self, id: &str) -> AppResult<Option<McpServerRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, name, display_name, scope, origin, transport, command, args_json, url, env_json,
                    enabled, status, trust, version, timeout_ms, project_id, last_connected_at, last_error,
                    restart_count, tool_count, resource_count, prompt_count, metadata_json, created_at, updated_at
             FROM mcp_servers WHERE id = ?1",
        )?;
        Ok(statement
            .query_row([id], Self::map_mcp_server_row)
            .optional()?)
    }

    pub fn list_mcp_servers(&self, project_id: Option<&str>) -> AppResult<Vec<McpServerRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, name, display_name, scope, origin, transport, command, args_json, url, env_json,
                    enabled, status, trust, version, timeout_ms, project_id, last_connected_at, last_error,
                    restart_count, tool_count, resource_count, prompt_count, metadata_json, created_at, updated_at
             FROM mcp_servers
             WHERE scope = 'global' OR (?1 != '' AND project_id = ?1)
             ORDER BY name",
        )?;
        let rows = statement.query_map([project_id.unwrap_or("")], Self::map_mcp_server_row)?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn delete_mcp_server(&self, id: &str) -> AppResult<()> {
        self.conn()?.execute("DELETE FROM mcp_servers WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn replace_mcp_capabilities(&self, server_id: &str, records: &[McpCapabilityRecord]) -> AppResult<()> {
        let connection = self.conn()?;
        connection.execute("DELETE FROM mcp_capabilities WHERE server_id = ?1", [server_id])?;
        for record in records {
            connection.execute(
                "INSERT INTO mcp_capabilities (id, server_id, type, name, description, uri, schema_json, enabled, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    record.id,
                    record.server_id,
                    record.kind,
                    record.name,
                    record.description,
                    record.uri,
                    record.schema_json,
                    record.enabled,
                    record.created_at,
                    record.updated_at
                ],
            )?;
        }
        Ok(())
    }

    pub fn set_mcp_capability_enabled(&self, id: &str, enabled: i64, updated_at: i64) -> AppResult<()> {
        self.conn()?.execute(
            "UPDATE mcp_capabilities SET enabled = ?1, updated_at = ?2 WHERE id = ?3",
            params![enabled, updated_at, id],
        )?;
        Ok(())
    }

    pub fn list_mcp_capabilities(&self, server_id: &str) -> AppResult<Vec<McpCapabilityRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, server_id, type, name, description, uri, schema_json, enabled, created_at, updated_at
             FROM mcp_capabilities WHERE server_id = ?1 ORDER BY type, name",
        )?;
        let rows = statement.query_map([server_id], |row| {
            Ok(McpCapabilityRecord {
                id: row.get(0)?,
                server_id: row.get(1)?,
                kind: row.get(2)?,
                name: row.get(3)?,
                description: row.get(4)?,
                uri: row.get(5)?,
                schema_json: row.get(6)?,
                enabled: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn insert_mcp_usage(&self, record: &McpUsageRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO mcp_usage (id, run_id, server_id, capability_id, tool_name, started_at, finished_at, status, metadata_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                finished_at = excluded.finished_at,
                status = excluded.status,
                metadata_json = excluded.metadata_json",
            params![
                record.id,
                record.run_id,
                record.server_id,
                record.capability_id,
                record.tool_name,
                record.started_at,
                record.finished_at,
                record.status,
                record.metadata_json
            ],
        )?;
        Ok(())
    }

    pub fn list_mcp_usage(&self, run_id: &str) -> AppResult<Vec<McpUsageRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, run_id, server_id, capability_id, tool_name, started_at, finished_at, status, metadata_json
             FROM mcp_usage WHERE run_id = ?1 ORDER BY started_at",
        )?;
        let rows = statement.query_map([run_id], |row| {
            Ok(McpUsageRecord {
                id: row.get(0)?,
                run_id: row.get(1)?,
                server_id: row.get(2)?,
                capability_id: row.get(3)?,
                tool_name: row.get(4)?,
                started_at: row.get(5)?,
                finished_at: row.get(6)?,
                status: row.get(7)?,
                metadata_json: row.get(8)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn reset_application_data(&self) -> AppResult<()> {
        let connection = self.conn()?;
        connection.execute_batch(
            "DELETE FROM messages;
             DELETE FROM tool_calls;
             DELETE FROM agent_steps;
             DELETE FROM agent_event_traces;
             DELETE FROM tasks;
             DELETE FROM agent_runs;
             DELETE FROM agent_sessions;
             DELETE FROM model_usage;
             DELETE FROM agent_memory;
             DELETE FROM project_files;
             DELETE FROM conversations;
             DELETE FROM project_settings;
             DELETE FROM project_github_repositories;
             DELETE FROM projects;
             DELETE FROM github_accounts;
             DELETE FROM global_settings;
             DELETE FROM accounts;
             DELETE FROM settings;
             DELETE FROM rag_chunks_fts;
             DELETE FROM mcp_usage;
             DELETE FROM mcp_capabilities;
             DELETE FROM mcp_servers;
             DELETE FROM ai_review_decisions;
             DELETE FROM ai_change_hunks;
             DELETE FROM ai_file_changes;
             DELETE FROM ai_change_sets;
             DELETE FROM knowledge_proposals;
             DELETE FROM schema_migrations WHERE version NOT IN ('001_initial', '002_sessions', '003_harness_observability', '004_account_project', '005_run_observability', '006_mcp', '007_ai_review', '008_knowledge_proposals');",
        )?;
        self.seed_agents()?;
        self.bootstrap_account_model()?;
        let vector_dir = self.data_dir.join("vector");
        if vector_dir.exists() {
            let _ = fs::remove_dir_all(&vector_dir);
        }
        let traces_dir = self.data_dir.join("traces");
        if traces_dir.exists() {
            let _ = fs::remove_dir_all(&traces_dir);
        }
        Ok(())
    }

    pub fn export_application_data(&self) -> AppResult<PathBuf> {
        let backup_dir = self.data_dir.join("backups");
        fs::create_dir_all(&backup_dir)?;
        let dest = backup_dir.join(format!("kursor-{}.db", now_ms()));
        fs::copy(&self.path, &dest)?;
        let vector_src = self.data_dir.join("vector");
        if vector_src.exists() {
            copy_dir(&vector_src, &backup_dir.join(format!("vector-{}", now_ms())))?;
        }
        Ok(dest)
    }
}

fn fts_query(raw: &str) -> String {
    raw.split_whitespace()
        .filter_map(|part| {
            let cleaned: String = part
                .chars()
                .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '_')
                .collect();
            if cleaned.len() < 2 {
                None
            } else {
                Some(format!("\"{cleaned}\""))
            }
        })
        .collect::<Vec<_>>()
        .join(" OR ")
}

impl Database {
    pub fn save_ai_change_set(&self, record: &AiChangeSetRecord) -> AppResult<()> {
        let mut connection = self.conn()?;
        let tx = connection.transaction()?;
        tx.execute(
            "INSERT INTO ai_change_sets (id, account_id, project_id, run_id, conversation_id, agent_id, model, status, created_at, updated_at, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
                account_id = excluded.account_id,
                project_id = excluded.project_id,
                run_id = excluded.run_id,
                conversation_id = excluded.conversation_id,
                agent_id = excluded.agent_id,
                model = excluded.model,
                status = excluded.status,
                updated_at = excluded.updated_at,
                completed_at = excluded.completed_at",
            params![
                record.id,
                record.account_id,
                record.project_id,
                record.run_id,
                record.conversation_id,
                record.agent_id,
                record.model,
                record.status,
                record.created_at,
                record.updated_at,
                record.completed_at
            ],
        )?;
        tx.execute(
            "DELETE FROM ai_change_hunks WHERE file_change_id IN (SELECT id FROM ai_file_changes WHERE change_set_id = ?1)",
            params![record.id],
        )?;
        tx.execute("DELETE FROM ai_file_changes WHERE change_set_id = ?1", params![record.id])?;
        for file in &record.files {
            tx.execute(
                "INSERT INTO ai_file_changes (
                    id, change_set_id, path, previous_path, kind, base_hash, proposed_hash, current_hash,
                    base_content, proposed_content, additions, deletions, status, binary, too_large,
                    tool_call_ids_json, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
                params![
                    file.id,
                    record.id,
                    file.path,
                    file.previous_path,
                    file.kind,
                    file.base_hash,
                    file.proposed_hash,
                    file.current_hash,
                    file.base_content,
                    file.proposed_content,
                    file.additions,
                    file.deletions,
                    file.status,
                    file.binary,
                    file.too_large,
                    file.tool_call_ids_json,
                    file.created_at,
                    file.updated_at
                ],
            )?;
            for (index, hunk) in file.hunks.iter().enumerate() {
                tx.execute(
                    "INSERT INTO ai_change_hunks (
                        id, file_change_id, old_start, old_lines, new_start, new_lines, original_text, proposed_text,
                        patch, reverse_patch, status, tool_call_id, hunk_index, created_at, reviewed_at, reviewed_by
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                    params![
                        hunk.id,
                        file.id,
                        hunk.old_start,
                        hunk.old_lines,
                        hunk.new_start,
                        hunk.new_lines,
                        hunk.original_text,
                        hunk.proposed_text,
                        hunk.patch,
                        hunk.reverse_patch,
                        hunk.status,
                        hunk.tool_call_id,
                        hunk.hunk_index.max(index as i64),
                        hunk.created_at,
                        hunk.reviewed_at,
                        hunk.reviewed_by
                    ],
                )?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn get_ai_change_set(&self, id: &str) -> AppResult<Option<AiChangeSetRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, account_id, project_id, run_id, conversation_id, agent_id, model, status, created_at, updated_at, completed_at
             FROM ai_change_sets WHERE id = ?1",
        )?;
        let record = statement
            .query_row([id], map_ai_change_set_row)
            .optional()?;
        drop(statement);
        Ok(match record {
            Some(mut value) => {
                value.files = self.load_ai_files(id)?;
                Some(value)
            }
            None => None,
        })
    }

    pub fn list_open_ai_change_sets(&self, project_id: &str) -> AppResult<Vec<AiChangeSetRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, account_id, project_id, run_id, conversation_id, agent_id, model, status, created_at, updated_at, completed_at
             FROM ai_change_sets
             WHERE project_id = ?1 AND status IN ('active', 'pending-review', 'partially-reviewed', 'conflicted')
             ORDER BY updated_at DESC",
        )?;
        let rows = statement.query_map([project_id], map_ai_change_set_row)?;
        let mut sets: Vec<AiChangeSetRecord> = rows.filter_map(Result::ok).collect();
        drop(statement);
        for record in &mut sets {
            record.files = self.load_ai_files(&record.id)?;
        }
        Ok(sets)
    }

    pub fn insert_ai_review_decision(&self, record: &AiReviewDecisionRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO ai_review_decisions (id, change_set_id, file_change_id, hunk_id, scope, decision, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                record.id,
                record.change_set_id,
                record.file_change_id,
                record.hunk_id,
                record.scope,
                record.decision,
                record.created_at
            ],
        )?;
        Ok(())
    }

    fn load_ai_files(&self, change_set_id: &str) -> AppResult<Vec<AiFileChangeRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, change_set_id, path, previous_path, kind, base_hash, proposed_hash, current_hash,
                    base_content, proposed_content, additions, deletions, status, binary, too_large,
                    tool_call_ids_json, created_at, updated_at
             FROM ai_file_changes WHERE change_set_id = ?1 ORDER BY path",
        )?;
        let rows = statement.query_map([change_set_id], map_ai_file_row)?;
        let mut files: Vec<AiFileChangeRecord> = rows.filter_map(Result::ok).collect();
        drop(statement);
        for file in &mut files {
            file.hunks = self.load_ai_hunks(&file.id)?;
        }
        Ok(files)
    }

    fn load_ai_hunks(&self, file_change_id: &str) -> AppResult<Vec<AiChangeHunkRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, file_change_id, old_start, old_lines, new_start, new_lines, original_text, proposed_text,
                    patch, reverse_patch, status, tool_call_id, hunk_index, created_at, reviewed_at, reviewed_by
             FROM ai_change_hunks WHERE file_change_id = ?1 ORDER BY hunk_index, old_start",
        )?;
        let rows = statement.query_map([file_change_id], map_ai_hunk_row)?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn upsert_knowledge_proposal(&self, record: &KnowledgeProposalRecord) -> AppResult<()> {
        self.conn()?.execute(
            "INSERT INTO knowledge_proposals (id, project_id, run_id, conversation_id, status, summary, payload_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                project_id = excluded.project_id,
                run_id = excluded.run_id,
                conversation_id = excluded.conversation_id,
                status = excluded.status,
                summary = excluded.summary,
                payload_json = excluded.payload_json,
                updated_at = excluded.updated_at",
            params![
                record.id,
                record.project_id,
                record.run_id,
                record.conversation_id,
                record.status,
                record.summary,
                record.payload_json,
                record.created_at,
                record.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get_knowledge_proposal(&self, id: &str) -> AppResult<Option<KnowledgeProposalRecord>> {
        self.conn()?
            .query_row(
                "SELECT id, project_id, run_id, conversation_id, status, summary, payload_json, created_at, updated_at
                 FROM knowledge_proposals WHERE id = ?1",
                [id],
                map_knowledge_proposal_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_knowledge_proposals(&self, project_id: &str, status: Option<&str>) -> AppResult<Vec<KnowledgeProposalRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, project_id, run_id, conversation_id, status, summary, payload_json, created_at, updated_at
             FROM knowledge_proposals
             WHERE project_id = ?1 AND (?2 IS NULL OR status = ?2)
             ORDER BY updated_at DESC",
        )?;
        let rows = statement.query_map(params![project_id, status], map_knowledge_proposal_row)?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    pub fn list_knowledge_proposals_for_conversation(&self, conversation_id: &str) -> AppResult<Vec<KnowledgeProposalRecord>> {
        let connection = self.conn()?;
        let mut statement = connection.prepare(
            "SELECT id, project_id, run_id, conversation_id, status, summary, payload_json, created_at, updated_at
             FROM knowledge_proposals
             WHERE conversation_id = ?1
             ORDER BY updated_at DESC",
        )?;
        let rows = statement.query_map([conversation_id], map_knowledge_proposal_row)?;
        Ok(rows.filter_map(Result::ok).collect())
    }
}

fn map_knowledge_proposal_row(row: &Row<'_>) -> rusqlite::Result<KnowledgeProposalRecord> {
    Ok(KnowledgeProposalRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        run_id: row.get(2)?,
        conversation_id: row.get(3)?,
        status: row.get(4)?,
        summary: row.get(5)?,
        payload_json: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn map_ai_change_set_row(row: &Row<'_>) -> rusqlite::Result<AiChangeSetRecord> {
    Ok(AiChangeSetRecord {
        id: row.get(0)?,
        account_id: row.get(1)?,
        project_id: row.get(2)?,
        run_id: row.get(3)?,
        conversation_id: row.get(4)?,
        agent_id: row.get(5)?,
        model: row.get(6)?,
        status: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        completed_at: row.get(10)?,
        files: Vec::new(),
    })
}

fn map_ai_file_row(row: &Row<'_>) -> rusqlite::Result<AiFileChangeRecord> {
    Ok(AiFileChangeRecord {
        id: row.get(0)?,
        change_set_id: row.get(1)?,
        path: row.get(2)?,
        previous_path: row.get(3)?,
        kind: row.get(4)?,
        base_hash: row.get(5)?,
        proposed_hash: row.get(6)?,
        current_hash: row.get(7)?,
        base_content: row.get(8)?,
        proposed_content: row.get(9)?,
        additions: row.get(10)?,
        deletions: row.get(11)?,
        status: row.get(12)?,
        binary: row.get(13)?,
        too_large: row.get(14)?,
        tool_call_ids_json: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
        hunks: Vec::new(),
    })
}

fn map_ai_hunk_row(row: &Row<'_>) -> rusqlite::Result<AiChangeHunkRecord> {
    Ok(AiChangeHunkRecord {
        id: row.get(0)?,
        file_change_id: row.get(1)?,
        old_start: row.get(2)?,
        old_lines: row.get(3)?,
        new_start: row.get(4)?,
        new_lines: row.get(5)?,
        original_text: row.get(6)?,
        proposed_text: row.get(7)?,
        patch: row.get(8)?,
        reverse_patch: row.get(9)?,
        status: row.get(10)?,
        tool_call_id: row.get(11)?,
        hunk_index: row.get(12)?,
        created_at: row.get(13)?,
        reviewed_at: row.get(14)?,
        reviewed_by: row.get(15)?,
    })
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let dest = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &dest)?;
        } else {
            fs::copy(entry.path(), dest)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn initial_migration_creates_core_tables() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch(include_str!("migrations/001_initial.sql")).unwrap();
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('settings', 'projects', 'conversations', 'messages', 'agent_runs')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 5);
    }

    #[test]
    fn fts_query_keeps_safe_tokens() {
        let query = fts_query("Comment fonctionne la gestion des todos ?");
        assert!(query.contains("\"todos\""));
        assert!(!query.contains('?'));
    }

    #[test]
    fn bootstraps_local_account_and_isolates_conversations() {
        let db = Database::open_memory().unwrap();
        let account = db.current_account().unwrap();
        assert_eq!(account.provider, "local");

        let project_a = db
            .upsert_project(&ProjectRecord {
                id: uuid::Uuid::new_v4().to_string(),
                account_id: Some(account.id.clone()),
                name: "TodoApp".into(),
                root_path: "/projects/A".into(),
                created_at: 1,
                updated_at: 1,
                last_opened_at: Some(1),
            })
            .unwrap();
        let project_b = db
            .upsert_project(&ProjectRecord {
                id: uuid::Uuid::new_v4().to_string(),
                account_id: Some(account.id.clone()),
                name: "MyWebsite".into(),
                root_path: "/projects/B".into(),
                created_at: 2,
                updated_at: 2,
                last_opened_at: Some(2),
            })
            .unwrap();

        db.upsert_conversation(&ConversationRecord {
            id: "a1".into(),
            project_id: Some(project_a.id.clone()),
            title: "Ajoute un système de filtre".into(),
            created_at: 1,
            updated_at: 1,
            archived: 0,
        })
        .unwrap();
        db.upsert_conversation(&ConversationRecord {
            id: "b1".into(),
            project_id: Some(project_b.id.clone()),
            title: "Ajoute une page contact".into(),
            created_at: 2,
            updated_at: 2,
            archived: 0,
        })
        .unwrap();

        let listed_a = db.list_conversations(Some(&project_a.id), false).unwrap();
        let listed_b = db.list_conversations(Some(&project_b.id), false).unwrap();
        assert_eq!(listed_a.iter().map(|item| item.id.as_str()).collect::<Vec<_>>(), vec!["a1"]);
        assert_eq!(listed_b.iter().map(|item| item.id.as_str()).collect::<Vec<_>>(), vec!["b1"]);
        db.upsert_conversation(&ConversationRecord {
            id: "orphan".into(),
            project_id: None,
            title: "Unassigned".into(),
            created_at: 3,
            updated_at: 3,
            archived: 0,
        })
        .unwrap();
        assert!(!db
            .list_conversations(Some(&project_a.id), false)
            .unwrap()
            .iter()
            .any(|item| item.id == "orphan"));
        assert_eq!(
            db.list_conversations(None, false)
                .unwrap()
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["orphan"]
        );
        assert!(db.get_project_by_path("/projects/A").unwrap().is_some());
    }

    #[test]
    fn mcp_tables_roundtrip_without_secrets() {
        let db = Database::open_memory().unwrap();
        let record = McpServerRecord {
            id: "github".into(),
            name: "github".into(),
            display_name: Some("GitHub MCP".into()),
            scope: "global".into(),
            origin: "user".into(),
            transport: "stdio".into(),
            command: Some("npx".into()),
            args_json: Some("[\"-y\",\"@modelcontextprotocol/server-github\"]".into()),
            url: None,
            env_json: Some("[{\"name\":\"GITHUB_TOKEN\",\"secretRef\":\"secret://github/GITHUB_TOKEN\",\"required\":true}]".into()),
            enabled: 1,
            status: "disconnected".into(),
            trust: "untrusted".into(),
            version: None,
            timeout_ms: Some(30_000),
            project_id: None,
            last_connected_at: None,
            last_error: None,
            restart_count: 0,
            tool_count: 0,
            resource_count: 0,
            prompt_count: 0,
            metadata_json: None,
            created_at: 1,
            updated_at: 1,
        };
        db.upsert_mcp_server(&record).unwrap();
        let stored = db.get_mcp_server("github").unwrap().unwrap();
        assert!(stored.env_json.unwrap().contains("secretRef"));
        assert!(!stored.args_json.unwrap().contains("ghp_"));
        db.replace_mcp_capabilities(
            "github",
            &[McpCapabilityRecord {
                id: "mcp.github.tool.search".into(),
                server_id: "github".into(),
                kind: "mcp-tool".into(),
                name: "search".into(),
                description: Some("Search".into()),
                uri: None,
                schema_json: Some("{\"type\":\"object\"}".into()),
                enabled: 1,
                created_at: 1,
                updated_at: 1,
            }],
        )
        .unwrap();
        assert_eq!(db.list_mcp_capabilities("github").unwrap().len(), 1);
    }

    #[test]
    fn ai_review_change_set_roundtrip() {
        let db = Database::open_memory().unwrap();
        let set = AiChangeSetRecord {
            id: "cs1".into(),
            account_id: Some("local-account".into()),
            project_id: "p1".into(),
            run_id: "r1".into(),
            conversation_id: Some("c1".into()),
            agent_id: Some("coding-agent".into()),
            model: Some("test-model".into()),
            status: "pending-review".into(),
            created_at: 1,
            updated_at: 2,
            completed_at: None,
            files: vec![AiFileChangeRecord {
                id: "f1".into(),
                change_set_id: "cs1".into(),
                path: "src/a.ts".into(),
                previous_path: None,
                kind: "modified".into(),
                base_hash: Some("aaa".into()),
                proposed_hash: Some("bbb".into()),
                current_hash: Some("bbb".into()),
                base_content: Some("old".into()),
                proposed_content: Some("new".into()),
                additions: 1,
                deletions: 1,
                status: "pending".into(),
                binary: 0,
                too_large: 0,
                tool_call_ids_json: Some("[\"t1\"]".into()),
                created_at: 1,
                updated_at: 2,
                hunks: vec![AiChangeHunkRecord {
                    id: "h1".into(),
                    file_change_id: "f1".into(),
                    old_start: 1,
                    old_lines: 1,
                    new_start: 1,
                    new_lines: 1,
                    original_text: "old".into(),
                    proposed_text: "new".into(),
                    patch: "@@ -1,1 +1,1 @@".into(),
                    reverse_patch: Some("@@ -1,1 +1,1 @@".into()),
                    status: "pending".into(),
                    tool_call_id: Some("t1".into()),
                    hunk_index: 0,
                    created_at: 1,
                    reviewed_at: None,
                    reviewed_by: None,
                }],
            }],
        };
        db.save_ai_change_set(&set).unwrap();
        let loaded = db.get_ai_change_set("cs1").unwrap().unwrap();
        assert_eq!(loaded.files.len(), 1);
        assert_eq!(loaded.files[0].hunks.len(), 1);
        assert_eq!(loaded.files[0].hunks[0].proposed_text, "new");
        let open = db.list_open_ai_change_sets("p1").unwrap();
        assert_eq!(open.len(), 1);
        db.insert_ai_review_decision(&AiReviewDecisionRecord {
            id: "d1".into(),
            change_set_id: "cs1".into(),
            file_change_id: Some("f1".into()),
            hunk_id: Some("h1".into()),
            scope: "hunk".into(),
            decision: "accept".into(),
            created_at: 3,
        })
        .unwrap();
    }
}
