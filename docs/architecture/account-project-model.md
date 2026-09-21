# Kursor — Account → Project model

Local-first identity model. SQLite holds structured Kursor state. OS credential storage holds secrets. The filesystem holds project files. Zustand is runtime only.

## Entities

**Account** — Kursor identity (`local` or `github`). Owns global settings, GitHub link, and projects.

**Project** — Unit of work. Identity is a UUID, never the folder name or path. `root_path` is unique per machine. GitHub remote is optional metadata.

**Conversation / AgentRun / Task / Memory / RAG** — Always keyed by `projectId` for coding work. Unassigned legacy conversations are explicit, never mixed into a project list.

## Relationships

```text
Account
 ├── GlobalSettings
 ├── GitHubAccount (metadata only)
 └── Projects
        ├── ProjectSettings
        ├── GitHubRepository (optional)
        ├── Conversations → Messages
        ├── AgentRuns → ToolCalls / Steps
        ├── Tasks
        ├── Memories (scope=project)
        ├── Knowledge proposals (post-run skill/spec review)
        └── RAG partition (vector/lancedb/{projectId}.jsonl)
```

## Database schema (migration 004)

New tables: `accounts`, `github_accounts`, `project_github_repositories`, `global_settings`, `project_settings`.

Altered: `projects.account_id`, UUID `projects.id` (legacy path ids remapped), `agent_runs.account_id`, `agent_memory.scope`.

Harness tables are kept: `agent_sessions`, `agent_steps`, `agent_event_traces`, `agents`, `model_usage`, `project_files`, FTS.

Migration 008 adds `knowledge_proposals` (pending skill/spec suggestions after a run, keyed by `project_id`).

Secrets never appear in SQLite. Tokens live in OS keyring via `SecretStore`.

## Boot flow

```text
Initialize SQLite → migrate
  → ensure local account
  → load global settings
  → load GitHub metadata (token from keyring)
  → load projects
  → if not onboarded: Welcome
  → else restore last project (or home)
  → workspace
```

No UI reads SQLite until repositories are ready.

## Project switch

```text
Stop agent if running (confirm)
  → persist conversation
  → clear runtime context
  → close editor tabs
  → kill previous terminal sessions
  → open new root + watcher
  → hydrate project conversations/tasks
  → set RuntimeContext
  → load messages
```

## Auth flow

```text
Continue with GitHub
  → PKCE + loopback http://127.0.0.1:8742/callback
  → system browser
  → token → SecretStore
  → profile → accounts + github_accounts
```

Continue locally creates/uses a local account. Disconnect GitHub deletes credentials only.

Legacy conversations with `project_id IS NULL` are **Unassigned**. They are listed separately and can be assigned to a project; they are never mixed into `list(projectId)`.

Global skills live in `{appData}/skills`; project skills in `.kursor/skills` (loaded only when a project is active) — see [skills-system.md](./skills-system.md). Global rules live in `{appData}/rules`. Account specs live in `{appData}/specs/account` (virtual path `account/specs`); project specs in `.kursor/specs/project` — see [specs-knowledge-center.md](./specs-knowledge-center.md).

Last opened project id is stored in `global_settings.last_opened_project_id`.

## Security boundaries

| Layer | Holds | Must not hold |
| --- | --- | --- |
| SecretStore / OS keyring | AI key, GitHub tokens | project files, chat |
| SQLite | account/project metadata, chats, memory | tokens |
| Filesystem | source files, `.kursor/rules`, `.kursor/skills` | secrets |
| Model context | project memory, RAG, git, conversation | tokens, other projects |
