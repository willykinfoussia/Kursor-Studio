---
name: subagent-driven-brainstorming
description: Use during brainstorming, before presenting a design — dispatch explore subagents to research the codebase and options
---

# Subagent-Driven Brainstorming

Use isolated **explore** subagents to research the repo before you present a design. You stay the coordinator: classify the path, ask clarifying questions, then dispatch research — do not dump the whole session into a child.

**Announce at start:** "I'm using subagent-driven-brainstorming to research before the design."

**REQUIRED:** `load_skill` this skill after `brainstorming`, then dispatch at least two `agent` calls with `subagent_type: "explore"` in the same response before `ask_user_question` with `kind: "design"`.

## Why subagents

Fresh read-only context. The child never inherits chat history. You hand it a short brief: what to inspect, which paths, what question to answer.

## Process

1. Classify the request (spike / bounded / architectural) using brainstorming.
2. Ask only the clarifying questions that unblock research.
3. Dispatch at least two `explore` subagents with the template in `explore-prompt.md`. Independent questions run in parallel (`dispatching-parallel-agents`). A single spawn is rejected.
4. Read the findings. Do not treat a child summary as a design — you still write the design and wait for yes/oui.
5. Present the design. Use `ask_user_question` `kind: "design"` only after research returned.

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
