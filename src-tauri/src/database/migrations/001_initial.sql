CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_opened_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_projects_last_opened ON projects(last_opened_at DESC);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT,
    created_at INTEGER NOT NULL,
    token_input INTEGER,
    token_output INTEGER,
    latency_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    project_id TEXT,
    agent_id TEXT,
    status TEXT NOT NULL,
    model TEXT,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation ON agent_runs(conversation_id, started_at DESC);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    agent_run_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    agent_run_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    input_json TEXT,
    output_json TEXT,
    status TEXT NOT NULL,
    started_at INTEGER,
    finished_at INTEGER,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_run ON tool_calls(agent_run_id, started_at);

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT,
    model TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_memory (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    project_id TEXT,
    memory_type TEXT NOT NULL,
    memory_key TEXT,
    content TEXT NOT NULL,
    importance REAL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_project_type ON agent_memory(project_id, memory_type);

CREATE TABLE IF NOT EXISTS project_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    path TEXT NOT NULL,
    language TEXT,
    file_type TEXT,
    file_size INTEGER,
    content_hash TEXT,
    indexed_at INTEGER,
    updated_at INTEGER,
    UNIQUE(project_id, path)
);

CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id);

CREATE TABLE IF NOT EXISTS model_usage (
    id TEXT PRIMARY KEY,
    agent_run_id TEXT,
    model TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    latency_ms INTEGER,
    status TEXT,
    fallback_from TEXT,
    fallback_to TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_model_usage_created ON model_usage(created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts USING fts5(
    chunk_id UNINDEXED,
    project_id UNINDEXED,
    path,
    content,
    tokenize = 'porter'
);
