import { clipPromptText } from "../agent/context/assemble";
import { isBuildPlanPrompt } from "../agent/plans/isBuildPlanPrompt";
import type { AgentRunEvent } from "./events";
import { PIPELINE_IDS } from "./pipelineSchema";
import type { AgentGraphNode } from "./types";

export interface PhaseTurn {
  input: string;
  output: string;
  tools: string[];
}

export type PhaseTurnMap = Map<string, PhaseTurn[]>;

const BRAINSTORM_SKILLS = new Set(["brainstorming", "subagent-driven-brainstorming"]);
const PLAN_SKILLS = new Set(["writing-plans", "subagent-driven-planning"]);

type PhaseId = typeof PIPELINE_IDS.brainstorming | typeof PIPELINE_IDS.writingPlans | typeof PIPELINE_IDS.executingPlans;

interface OpenTurn {
  owner: string;
  phase: PhaseId;
  input: string;
  output: string;
  tools: string[];
}

function phaseFromSkill(skillId: string): PhaseId | null {
  if (BRAINSTORM_SKILLS.has(skillId)) return PIPELINE_IDS.brainstorming;
  if (PLAN_SKILLS.has(skillId)) return PIPELINE_IDS.writingPlans;
  if (skillId === "executing-plans") return PIPELINE_IDS.executingPlans;
  return null;
}

function phaseForAgent(agentId: string, parentSkill: string): PhaseId | null {
  if (agentId === "implement") return PIPELINE_IDS.executingPlans;
  if (agentId === "explore") return phaseFromSkill(parentSkill);
  return null;
}

function toolResultText(tool: string, output: unknown): string {
  const body = typeof output === "string"
    ? output
    : (() => {
      try {
        return JSON.stringify(output);
      } catch {
        return "";
      }
    })();
  return clipPromptText(body ? `${tool}: ${body}` : tool, 800);
}

export function collectPhaseTurns(events: readonly AgentRunEvent[]): PhaseTurnMap {
  const buckets: PhaseTurnMap = new Map([
    [PIPELINE_IDS.brainstorming, []],
    [PIPELINE_IDS.writingPlans, []],
    [PIPELINE_IDS.executingPlans, []],
  ]);
  let human = "";
  let buildPrompt = "";
  let parentSkill = "";
  let activeAgent: { id: string; phase: PhaseId | null } | null = null;
  let open: OpenTurn | null = null;
  const pending = new Map<string, string[]>();

  const close = () => {
    if (!open) return;
    const list = buckets.get(open.phase);
    list?.push({
      input: open.input,
      output: open.output.trim(),
      tools: open.tools,
    });
    open = null;
  };

  for (const event of events) {
    const payload = event.payload;
    if (payload.type === "task-started" && !isBuildPlanPrompt(payload.title)) {
      if (!human) human = payload.title;
    } else if (payload.type === "started") {
      if (isBuildPlanPrompt(payload.userMessage.content)) buildPrompt = payload.userMessage.content;
      else if (!human) human = payload.userMessage.content;
    } else if (payload.type === "skill-loaded" || payload.type === "skill-selected") {
      if (!activeAgent) parentSkill = payload.skillId;
    } else if (payload.type === "agent-started" || payload.type === "subagent-task-started" || payload.type === "sdd-task-started") {
      activeAgent = { id: payload.agentId, phase: phaseForAgent(payload.agentId, parentSkill) };
    } else if (payload.type === "agent-completed" || payload.type === "subagent-task-completed" || payload.type === "sdd-task-completed") {
      if (activeAgent?.id === payload.agentId) activeAgent = null;
    } else if (payload.type === "step-started" && payload.kind === "model") {
      const owner = payload.agentId || "parent";
      const phase = payload.agentId
        ? phaseForAgent(payload.agentId, parentSkill)
        : phaseFromSkill(parentSkill);
      close();
      const prior = pending.get(owner) ?? [];
      pending.set(owner, []);
      if (!phase) {
        open = null;
        continue;
      }
      const list = buckets.get(phase) ?? [];
      const firstInput = phase === PIPELINE_IDS.executingPlans && buildPrompt ? buildPrompt : human;
      open = {
        owner,
        phase,
        input: clipPromptText(list.length === 0 ? firstInput : prior.join("\n\n")),
        output: "",
        tools: [],
      };
    } else if (payload.type === "assistant-message") {
      const owner = payload.agentId || "parent";
      if (!open || open.owner !== owner || !payload.text.trim()) continue;
      open.output = clipPromptText(open.output ? `${open.output}\n\n${payload.text}` : payload.text);
    } else if (payload.type === "tool-completed") {
      const owner = payload.agentId || "parent";
      const bucket = pending.get(owner) ?? [];
      bucket.push(toolResultText(payload.tool, payload.output));
      pending.set(owner, bucket);
      if (open && open.owner === owner) open.tools.push(payload.tool);
    }
  }
  close();
  return buckets;
}

export function applyPhaseTurns(nodes: Map<string, AgentGraphNode>, events: readonly AgentRunEvent[]) {
  const turns = collectPhaseTurns(events);
  for (const [id, list] of turns) {
    if (list.length === 0) continue;
    const node = nodes.get(id);
    if (!node) continue;
    node.metadata = { ...node.metadata, turns: list };
  }
}
