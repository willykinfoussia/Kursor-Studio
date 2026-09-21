# Kursor MCP — Design

MCP is a **capability source** of the Kursor harness, not a parallel tool system.

```text
AgentLoop
  → CapabilityResolver
  → ToolRegistry (native + MCP AgentTools)
  → ToolExecutor → PermissionManager
  → MCPToolAdapter → MCPRuntime (TS)
  → Tauri commands
  → MCPRuntime (Rust / rmcp)
  → MCP server (stdio)
```

The model only sees `AgentTool` entries that passed the resolver. Native tools keep names such as `read_file`. MCP tools use namespaced runtime names.

## SDK choice

The Tauri webview has no Node `child_process`. `@modelcontextprotocol/sdk` cannot be the production client.

| Role | Library |
| --- | --- |
| Production client (stdio, handshake, tools / resources / prompts) | Official Rust SDK **`rmcp` 3.x** (MCP spec `2026-07-28`) via `tauri::async_runtime` |
| Mock servers for examples / Node tests | Small stdio JSON-RPC doubles under `examples/mcp/` |

V1 implements **stdio only**. Streamable HTTP and legacy HTTP+SSE are typed (`transport: "stdio" | "sse" | "streamable-http"`) but rejected at start with a clear error.

Do not reimplement JSON-RPC framing, initialize, or capability negotiation in TypeScript.

Do not reuse `ProcessManager`: agent `start_process` discards stdout. MCP uses a dedicated supervisor (`TokioChildProcess`).

## Identity

| Kind | Value |
| --- | --- |
| Capability id | `mcp.<serverId>.tool.<toolName>` |
| Resource id | `mcp.<serverId>.resource.<encodedUri>` |
| Prompt id | `mcp.<serverId>.prompt.<promptName>` |
| Runtime tool name (LLM) | `mcp__<serverId>__<toolName>` |
| Native runtime name | unchanged (`read_file`) |
| Native capability id (façade) | `builtin.tool.read_file` |

`serverId` is `[a-z0-9][a-z0-9-]*`. Tool names keep the MCP server's original name.

## Lifecycle

```text
disabled → enabled → starting → connecting → initializing → discovering → ready
                                                      ↘ error → retry → connecting
```

`MCPReconnectPolicy`: `enabled=true`, `maxRetries=3`, exponential backoff. Never retry forever.

Startup of Kursor must not block on MCP. A failed server is `error` / unavailable; the agent still starts.

Project switch:

- stop `scope=project` servers of the previous root
- keep `scope=global`
- load `<project>/.kursor/mcp.json` and start enabled project servers

## Configuration

Files are **import sources**, not the live source of truth. SQLite holds configuration, metadata, discovery snapshots, and usage. Live processes stay in memory.

Sources (V1 loads user + project):

- Global: `{appData}/mcp/` (`mcp.json` or per-server files)
- Project: `<project>/.kursor/mcp.json`
- Origins: `user` | `project` | `imported` | `builtin` (builtin reserved)

Claude-style `{ "mcpServers": { "github": { "command", "args", "env" } } }` is imported into the Kursor model (`transport` defaults to `stdio`). Env values that look like secrets must be stored as `secretRef`, never as plaintext.

## Capability resolution

```text
registered ∩ enabled ∩ connected/ready ∩ project-or-global scope ∩ agent allow-list ∩ !denied
```

Disabled or disconnected MCP servers do not appear in `streamText` tools. Past runs keep their traces.

## Permissions

Every MCP tool is an `AgentTool` with capability `mcp.invoke`. It goes through `PermissionManager` and `ToolExecutor` (hooks, timeout, abort). Default approval is `ask`. Annotations map risk:

- `readOnlyHint` → low, auto when mode allows
- `destructiveHint` → high, always ask
- default (third party) → high, ask

## Events

MCP runtime events are redacted, then converted to `AgentEvent` / `AgentRunEvent`. The workflow graph never listens to the process supervisor.

Tool calls still emit `tool-started` / `tool-completed` so chat and the projector keep working. Names starting with `mcp__` project as `mcp_server` → `mcp_tool`.

## Out of V1

Marketplace, remote install, generic OAuth, OS sandbox, Streamable HTTP client, full Capabilities page, per-agent MCP processes. Types `MCPPackage`, `trust`, `version` exist for later install/review.
