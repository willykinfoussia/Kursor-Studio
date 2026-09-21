import type { AgentRunEvent } from "./events";
import { PIPELINE_IDS, PROCESS_SKILL_PHASE, TOOL_PHASE, processSkillForSubagent } from "./pipelineSchema";

export type PromptRole = "user" | "agent" | "tool" | "system";

export interface PhasePromptIO {
  inputPrompt?: string;
  outputPrompt?: string;
  inputRole?: PromptRole;
  outputRole?: PromptRole;
}

function clipText(value: string, max = 4000): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function stringifyPayload(value: unknown, max = 2000): string {
  if (value == null) return "";
  if (typeof value === "string") return clipText(value, max);
  try {
    return clipText(JSON.stringify(value, null, 2), max);
  } catch {
    return clipText(String(value), max);
  }
}

function ensureEntry(map: Map<string, PhasePromptIO>, id: string): PhasePromptIO {
  const existing = map.get(id);
  if (existing) return existing;
  const created: PhasePromptIO = {};
  map.set(id, created);
  return created;
}

function setInput(map: Map<string, PhasePromptIO>, id: string, text: string | undefined, role: PromptRole) {
  if (!text?.trim()) return;
  const entry = ensureEntry(map, id);
  if (entry.inputPrompt) return;
  entry.inputPrompt = clipText(text);
  entry.inputRole = role;
}

function setOutput(map: Map<string, PhasePromptIO>, id: string, text: string | undefined, role: PromptRole) {
  if (!text?.trim()) return;
  const entry = ensureEntry(map, id);
  entry.outputPrompt = clipText(text);
  entry.outputRole = role;
}

function openPhase(
  map: Map<string, PhasePromptIO>,
  phaseId: string,
  input: string | undefined,
  role: PromptRole,
  active: { id: string | null },
) {
  active.id = phaseId;
  setInput(map, phaseId, input, role);
}

/**
 * Derive per-node input/output prompts from a run's event journal.
 * Does not create graph structure — binder attaches the result as metadata.
 */
export function extractPhasePrompts(events: readonly AgentRunEvent[]): Map<string, PhasePromptIO> {
  const map = new Map<string, PhasePromptIO>();
  const toolInputs = new Map<string, string>();
  let runUserPrompt = "";
  let lastAssistant = "";
  let lastQuestion = "";
  let lastAgentOrUser = "";
  const active = { id: null as string | null };

  for (const event of events) {
    const payload = event.payload;

    switch (payload.type) {
      case "started": {
        runUserPrompt = payload.userMessage.content;
        lastAgentOrUser = runUserPrompt;
        setOutput(map, PIPELINE_IDS.user, runUserPrompt, "user");
        if (active.id) setInput(map, active.id, runUserPrompt, "user");
        break;
      }
      case "assistant-message": {
        lastAssistant = payload.text;
        lastAgentOrUser = payload.text;
        if (active.id) setOutput(map, active.id, payload.text, "agent");
        break;
      }
      case "user-question": {
        lastQuestion = payload.prompt;
        lastAgentOrUser = payload.prompt;
        openPhase(map, PIPELINE_IDS.brainstorming, runUserPrompt || lastAssistant, runUserPrompt ? "user" : "agent", active);
        setOutput(map, PIPELINE_IDS.brainstorming, payload.prompt, "agent");
        break;
      }
      case "skill-loaded":
      case "skill-selected": {
        const phaseId = PROCESS_SKILL_PHASE[payload.skillId];
        if (!phaseId) break;
        const input = runUserPrompt || lastAssistant || lastQuestion;
        const role: PromptRole = runUserPrompt && !lastAssistant ? "user" : lastAssistant ? "agent" : "user";
        openPhase(map, phaseId, input, role, active);
        break;
      }
      case "design-gate": {
        if (payload.reason === "approved") {
          setInput(map, PIPELINE_IDS.brainstorming, runUserPrompt, "user");
          if (!map.get(PIPELINE_IDS.brainstorming)?.outputPrompt) {
            setOutput(map, PIPELINE_IDS.brainstorming, lastAssistant || lastQuestion, "agent");
          }
          setInput(map, PIPELINE_IDS.designGate, lastQuestion || lastAssistant || runUserPrompt, lastQuestion || lastAssistant ? "agent" : "user");
          const approvalText = payload.tool === "chat" && runUserPrompt
            ? runUserPrompt
            : `approved via ${payload.tool}`;
          setOutput(map, PIPELINE_IDS.designGate, approvalText, payload.tool === "chat" ? "user" : "system");
          active.id = PIPELINE_IDS.designGate;
        } else {
          openPhase(map, PIPELINE_IDS.brainstorming, runUserPrompt, "user", active);
          setOutput(map, PIPELINE_IDS.brainstorming, payload.reason, "system");
        }
        break;
      }
      case "branch-created": {
        openPhase(map, PIPELINE_IDS.worktree, lastAgentOrUser || runUserPrompt, lastAssistant ? "agent" : "user", active);
        setOutput(map, PIPELINE_IDS.worktree, `${payload.branch} from ${payload.base}`, "tool");
        break;
      }
      case "merge-conflicts": {
        openPhase(map, PIPELINE_IDS.finishing, lastAgentOrUser || runUserPrompt, lastAssistant ? "agent" : "user", active);
        setOutput(map, PIPELINE_IDS.finishing, `conflicts: ${payload.files.join(", ")}`, "tool");
        break;
      }
      case "plan-written": {
        openPhase(map, PIPELINE_IDS.writingPlans, lastAgentOrUser || runUserPrompt, lastAssistant ? "agent" : "user", active);
        setOutput(map, PIPELINE_IDS.writingPlans, payload.path, "tool");
        break;
      }
      case "plan-created": {
        openPhase(map, PIPELINE_IDS.writingPlans, lastAgentOrUser || runUserPrompt, lastAssistant ? "agent" : "user", active);
        setOutput(map, PIPELINE_IDS.writingPlans, `${payload.name} (${payload.todoCount} todos) @ ${payload.path}`, "tool");
        break;
      }
      case "plan-todo-updated": {
        openPhase(map, PIPELINE_IDS.executingPlans, lastAgentOrUser || runUserPrompt, lastAssistant ? "agent" : "user", active);
        setOutput(map, PIPELINE_IDS.executingPlans, `${payload.todoId} -> ${payload.status} (${payload.done}/${payload.total})`, "tool");
        break;
      }
      case "plan-build-started": {
        openPhase(map, PIPELINE_IDS.executingPlans, lastAgentOrUser || runUserPrompt, lastAssistant ? "agent" : "user", active);
        setOutput(map, PIPELINE_IDS.executingPlans, `build started: ${payload.path}`, "tool");
        break;
      }
      case "plan-completed": {
        setOutput(map, PIPELINE_IDS.executingPlans, `completed: ${payload.path}`, "tool");
        break;
      }
      case "plan-mode": {
        openPhase(map, PIPELINE_IDS.writingPlans, lastAgentOrUser || runUserPrompt, lastAssistant ? "agent" : "user", active);
        setOutput(map, PIPELINE_IDS.writingPlans, payload.enabled ? "plan mode on" : "plan mode off", "system");
        break;
      }
      case "subagent-task-started":
      case "sdd-task-started": {
        const phaseId = PROCESS_SKILL_PHASE[processSkillForSubagent(payload.agentId)] ?? PIPELINE_IDS.executingPlans;
        openPhase(map, phaseId, payload.title || lastAgentOrUser || runUserPrompt, "agent", active);
        setOutput(map, phaseId, `started ${payload.agentId}: ${payload.title}`, "agent");
        break;
      }
      case "subagent-task-completed":
      case "sdd-task-completed": {
        const phaseId = PROCESS_SKILL_PHASE[processSkillForSubagent(payload.agentId)] ?? PIPELINE_IDS.executingPlans;
        setOutput(map, phaseId, `completed ${payload.agentId}`, "agent");
        break;
      }
      case "finish-branch": {
        openPhase(map, PIPELINE_IDS.finishing, lastAgentOrUser || runUserPrompt, lastAssistant ? "agent" : "user", active);
        setOutput(map, PIPELINE_IDS.finishing, payload.choice, "tool");
        break;
      }
      case "tool-started": {
        const toolId = PIPELINE_IDS.tool(payload.id);
        const inputText = stringifyPayload(payload.input);
        toolInputs.set(payload.id, inputText);
        setInput(map, toolId, inputText, "tool");
        const phaseId = TOOL_PHASE[payload.tool];
        if (phaseId) {
          openPhase(map, phaseId, runUserPrompt || lastAssistant || inputText, runUserPrompt ? "user" : lastAssistant ? "agent" : "tool", active);
          if (inputText) setOutput(map, phaseId, inputText, "tool");
        }
        break;
      }
      case "tool-completed": {
        const toolId = PIPELINE_IDS.tool(payload.id);
        const outputText = stringifyPayload(payload.output);
        setInput(map, toolId, toolInputs.get(payload.id) || map.get(toolId)?.inputPrompt, "tool");
        setOutput(map, toolId, outputText, "tool");
        const phaseId = TOOL_PHASE[payload.tool];
        if (phaseId && outputText) setOutput(map, phaseId, outputText, "tool");
        break;
      }
      case "compacted": {
        setInput(map, PIPELINE_IDS.compact, runUserPrompt, "user");
        setOutput(map, PIPELINE_IDS.compact, payload.summary, "agent");
        break;
      }
      case "context-assembled": {
        setInput(map, PIPELINE_IDS.context, runUserPrompt, "user");
        setOutput(map, PIPELINE_IDS.context, `${payload.tokensUsed} tokens · ${(payload.slices ?? payload.trace).length} slices`, "system");
        break;
      }
      case "completed": {
        if (lastAssistant) {
          setOutput(map, PIPELINE_IDS.result, lastAssistant, "agent");
          setOutput(map, PIPELINE_IDS.model, lastAssistant, "agent");
        }
        setInput(map, PIPELINE_IDS.result, runUserPrompt, "user");
        setInput(map, PIPELINE_IDS.model, runUserPrompt, "user");
        break;
      }
      default:
        break;
    }
  }

  return map;
}

export function applyPhasePrompts(
  nodes: Iterable<{ id: string; metadata?: Record<string, unknown> }>,
  prompts: Map<string, PhasePromptIO>,
) {
  for (const node of nodes) {
    const io = prompts.get(node.id);
    if (!io) continue;
    node.metadata = {
      ...node.metadata,
      ...(io.inputPrompt ? { inputPrompt: io.inputPrompt, inputRole: io.inputRole } : {}),
      ...(io.outputPrompt ? { outputPrompt: io.outputPrompt, outputRole: io.outputRole } : {}),
    };
  }
}
