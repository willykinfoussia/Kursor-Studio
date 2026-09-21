---
name: using-kursor-shell
description: Use before run_command or start_process — Windows cmd syntax, one command per call, no bash pipes
---

# Using Kursor shell

`run_command` and `start_process` execute via **Windows `cmd.exe`**, not bash. Load this skill before any of those tools.

**Announce at start:** "I'm using the using-kursor-shell skill for commands."

## Hard rules

- **One command per tool call.** No `&&`, no `;`, no `|`.
- Never use bash-only syntax: `2>&1`, `| head`, `| tail`, `pwd`, `ls`, `sleep`, `NODE_OPTIONS=foo cmd`.
- Never pipe into npm, npx, or pnpm. Use `npm install`, not `npm install 2>&1 | tail`.
- Do not use `run_command` for git history, status, commit, push, pull, or fetch. Use `git_status`, `git_diff`, `git_commit`, `git_push`, `git_pull`, `git_fetch`.
- Long-running servers (`npm run dev`, `pnpm dev`) → `start_process`, never `sleep` then `curl`.
- List files with `list_files`. Do not `pwd` or `ls`.

## Scaffolding in this project

Stay in the **current project root**. Do not create a sibling repo (for example `C:\GitHub\stock-trading-simulator` next to the open project).

If the folder name has capitals (`TestA`), do **not** rename the repo. `create-next-app` rejects mixed-case npm names: pass a lowercase `"name"` in `package.json`, or scaffold into the current root with a lowercase `--name` / package name. Keep the existing directory name.

Prefer filesystem tools (`create_file`, `write_file`, `create_directory`) over `mkdir` via `run_command`.

## cmd equivalents

| Do not use | Use instead |
|---|---|
| `pwd` | project root from context / `cd` is unnecessary |
| `ls` | `list_files` or `dir` |
| `sleep 5` | wait is not a cmd builtin; do not poll with sleep |
| `cmd 2>&1 \| tail -20` | `cmd` alone; read the captured stdout/stderr |
| `NODE_OPTIONS=--foo node x` | `node x` (do not use Unix env prefixes) |
| `git log \| head` | `git_status` / `git_diff` |

## After a failure

Read the captured stderr. If npm says `EINVALIDTAGNAME` or treats `2>&1` as a tag, you piped Unix redirection into the command — retry **without** pipes. If create-next-app rejects the name, fix the package name, do not move the project.
