# Workflow observability

Kursor’s Run tab is a **projection** of the agent execution journal. It is not a second runtime. The Pipeline canvas is the teaching map of [workflow-spec.md](./workflow-spec.md), shown **one layer at a time**. On the overview, **AgentLoop is a packed box** of Superpowers filets (1% → Explain / Bug / Build → skills). Double-click the **AgentLoop frame** for the runtime only (streamText, tools, verify). Double-click Context Builder / Tool Executor / Subagents for those layers. Escape and the breadcrumb go back. The as-built LLM call registry and execution loops live in [agent-workflow.md](./agent-workflow.md). Plan interaction mode (picker, `enter_plan_mode`, `planApproved`) is [plan-mode.md](./plan-mode.md).

```text
AgentRuntime
      ↓  AgentEvent (in-process subscribe)
 EventTracer (seq, runId, sessionId, taskId)
      ↓
  Run store (AgentRunEvent[])
      ↓
  PipelineBinder  ──►  Pipeline canvas (spec map, LTR)
  RunGraphProjector ►  Trace canvas (chronological journal)
      ↓
  Workflow UI (React Flow)
```

Chat and the Run tab subscribe to the same `AgentRuntime` bus. Opening Run collapses the chat panel (`agentVisible` only for Project). `Open in Chat` still expands it.

## Pipeline vs Trace

They share `runStore`, datasources, and `AgentRunEvent`. Pipeline never invents nodes from a run: it lights the spec.

| Mode | What it shows | Source |
| --- | --- | --- |
| **Pipeline** (default) | Overview: Prompt → Session → hook → Compact → Context Builder → **AgentLoop box** (filets packed) → Result → **Knowledge reflect**. Double-click AgentLoop frame → runtime (fallback, streamText, tools, verify, subagents). Enter Context / Tools / MCP / Subagents for the next layer. | `pipelineSchema.ts` + `PipelineBinder` + `graphFocus.ts` |
| **Trace** | Chronological DAG of *this* run. In-place collapse still applies here. | `RunGraphProjector` |

Nesting is **possession in the runtime**, not grouping by type. Pipeline **packs** Superpowers filets inside the AgentLoop box on the overview. Drill into AgentLoop shows only the **engine** layer:

- Overview → harness cards + packed AgentLoop children (`1%`, Explain / Bug / Build, brainstorming → HARD-GATE yes → writing-plans → Branch (`git_branch`) → SDD **or** executing-plans → TDD / review → finishing; debugging under Bug)
- AgentLoop drill → fallback, streamText, **model tool call**, before_tool, permissions, tools, **tool results**, verification, repair, subagents (**no** process skills)
- Context Builder → §5 sources (each → Rank) + Rank → Caps → Budget → Assemble prompt
- Tool Executor → observed calls + MCP
- MCP → built-in servers; invoked `mcp__*` tools nest under the server that ran
- Subagents → explore / implement / review (tool `agent`, not a classifyTask driver)

Compact and Context Builder run in `runTurn` **before** `AgentLoop`. Tool results stay on the engine layer (not inside the builder). Return to streamText; optional feed into Rank (`context` edge).

Toolbar: **Pipeline / Trace** and a Pipeline breadcrumb (`Pipeline / AgentLoop / Tool Executor`). Recent Runs still `loadRun`. Changing run or canvas mode clears the focus stack.

## Runtime driver

There is **no** `shouldOrchestrate` fork. `shouldOrchestrate` always returns `false`. Every `sendMessage` calls `WorkflowEngine.run`, which is a single `act` turn → `runTurn` → ContextEngine 1× → `AgentLoop`.

- `workflow-started` with `workflowId: "agent-loop"`, `stepIds: ["act"]`, optional `goalKind` / `skipProcess` (from `beginUserTurn`).
- Subagents light only when `subagent-task-started` / `agent-started` / `orchestration-started` fire (tool `agent`). Legacy `sdd-task-*` events still bind. Otherwise the Subagents group is `skipped`.

## AgentLoop

One parent in the data model. **Overview** shows filets packed in the box. **Drill** shows the engine only.

Box topology (teaching map of `evaluateWorkflowGate` + Basic Workflow):

1. **1% skill check** — first parent-turn tool ∈ `load_skill` / `check_skills` / `ask_user_question`
2. Parallel filets: **Explain** (mutations deny) | **Bug** → systematic-debugging | **Build** → brainstorming → brainstorm research → **HARD-GATE yes** → writing-plans → plan research → Branch → executing-plans → TDD → VBC → finishing
3. No edge debugging → Branch. Review is optional (not a per-task loop).

`goalKind` from `classifyGoalKind` lights one filet on `workflow-started` and skips the other trees. `goalKind === other` lights none until a skill loads. `noneApply` completes the 1% check but does **not** skip the active filet branch.

Engine order after drill: fallback → streamText → **model tool call** → before_tool → permission → execute → **tool results** → verification. `loop` edges: Tool results → streamText (`stopWhen`) and verification FAIL → streamText (repair).

Context Builder **builds the prompt** once per user message, on the overview. Sources feed Rank. The model picks tools during `streamText` from `ToolRegistry.listEnabled()`.

## Pipeline binding

Statuses: `idle` | `skipped` | `running` | `completed` | `failed` | `cancelled`.

| Event | Effect |
| --- | --- |
| *(none)* | Full spec, all `idle` |
| `task-started` | prompt + task + hook |
| `hook-denied` | hook + result failed |
| `workflow-started` | AgentLoop running; lights Explain / Bug / Build from `goalKind`; skips the other filet trees |
| `agent-*` / `subagent-task-*` / `orchestration-started` | Subagents + executing-plans or research skill |
| `context-assembled` | context + rank/caps/budget/assemble + included §5 sources; compact skipped if still idle |
| `compacted` / `compact_boundary` | compact on the overview |
| `started` / `fallback` | router / model (engine layer) |
| `skill-check` | Completes 1% in the box; `noneApply` does **not** skip the goalKind filet |
| `skill-selected` / `skill-loaded` | 1% completed + matching process skill. `executing-plans` lights that node, not SDD. |
| `design-gate` / `user-question` | Brainstorming; `approved` completes brainstorming **and** HARD-GATE yes |
| `tool-*` / `permission-required` | Model tool call + ToolExecutor + **Tool results**. MCP tools nest under the server that ran. `git_branch` / `enter_plan_mode` / `agent` / `run_command` / `finish_development_branch` also light the matching process skill. |
| `verification-*` FAIL | repair + loop to model |
| `completed` / `error` / `cancelled` | result; idle filets and process skills skipped. Knowledge reflect stays idle |
| `knowledge-reflect-started` | Knowledge reflect running (after Result, fire-and-forget) |
| `knowledge-reflect-skipped` | Knowledge reflect skipped (`disabled` / `trivial` / `in-flight` / `no-project` / `no-llm` / `failed`) — Result stays completed |
| `knowledge-reflect-completed` | Knowledge reflect completed; metadata `skillCount` / `specCount` / `summary` |

Edges: `sequence` / `input` / `delegation` / `recovery` / `loop` / `fallback` / `context`. No invented causality.

## Trace projection

`RunGraphProjector` still folds instance nodes. Filters and shortcut edges apply only in Trace. Pipeline overview packs AgentLoop children; drill layers stay a flat LTR chain (parallel `sequence` successors stack in a column). Trace stays dagre LR.

## Persistence

Persist events and runs, never the React Flow document. Live: `LiveRunDataSource`. Recorded: `PersistedRunDataSource`.

## Manual checks

1. Open Run — chat collapsed; overview shows Prompt → Session → hook → Compact → Context Builder → **AgentLoop box** with 1% + Explain/Bug/Build (+ skills) → Result → Knowledge reflect. streamText is **not** on this layer.
2. Double-click the AgentLoop **frame** (not a filet) — breadcrumb `Pipeline / AgentLoop`; canvas shows fallback, streamText, Tool Executor, verification. No brainstorming / debugging nodes.
3. Double-click Context Builder from overview — slices + Rank/Caps/Budget/Assemble. Escape returns to overview.
4. Explain / `noneApply` — Explain filet stays lit; unused process skills skipped; Subagents skipped.
5. Build run — Build lit; Bug tree skipped; brainstorming → HARD-GATE yes → writing-plans → Branch → SDD or executing-plans.
6. Bug run — Bug + systematic-debugging; Branch / plans / SDD stay skipped.
7. Verification FAIL — loop edge to model, repair running (engine layer).
8. Fallback — annotates `pipeline:model`.
9. Replay a persisted run — same pipeline ids.
10. Trace toggle — instance DAG + filters; double-click still collapses groups in Trace only.
11. After a successful run — Result completes first, then Knowledge reflect goes skipped or completed. A skip must not fail Result.

## Out of scope

Run comparison, replay stepper, ELK/radial, persisting graph UI state, a second event bus, invented causality, `dependsOn` task graphs (the runtime has none).
