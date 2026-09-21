# Kursor tool mapping

Superpowers skills name Claude Code-style tools. In Kursor, use these equivalents:

| Superpowers / Claude Code | Kursor tool |
| --- | --- |
| Read | `read_file` |
| Write | `write_file` or `create_file` (creates missing parent directories) |
| Edit | `apply_patch` |
| Bash | `run_command` |
| Skill | `load_skill` |
| Agent / Task | `agent` (`subagent_type`: `explore` \| `implement` \| `review`) |
| AskUserQuestion | `ask_user_question` |
| EnterPlanMode | `enter_plan_mode` or `switch_agent_mode` (`mode`: `agent` \| `plan`). Ask and Debug are user-selected. |
| EnterWorktree / WorktreeCreate | `git_branch` (`action`: `create` \| `status`) — in-place `checkout -b` in the editor, not `.worktrees/` |
| git commit / push / pull / fetch | `git_commit`, `git_push`, `git_pull`, `git_fetch` (authenticated; do not use `run_command`) |
| TodoWrite | session todos via the parent harness (no extra tool) |
| Plan files | `create_plan` (`name`, `overview`, `body`, `todos`) writes `.kursor/plans/*.plan.md`; `update_plan_todo` (`todo_id`, `status`) tracks progress |

Use `check_skills` when you considered the catalog and no skill applies.

After **Build**, if the working tree is dirty, `git_commit` then `git_push` if origin exists, then `git_branch` creates an implementation branch in the open checkout. The editor and Git panel follow that branch. Do not create `.worktrees/`. Do not stash.

After a yes on a design, `ask_user_question` with `kind: "design"` records `designApproved`. Load `subagent-driven-brainstorming` and dispatch at least two `explore` subagents in the same response before that design question. Load `subagent-driven-planning` and dispatch at least two `explore` subagents in the same response before `create_plan`. A single `agent` spawn is rejected. Do not use `ask_user_question` to approve a plan — the human clicks **Build**. After Build, load `executing-plans` then `test-driven-development`. When every plan todo is complete, load `verification-before-completion`, then call `finish_development_branch` (no `choice` opens merge / PR / keep / discard).
