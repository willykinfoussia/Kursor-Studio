# Kursor Harness — Architecture assemblée

Document as-built. La conception initiale reste dans [kursor-harness.md](./kursor-harness.md).

Kursor est un IDE desktop agentique. Le harness orchestre la boucle en TypeScript ; Rust/Tauri exécute le filesystem, les process, SQLite et le store vecteur.

## 1. Pipeline

```text
User
 ↓
Task Manager
 ↓
Workflow Engine
 ↓
Agent Runtime
 ↓
Context Engine
 ↓
Model Router
 ↓
AI Model
 ↓
Tool Registry
 ↓
Permission Manager
 ↓
Tool Executor
 ↓
Native Services
 ↓
Tauri/Rust
 ↓
OS
```

Ordres garantis :

- Avant un outil : Hook → Permission → Tool (`ToolExecutor`).
- Après un outil : Tool Result → Context Update → Agent Loop.
- Après une mutation : pas de VerificationEngine automatique. Aux frontières du plan : subset typecheck+test une fois par tour si un todo est `completed` (plan encore ouvert) ; suite complète après VBC quand le plan est fini. Hors plan et pendant un todo : skip. FAIL relance le modèle (jusqu’à 3 tentatives).
- Tâche simple : Workflow → `runTurn`.
- Tâche medium/complex : Orchestrateur research → coding → testing → review.
- Tâche longue : Session → Checkpoint → Agent → Compaction → Resume.

Le prompt « Ajoute un système de filtre… » est classé `ADD_FEATURE` → medium → orchestrateur.

## 2. Identifiants et event trace

Chaque événement est tamponné par `EventTracer` :

| Champ | Source |
| --- | --- |
| `runId` | `requestId` / `workflow.runId` / `orchestration.runId` |
| `sessionId` | session active |
| `taskId` | `TaskManager` au début de `sendMessage` |
| `stepId` | `step-started` / `step-finished` |
| `toolCallId` | `tool-started.id` / `permission-required.id` |

Les traces sont en mémoire sur le runtime (`getTrace()`), en SQLite (`agent_event_traces`) et en JSONL `traces/{runId}.jsonl` sous le data dir.

Le graphe d’observabilité (onglet **Run**) est une projection de ce journal : [workflow-observability.md](./workflow-observability.md). La spec d’exécution (prompt → résultat, conditions, boucles) : [workflow-spec.md](./workflow-spec.md).

`verification-completed` transporte `ok`, `blockers`, `commands`, `attempt`.

## 3. Persistence

### SQLite

| Table | Rôle |
| --- | --- |
| `agent_sessions` | session, goal, checkpoint |
| `agent_runs` | run + `session_id` + `task_id` |
| `agent_steps` | étapes model / tool / verify |
| `agent_event_traces` | event trace rejouable |
| `messages` / `conversations` | transcript |
| `tool_calls` | appels d’outils |
| `tasks` | tâches de run et étapes de workflow |
| `agent_memory` | mémoires structurées |
| `model_usage` | métriques tokens / latence / fallback |

### LanceStore (pas la crate LanceDB)

Le store vecteur est un JSONL cosine sous `data_dir/vector/lancedb/`, nommé LanceStore. Mapping `sourceType` :

- `memory` → semantic memory
- `code` → code knowledge
- `document` → project knowledge
- `conversation` → historique indexé

FTS5 `rag_chunks_fts` complète la recherche lexicale.

## 4. Agent Panel (données live)

Plus de mocks sur le panel. Sources :

| Zone | Store |
| --- | --- |
| PLAN | `tasks[]` (workflow ou pipeline specialists) |
| TASK | `runTask` (`TaskManager`) |
| CURRENT STEP | `steps[]` |
| TOOLS | `toolCalls[]` |
| PERMISSIONS | prompt + `permissionHistory[]` |
| FILES CHANGED | `filesChanged` / `changeLog` |
| TERMINAL | `commandLog[]` (`run_command`, pas le PTY humain) |
| VERIFICATION | dernier rapport |
| MODEL | `activeModel` |
| FALLBACK | `fallbackFrom` / `fallbackTo` |
| SUBAGENTS | `specialists[]` |

`TasksPage` lit SQLite via `TaskManager.list` et le store live.

## 5. Scénario `add-priority-filter`

Prompt : `Ajoute un système de filtre par priorité à cette application.`

Le modèle est scripté (`ScriptedAIService`). Les outils, le filesystem, `node --test` et `VerificationEngine` sont réels, dans un workspace temp isolé.

Séquence attendue :

inspect → read → plan (orchestrateur) → modify (stub) → test (FAIL) → fix → test → verify → complete

Lancer : `pnpm agent:evaluate --scenario add-priority-filter`

## 6. Limites

- Les evals jugent le harness, pas un vendor LLM.
- LanceStore n’est pas la crate LanceDB.
- Le terminal agent (`run_command`) n’est pas le PTY humain (`portable-pty` / xterm).
- `pnpm tauri dev` reste un smoke GUI manuel, pas un gate CI.
