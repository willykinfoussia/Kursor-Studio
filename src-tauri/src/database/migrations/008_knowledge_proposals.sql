CREATE TABLE IF NOT EXISTS knowledge_proposals (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    conversation_id TEXT,
    status TEXT NOT NULL,
    summary TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_proposals_project
    ON knowledge_proposals(project_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_knowledge_proposals_conversation
    ON knowledge_proposals(conversation_id, updated_at);
