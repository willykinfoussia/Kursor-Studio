import type {
  CapabilityConnectionStatus,
  CapabilityDetailKind,
  CapabilitySource,
  CapabilityStatus,
  CapabilitySummary,
  CapabilityType,
} from "./types";

export type CapabilitySort = "name" | "status" | "type";
export type CapabilityStatusView = "all" | "active" | "disabled" | "needs-setup";
export type CapabilityStatusInput = {
  kind: CapabilityDetailKind;
  type: CapabilityType;
  status: CapabilityStatus;
  enabled: boolean;
  connectionStatus?: CapabilityConnectionStatus;
  tags?: string[];
  lastError?: string;
};
export type CapabilityPresentationId =
  | "active"
  | "disabled"
  | "needs-setup"
  | "connected"
  | "disconnected"
  | "error"
  | "unavailable";
export type CapabilityStatusTone = "success" | "muted" | "warning" | "danger" | "info";

const LIFECYCLE_TAGS = new Set([
  "known",
  "setup-incomplete",
  "configured",
  "disabled",
  "disconnected",
  "connecting",
  "connected",
  "ready",
  "error",
]);

const STATUS_SORT: Record<CapabilityPresentationId, number> = {
  error: 0,
  "needs-setup": 1,
  unavailable: 2,
  disconnected: 3,
  disabled: 4,
  connected: 5,
  active: 6,
};

const TYPE_SORT = { skill: 0, tool: 1, mcp: 2 } as const;

export function mcpLifecycleTag(item: CapabilityStatusInput) {
  if (item.kind !== "mcp" && item.type !== "mcp") return undefined;
  return (item.tags ?? []).find((tag) => LIFECYCLE_TAGS.has(tag));
}

export function needsSetup(item: CapabilityStatusInput) {
  const lifecycle = mcpLifecycleTag(item);
  if (lifecycle === "known" || lifecycle === "setup-incomplete") return true;
  return item.kind === "mcp" && item.status === "unavailable" && !item.enabled;
}

export function needsAttention(item: CapabilityStatusInput) {
  if (item.status === "error" || item.connectionStatus === "error") return true;
  if (item.lastError) return true;
  return needsSetup(item);
}

export function presentationalStatus(item: CapabilityStatusInput): {
  id: CapabilityPresentationId;
  label: string;
  tone: CapabilityStatusTone;
} {
  if (item.status === "error" || item.connectionStatus === "error") {
    return { id: "error", label: "Error", tone: "danger" };
  }
  if (needsSetup(item)) {
    return { id: "needs-setup", label: "Needs setup", tone: "warning" };
  }
  if (item.kind === "mcp" && item.connectionStatus === "connected") {
    return { id: "connected", label: "Connected", tone: "success" };
  }
  if (!item.enabled || item.status === "disabled" || item.connectionStatus === "disabled") {
    return { id: "disabled", label: "Disabled", tone: "muted" };
  }
  if (item.status === "unavailable") {
    return { id: "unavailable", label: "Unavailable", tone: "warning" };
  }
  if (item.kind === "mcp" && item.connectionStatus === "disconnected") {
    return { id: "disconnected", label: "Disconnected", tone: "muted" };
  }
  if (item.kind === "mcp") {
    return { id: "connected", label: "Connected", tone: "success" };
  }
  return { id: "active", label: "Active", tone: "success" };
}

export function matchesStatusView(item: CapabilityStatusInput, view: CapabilityStatusView) {
  if (view === "all") return true;
  const status = presentationalStatus(item);
  if (view === "active") return status.id === "active" || status.id === "connected";
  if (view === "disabled") return status.id === "disabled";
  return status.id === "needs-setup" || status.id === "unavailable";
}

export function canToggleCapability(item: CapabilityStatusInput) {
  if (item.kind === "skill" || item.kind === "tool" || item.kind === "mcp-tool") return true;
  if (item.kind === "mcp") return mcpLifecycleTag(item) !== "known";
  return false;
}

export function sourceLabel(source: CapabilitySource) {
  switch (source.type) {
    case "builtin":
      return "Built-in";
    case "mcp":
      return "MCP";
    case "user":
      return "User";
    case "project":
      return "Project";
    case "external":
      return "External";
  }
}

export function typeLabel(item: Pick<CapabilitySummary, "kind" | "type">) {
  if (item.kind === "skill" || item.type === "skill") return "Skill";
  if (item.kind === "tool" || item.type === "tool") return "Tool";
  if (item.kind === "mcp-tool") return "MCP Tool";
  if (item.kind === "mcp-resource") return "MCP Resource";
  if (item.kind === "mcp-prompt") return "MCP Prompt";
  return "MCP Server";
}

export function cardTags(item: CapabilitySummary) {
  if (item.kind === "skill") {
    return (item.tags ?? []).filter((tag) => !LIFECYCLE_TAGS.has(tag)).slice(0, 3);
  }
  if (item.kind === "tool") {
    return [item.category, item.riskLevel].filter((value): value is NonNullable<typeof value> => Boolean(value)).slice(0, 3);
  }
  if (item.kind === "mcp") {
    const tags: string[] = [];
    if (item.toolCount != null) tags.push(`${item.toolCount} tools`);
    if (item.resourceCount) tags.push(`${item.resourceCount} resources`);
    const transport = (item.tags ?? []).find((tag) => tag === "stdio" || tag === "sse" || tag === "streamable-http");
    if (transport) tags.push(transport);
    return tags.slice(0, 3);
  }
  return (item.tags ?? []).slice(0, 2);
}

export function sortCapabilities(items: CapabilitySummary[], sortBy: CapabilitySort) {
  return [...items].sort((left, right) => {
    if (sortBy === "type") {
      const delta = TYPE_SORT[left.type] - TYPE_SORT[right.type];
      if (delta !== 0) return delta;
    }
    if (sortBy === "status") {
      const delta = STATUS_SORT[presentationalStatus(left).id] - STATUS_SORT[presentationalStatus(right).id];
      if (delta !== 0) return delta;
    }
    return left.displayName.localeCompare(right.displayName);
  });
}

export function attentionCount(items: readonly CapabilitySummary[]) {
  return items.filter((item) => (item.kind === "skill" || item.kind === "tool" || item.kind === "mcp") && needsAttention(item)).length;
}
