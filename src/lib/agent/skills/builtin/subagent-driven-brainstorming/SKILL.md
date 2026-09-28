---
name: subagent-driven-brainstorming
description: Use during brainstorming, before presenting a design — dispatch explore subagents to research the codebase and options
---

# Subagent-Driven Brainstorming

Use isolated **explore** subagents to settle facts on the design-tree frontier before you present a design. You stay the coordinator: classify the path, dispatch research, then ask the human for decisions — do not dump the whole session into a child. Facts are never questions for the user. A running exploration blocks only the frontier questions that depend on it.

**Announce at start:** "I'm using subagent-driven-brainstorming to research before the design."

**REQUIRED:** `load_skill` this skill after `brainstorming`, then dispatch at least two `agent` calls with `subagent_type: "explore"` in the same response before `ask_user_question` with `kind: "design"`.

## Why subagents

Fresh read-only context. The child never inherits chat history. You hand it a short brief: what to inspect, which paths, what question to answer.

## Process

1. Classify the request (spike / bounded / architectural) using brainstorming.
2. Dispatch at least two `explore` subagents with the template in `explore-prompt.md` to settle facts the frontier depends on. Independent lookups run in parallel (`dispatching-parallel-agents`). A single spawn is rejected.
3. Read the findings. Do not treat a child summary as a decision or a design — decisions stay with the human, in frontier rounds.
4. Present the design once the frontier is empty. Use `ask_user_question` `kind: "design"` only after research returned.

## Dispatch rules

- `subagent_type` is **explore** only. Never `implement` during brainstorming.
- Always dispatch at least two `agent` calls in the same response.
- Children must not spawn subagents.
- Keep the prompt short: goal, paths to read, questions, report contract.
- If explore returns BLOCKED or empty, dispatch again with a tighter brief or read the files yourself — then still present a design.

## Do not

- Skip research because the design "feels obvious"
- Mutate files from the parent or child
- Call `create_plan` until writing-plans after design approval
