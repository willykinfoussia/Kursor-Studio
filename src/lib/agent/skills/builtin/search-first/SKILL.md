---
name: search-first
description: Use before writing a new utility, adding a dependency, or implementing a feature that likely already exists. Search the repo and known libraries first.
triggers: [search, library, package, reuse, dependency, npm, pypi]
allowedTools: [search_files, list_files, read_file, web_search, fetch_url, load_skill]
version: "1.0"
enabled: true
---
Adapted from ECC (MIT). There is no researcher-agent tool. Use search_files, read_file, web_search, and fetch_url. Load a listed skill with load_skill. Do not claim you searched a channel you did not use.

## When

New feature with likely existing solutions; new dependency; about to write a helper; "add X".

## Workflow

0. Preflight — say which channels you will use. Skip missing ones honestly (no GitHub CLI, no MCP, no registry).
1. Need — functionality, language, constraints already in this repo.
2. Search in parallel:
   - Repo: search_files / list_files first.
   - Registry/docs: web_search then fetch_url for official docs (npm, PyPI, crates, Go).
   - Skills: listed catalog via load_skill, not `~/.claude/skills`.
3. Score: fit, maintenance, docs, license (prefer MIT/Apache), dependency cost.
4. Decide: Adopt / Extend (thin wrap) / Compose / Build (informed by what you found).
5. Implement the smallest option. Do not wrap a library until it disappears.

## Decide

| Signal | Action |
| Exact maintained MIT/Apache match | Adopt |
| Good foundation, gaps | Extend |
| Several weak matches | Compose small pieces |
| Nothing suitable | Build, cite what you checked |

## Anti-patterns

- Coding the utility before searching the repo
- "Nothing found" when you skipped web_search
- Massive package for one function
- Checking Claude skill directories or MCP paths that do not exist in Kursor
