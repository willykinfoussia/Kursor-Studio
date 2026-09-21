CREATE TABLE IF NOT EXISTS ai_change_sets (
    id TEXT PRIMARY KEY,
    account_id TEXT,
    project_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    conversation_id TEXT,
    agent_id TEXT,
    model TEXT,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ai_change_sets_project
    ON ai_change_sets(project_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_ai_change_sets_run
    ON ai_change_sets(run_id);

CREATE TABLE IF NOT EXISTS ai_file_changes (
    id TEXT PRIMARY KEY,
    change_set_id TEXT NOT NULL,
    path TEXT NOT NULL,
    previous_path TEXT,
    kind TEXT NOT NULL,
    base_hash TEXT,
    proposed_hash TEXT,
    current_hash TEXT,
    base_content TEXT,
    proposed_content TEXT,
    additions INTEGER NOT NULL DEFAULT 0,
    deletions INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    binary INTEGER NOT NULL DEFAULT 0,
    too_large INTEGER NOT NULL DEFAULT 0,
    tool_call_ids_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(change_set_id) REFERENCES ai_change_sets(id) ON DELETE CASCADE,
    UNIQUE(change_set_id, path)
);

CREATE INDEX IF NOT EXISTS idx_ai_file_changes_set
    ON ai_file_changes(change_set_id);

CREATE TABLE IF NOT EXISTS ai_change_hunks (
    id TEXT PRIMARY KEY,
    file_change_id TEXT NOT NULL,
    old_start INTEGER NOT NULL,
    old_lines INTEGER NOT NULL,
    new_start INTEGER NOT NULL,
    new_lines INTEGER NOT NULL,
    original_text TEXT NOT NULL,
    proposed_text TEXT NOT NULL,
    patch TEXT NOT NULL,
    reverse_patch TEXT,
    status TEXT NOT NULL,
    tool_call_id TEXT,
    hunk_index INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    reviewed_at INTEGER,
    reviewed_by TEXT,
    FOREIGN KEY(file_change_id) REFERENCES ai_file_changes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_change_hunks_file
    ON ai_change_hunks(file_change_id);

CREATE TABLE IF NOT EXISTS ai_review_decisions (
    id TEXT PRIMARY KEY,
    change_set_id TEXT NOT NULL,
    file_change_id TEXT,
    hunk_id TEXT,
    scope TEXT NOT NULL,
    decision TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(change_set_id) REFERENCES ai_change_sets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_review_decisions_set
    ON ai_review_decisions(change_set_id);
