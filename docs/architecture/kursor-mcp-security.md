# Kursor MCP — Security

An MCP server is third-party code. Kursor never auto-trusts a server or its outputs.

## Secrets

- SQLite, manifests, logs, events, workflow nodes, and tool inputs store **names and `secretRef` only**.
- Values live in `SecretStore` (OS keyring). Allowed keys: existing AI/GitHub keys plus `mcp:<serverId>:<ENV_NAME>`.
- Environment is resolved **at spawn** and injected into the child process only.
- Untrusted servers (`trust !== "trusted"`) do not receive resolved secrets.

## Process

- Dedicated supervisor, not `ProcessManager` / PTY.
- Windows: `CREATE_NO_WINDOW`.
- Timeouts (`MCP_TIMEOUT_MS`, default 30s), max output (`MAX_MCP_TOOL_OUTPUT_CHARS`, default 20_000), crash detection, bounded reconnect (3 retries).
- Stop/kill on disable, project switch (project-scoped), and app shutdown.
- User cancel aborts the in-flight call; the session is not left hanging in the UI.

## Permissions

- MCP cannot bypass `PermissionManager`.
- Default: ask. YOLO still cannot read protected paths or run denied commands on **native** tools; MCP remains a separate capability (`mcp.invoke`).
- Disabled servers unregister tools. History is immutable.

## Untrusted data

MCP tool results, resources, and prompts are **external data**, never system instructions.

Before a resource is injected into model context (future): permission check, size limit, treat as untrusted.

MCP output must not change permission policy, grants, or tool availability.

## Trust (prepared)

`trusted | untrusted | blocked`. V1 defaults new user-added servers to `untrusted` until the user enables them. `blocked` cannot start.

Future install UI must show required network / filesystem / credentials **before** start. No marketplace auto-install in V1.

## Redaction

Never log: env values, `GITHUB_TOKEN`, `ghp_`, `secret://` resolved payloads, PID internals in model-facing messages. Structured logs use `[MCP] [<serverId>]` plus status, tool name, duration, error **code**.
