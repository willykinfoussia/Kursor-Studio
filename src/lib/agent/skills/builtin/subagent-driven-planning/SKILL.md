---
name: subagent-driven-planning
description: Use after writing-plans, before create_plan — dispatch explore subagents to map KEEP/EXTEND, files, contracts, and how to verify
---

# Subagent-Driven Planning

Use isolated **explore** subagents to gather what already exists (KEEP / EXTEND / missing), short existing excerpts, and verification commands. You write `create_plan`; children only research. You write Problem and the impact table; children do not write the plan.

**Announce at start:** "I'm using subagent-driven-planning to research the implementation plan."

**REQUIRED:** `load_skill` this skill after `writing-plans`, then dispatch at least two `agent` calls with `subagent_type: "explore"` in the same response before `create_plan`.

## Process

1. Load `writing-plans`. Do not call `create_plan` yet.
2. Split research into focused explores: components to KEEP/EXTEND, files to touch, tests/scripts to cite, similar patterns in the repo.
3. Dispatch at least two `explore` subagents with `explore-prompt.md` in the same response. Parallelize independent lookups. A single spawn is rejected.
4. Fold findings into a full plan body (Problem, Architecture, KEEP/EXTEND impact, mermaid, contract excerpts, per-todo files and how to verify). Outline-only plans are rejected.
5. Call `create_plan`. Tell the human to press **Build** — do not implement.

## Dispatch rules

- `explore` only. No `implement` until Build.
- Always dispatch at least two `agent` calls in the same response.
- Children must not spawn subagents.
- Never make a child read the entire chat. Pass paths and the design constraints it needs.

## Do not

- Skip explore because you "already saw the repo" during brainstorming — planning needs file-level evidence
- Write `.plan.md` with `write_file`
- Start coding after `create_plan`
