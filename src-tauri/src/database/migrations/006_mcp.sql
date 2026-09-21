CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    display_name TEXT,
    scope TEXT NOT NULL DEFAULT 'global',
    origin TEXT NOT NULL DEFAULT 'user',
    transport TEXT NOT NULL DEFAULT 'stdio',
    command TEXT,
    args_json TEXT,
    url TEXT,
    env_json TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'disconnected',
    trust TEXT NOT NULL DEFAULT 'untrusted',
    version TEXT,
    timeout_ms INTEGER,
    project_id TEXT,
    last_connected_at INTEGER,
    last_error TEXT,
    restart_count INTEGER NOT NULL DEFAULT 0,
    tool_count INTEGER NOT NULL DEFAULT 0,
    resource_count INTEGER NOT NULL DEFAULT 0,
    prompt_count INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_scope ON mcp_servers(scope, project_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);

CREATE TABLE IF NOT EXISTS mcp_capabilities (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    uri TEXT,
    schema_json TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mcp_capabilities_server ON mcp_capabilities(server_id, type);

CREATE TABLE IF NOT EXISTS mcp_usage (
    id TEXT PRIMARY KEY,
    run_id TEXT,
    server_id TEXT NOT NULL,
    capability_id TEXT,
    tool_name TEXT,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    status TEXT NOT NULL,
    metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcp_usage_run ON mcp_usage(run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_mcp_usage_server ON mcp_usage(server_id, started_at);
