---
name: codebase-onboarding
description: Use when joining a project, understanding an unfamiliar repo, or generating project agent instructions. Maps architecture, entry points, and conventions.
triggers: [onboard, onboarding, codebase, architecture, conventions, kursor.md, agents.md]
allowedTools: [list_files, read_file, search_files, git_status, git_diff, apply_patch]
version: "1.0"
enabled: true
---
Adapted from ECC (MIT). There is no Glob/Grep tool: use list_files and search_files. Write `KURSOR.md` or `AGENTS.md` only if the user asked. Prefer those names over `CLAUDE.md`. If `CLAUDE.md` / `AGENTS.md` / `KURSOR.md` already exists, read it and extend it; do not wipe it.

## When

"Onboard me", "explain this repo", first time in a project, generate agent instructions.

## Phase 1 — recon (parallel, do not read every file)

- Manifests: package.json, go.mod, Cargo.toml, pyproject.toml, pom.xml, etc.
- Framework configs: vite, next, django, rails, …
- Entry points: main, index, app, server, cmd/, src/main
- Top two directory levels (skip node_modules, dist, .git, build)
- Tooling: eslint, prettier, tsconfig, Makefile, Docker, CI, .env.example
- Tests: `*.test.*`, `*.spec.*`, tests/, pytest/jest/vitest config

## Phase 2 — map

Stack, architecture (mono/app/services), API style, key dirs → purpose, one request from entry to data store.

## Phase 3 — conventions

File/class naming, error style, DI vs imports, async style. Git: git_status / git_diff and recent messages if history exists; if shallow, say so.

## Output 1 — onboarding guide (in the reply)

Project in 2–3 sentences. Stack table. Entry points. Directory map. One request lifecycle. Conventions. Common commands from the real scripts. "I want to…" → path table. Flag unknowns instead of guessing.

## Output 2 — agent instructions (file only if asked)

Keep under ~100 lines. Stack, style, test/build/lint commands, structure, commit/PR habits. Do not list every dependency or restate the README.

## Avoid

Reading the whole tree. Inventing a test runner. Replacing an existing instructions file. Describing obvious folders like `src/`.
