# Kursor

Kursor is a desktop-first agentic IDE built directly on Tauri 2. This first
version provides a real local workspace: project explorer, Monaco editor,
native PTY terminal, a streaming AI coding agent, task tracking, agent
management and settings

## Stack

- Tauri 2 and Rust
- React 19, TypeScript and Vite
- Monaco Editor, Tailwind CSS 4, Zustand and Lucide React
- xterm.js and portable-pty
- Vercel AI SDK and Vercel AI Gateway
- pnpm

## Development

```bash
pnpm install
pnpm tauri dev
```

Production builds:

```bash
pnpm build
pnpm tauri build
```

## Architecture

```text
React components
  -> Zustand / runtime abstractions
  -> src/lib/tauri typed APIs
  -> Tauri invoke
  -> Rust commands
  -> permission policy
  -> operating system
```

Open Project uses the Tauri dialog plugin to pick a folder. Filesystem
operations (list, read, write, create, rename, delete, watch) go through
typed frontend APIs into Rust commands that resolve every path inside the
active project root. The explorer and Monaco editor never talk to the OS
directly.

The human terminal is a real PTY (`portable-pty`) streamed into xterm.js.
Sessions start with `cwd = project.rootPath`. Interactive stdin, stdout,
resize and kill are supported. A separate `process_execute` command remains
an exact allowlist (`node --version`, `pnpm --version`, `git --version`)
and is not used by the user terminal. The Agent panel uses the real Vercel
AI Gateway through a standalone `AgentRuntime`; React does not contain
provider, fallback, API key or streaming logic. Agent tools are not
connected to the filesystem or terminal.

Rust project file commands are scoped to the explicitly opened project
root. No unrestricted `shell:allow-execute` permission is granted. The
Tauri capability contains `core:default`, dialog/opener permissions, and
HTTP access scoped only to `https://ai-gateway.vercel.sh/*`.

Future native tools will pass through a tool registry, permission manager
and capability layer before reaching filesystem, PTY, Git, browser,
Docker or computer-use integrations.

## AI Gateway

Copy `.env.example` to `.env` and add a Vercel AI Gateway key:

```env
AI_GATEWAY_API_KEY=
```

`.env` is ignored by Git. In development, Rust loads it and exposes only the
allowlisted secret through the Tauri command boundary. Never put a real key
in source files or commit it.

The default model route is:

1. `poolside/laguna-s-2.1-free`
2. `inclusionai/ling-3.0-flash-sante-free`
3. `deepseek/deepseek-v4-flash-0731`

Each model has a 60-second timeout and one retry for temporary failures.
Automatic fallback and the default model can be changed in Settings > AI.
Development settings also include outage simulation for validating the
fallback chain.

## Tests

```bash
pnpm test
pnpm build
```
