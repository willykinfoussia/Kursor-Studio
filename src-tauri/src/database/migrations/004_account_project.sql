CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    username TEXT,
    display_name TEXT,
    avatar_url TEXT,
    onboarded INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS github_accounts (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    github_user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    avatar_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_accounts_account ON github_accounts(account_id);

CREATE TABLE IF NOT EXISTS project_github_repositories (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    github_repository_id TEXT,
    owner TEXT,
    name TEXT,
    full_name TEXT,
    html_url TEXT,
    clone_url TEXT,
    default_branch TEXT,
    private INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_project_github_project ON project_github_repositories(project_id);

CREATE TABLE IF NOT EXISTS global_settings (
    account_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(account_id, key)
);

CREATE TABLE IF NOT EXISTS project_settings (
    project_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(project_id, key)
);
