CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    conversation_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    current_step TEXT,
    current_goal TEXT,
    checkpoint_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_project_status
    ON agent_sessions(project_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_conversation
    ON agent_sessions(conversation_id, updated_at DESC);
