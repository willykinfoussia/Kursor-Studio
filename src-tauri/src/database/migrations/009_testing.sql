CREATE TABLE IF NOT EXISTS test_strategies (
    project_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_cases (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_cases_project ON user_cases(project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS test_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    task_id TEXT,
    agent_run_id TEXT,
    commit_sha TEXT,
    branch TEXT,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    duration_ms INTEGER,
    payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_test_runs_project ON test_runs(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_task ON test_runs(task_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_status ON test_runs(project_id, status);

CREATE TABLE IF NOT EXISTS test_results (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    task_id TEXT,
    user_case_id TEXT,
    name TEXT NOT NULL,
    test_type TEXT NOT NULL,
    runner TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER,
    error TEXT,
    file TEXT
);

CREATE INDEX IF NOT EXISTS idx_test_results_run ON test_results(run_id);
CREATE INDEX IF NOT EXISTS idx_test_results_project ON test_results(project_id, test_type, runner);

CREATE TABLE IF NOT EXISTS coverage_snapshots (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    lines REAL,
    branches REAL,
    functions REAL,
    statements REAL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_coverage_project ON coverage_snapshots(project_id, created_at);

CREATE TABLE IF NOT EXISTS test_artifacts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    label TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_test_artifacts_run ON test_artifacts(run_id);
