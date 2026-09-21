CREATE TABLE IF NOT EXISTS agent_steps (
    id TEXT PRIMARY KEY,
    agent_run_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(agent_run_id, step_index);

CREATE TABLE IF NOT EXISTS agent_event_traces (
    id TEXT PRIMARY KEY,
    run_id TEXT,
    session_id TEXT,
    task_id TEXT,
    seq INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_traces_run ON agent_event_traces(run_id, seq);
