import type { AgentMessage } from "../types";
import { CODING_AGENT_RULES, toolGuidance } from "./identity";
import type { ContextSlice, ContextSnapshot, ContextSourceId, ContextTraceEntry } from "./types";
import { estimateTokens } from "./tokens";

const LAYER_ORDER: ContextSourceId[] = [
  "skill",
  "memory",
  "graph",
  "rag",
  "project",
  "editor",
  "git",
  "web",
  "tool",
];

const HEADINGS: Partial<Record<ContextSourceId, string>> = {
  skill: "Skills",
  memory: "Agent memory",
  graph: "Related project files",
  rag: "Relevant project context",
  project: "Workspace",
  editor: "Editor",
  git: "Git",
  web: "Web",
  tool: "Tool results",
};

export function assembleSystemPrompt(
  slices: readonly ContextSlice[],
  snapshot: ContextSnapshot,
  toolsEnabled: boolean,
): string {
  const sections: string[] = [CODING_AGENT_RULES];
  for (const source of LAYER_ORDER) {
    const group = slices.filter((slice) => slice.source === source);
    if (group.length === 0) continue;
    const heading = HEADINGS[source];
    const body = group.map((slice) => slice.text).join("\n\n");
    sections.push(heading ? `${heading}:\n${body}` : body);
  }
  const rules = slices.filter((slice) => slice.source === "rule");
  const agentRules = rules.filter((slice) => slice.meta?.layer === "agent");
  const projectRules = rules.filter((slice) => slice.meta?.layer !== "user" && slice.meta?.layer !== "agent");
  const userRules = rules.filter((slice) => slice.meta?.layer === "user");
  if (agentRules.length > 0) sections.push(`Agent rules:\n${agentRules.map((slice) => slice.text).join("\n\n")}`);
  if (projectRules.length > 0) sections.push(`Project rules:\n${projectRules.map((slice) => slice.text).join("\n\n")}`);
  if (userRules.length > 0) sections.push(`User rules:\n${userRules.map((slice) => slice.text).join("\n\n")}`);
  sections.push(toolGuidance(toolsEnabled, Boolean(snapshot.project?.name)));
  return sections.filter(Boolean).join("\n\n");
}

export function assembleMessages(
  slices: readonly ContextSlice[],
  snapshot: ContextSnapshot,
): AgentMessage[] {
  return slices
    .filter((slice) => slice.source === "conversation")
    .sort((a, b) => Number(a.meta?.index ?? 0) - Number(b.meta?.index ?? 0))
    .map((slice) => {
      const index = Number(slice.meta?.index ?? 0);
      const original = snapshot.messages[index];
      if (original) return { ...original };
      return {
        id: slice.meta?.messageId ?? slice.id,
        role: (slice.meta?.role as AgentMessage["role"]) ?? "user",
        content: slice.text,
        timestamp: Number(slice.meta?.timestamp ?? 0),
      };
    });
}

export function systemReservedTokens(snapshot: ContextSnapshot, toolsEnabled: boolean): number {
  return estimateTokens(`${CODING_AGENT_RULES}\n\n${toolGuidance(toolsEnabled, Boolean(snapshot.project?.name))}`);
}

export function aggregateTrace(
  sourceIds: readonly ContextSourceId[],
  collected: ReadonlyMap<ContextSourceId, { slices: ContextSlice[]; skipReason?: string }>,
  kept: readonly ContextSlice[],
  dropped: readonly ContextSlice[],
): ContextTraceEntry[] {
  const keptBySource = group(kept);
  const droppedBySource = group(dropped);
  return sourceIds.map((source) => {
    const result = collected.get(source);
    const includedSlices = keptBySource.get(source) ?? [];
    const droppedSlices = droppedBySource.get(source) ?? [];
    const tokens = includedSlices.reduce((sum, slice) => sum + slice.tokens, 0);
    if (!result || (result.slices.length === 0 && includedSlices.length === 0)) {
      return {
        source,
        included: false,
        reason: result?.skipReason ?? "no slices",
        tokens: 0,
      };
    }
    if (includedSlices.length === 0) {
      return {
        source,
        included: false,
        reason: "over budget",
        tokens: 0,
      };
    }
    if (droppedSlices.length > 0) {
      return {
        source,
        included: true,
        reason: `included ${includedSlices.length} of ${includedSlices.length + droppedSlices.length}; dropped over budget`,
        tokens,
      };
    }
    return {
      source,
      included: true,
      reason: result.skipReason ? result.skipReason : "selected",
      tokens,
    };
  });
}

function group(slices: readonly ContextSlice[]): Map<ContextSourceId, ContextSlice[]> {
  const map = new Map<ContextSourceId, ContextSlice[]>();
  for (const slice of slices) {
    const list = map.get(slice.source) ?? [];
    list.push(slice);
    map.set(slice.source, list);
  }
  return map;
}
