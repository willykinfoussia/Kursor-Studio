import { CODING_AGENT_RULES, toolGuidance } from "./identity";
import { estimateTokens } from "./tokens";
import type { ContextSlice, ContextSourceId } from "./types";

export interface ContextUsageItem {
  id: string;
  label: string;
  tokens: number;
  text: string;
}

export interface ContextUsageGroup {
  id: "system" | ContextSourceId;
  label: string;
  color: string;
  tokens: number;
  items: ContextUsageItem[];
}

export interface ContextUsage {
  tokensUsed: number;
  maxTokens: number;
  groups: ContextUsageGroup[];
}

const SOURCE_GROUPS: { id: ContextSourceId; label: string; color: string }[] = [
  { id: "skill", label: "Skills", color: "#e09a3e" },
  { id: "memory", label: "Agent memory", color: "#c4b5fd" },
  { id: "graph", label: "Related files", color: "#67b7dc" },
  { id: "rag", label: "Relevant code", color: "#5dbe8a" },
  { id: "project", label: "Workspace", color: "#7d8cff" },
  { id: "editor", label: "Editor", color: "#6cb6ff" },
  { id: "git", label: "Git", color: "#f0a0b0" },
  { id: "web", label: "Web", color: "#5ec8c5" },
  { id: "tool", label: "Tool results", color: "#b794f6" },
  { id: "rule", label: "Rules", color: "#3dba7a" },
  { id: "conversation", label: "Conversation", color: "#a67c52" },
];

export function buildContextUsage(input: {
  slices: readonly ContextSlice[];
  toolsEnabled: boolean;
  hasProject: boolean;
  maxTokens: number;
}): ContextUsage {
  const systemText = `${CODING_AGENT_RULES}\n\n${toolGuidance(input.toolsEnabled, input.hasProject)}`;
  const systemTokens = estimateTokens(systemText);
  const groups: ContextUsageGroup[] = [];
  if (systemTokens > 0) {
    groups.push({
      id: "system",
      label: "System prompt",
      color: "#9aa3b5",
      tokens: systemTokens,
      items: [{
        id: "system",
        label: "System prompt",
        tokens: systemTokens,
        text: systemText,
      }],
    });
  }
  for (const spec of SOURCE_GROUPS) {
    const slices = input.slices.filter((slice) => slice.source === spec.id && slice.tokens > 0);
    if (slices.length === 0) continue;
    const items = slices.map((slice) => ({
      id: slice.id,
      label: itemLabel(slice),
      tokens: slice.tokens,
      text: slice.text,
    }));
    groups.push({
      id: spec.id,
      label: spec.label,
      color: spec.color,
      tokens: items.reduce((sum, item) => sum + item.tokens, 0),
      items,
    });
  }
  return {
    tokensUsed: groups.reduce((sum, group) => sum + group.tokens, 0),
    maxTokens: input.maxTokens,
    groups,
  };
}

export function formatContextTokens(value: number): string {
  const tokens = Math.max(0, Math.round(value));
  if (tokens < 1000) return String(tokens);
  const scaled = tokens / 1000;
  const text = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
  return `${text.replace(/\.0$/, "")}K`;
}

function itemLabel(slice: ContextSlice): string {
  const meta = slice.meta ?? {};
  if (slice.source === "conversation") {
    if (meta.role === "assistant") return "Assistant";
    if (meta.role === "user") return "User";
    return meta.role || "Message";
  }
  if (slice.source === "skill") return meta.names || meta.ids || "Skills";
  if (slice.source === "tool") return meta.tool || slice.id;
  if (slice.source === "memory") return meta.memoryType || "Memory";
  if (slice.source === "web") return meta.title || meta.url || slice.id;
  if (slice.id === "editor:open-files") return "Open files";
  if (meta.path) return meta.path;
  if (meta.name) return meta.name;
  if (meta.branch) return meta.branch;
  return slice.id;
}
