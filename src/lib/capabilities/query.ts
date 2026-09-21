import type { CapabilityFilters, CapabilitySummary, CapabilityType } from "./types";

export function matchesQuery(item: CapabilitySummary, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return item.searchText.includes(needle);
}

export function applyCapabilityFilters(
  items: readonly CapabilitySummary[],
  filters: CapabilityFilters,
  query = "",
): CapabilitySummary[] {
  return items.filter((item) => {
    if (filters.type && filters.type !== "all" && item.type !== filters.type && item.kind !== filters.type) {
      if (!(filters.type === "mcp" && item.kind.startsWith("mcp"))) return false;
    }
    if (filters.sources && filters.sources.length > 0 && !filters.sources.includes(item.source.type)) {
      return false;
    }
    if (filters.statuses && filters.statuses.length > 0 && !filters.statuses.includes(item.status)) {
      return false;
    }
    if (filters.risk && filters.risk.length > 0) {
      if (!item.riskLevel || !filters.risk.includes(item.riskLevel)) return false;
    }
    if (filters.scope && filters.scope.length > 0 && !filters.scope.includes("all")) {
      if (!item.scope || !filters.scope.includes(item.scope)) return false;
    }
    if (filters.agentId && filters.agentId !== "all") {
      if (!item.agentIds.includes(filters.agentId)) return false;
    }
    if (filters.project === "global") {
      if (item.source.type === "project") return false;
    }
    if (filters.project === "current") {
      if (item.source.type === "project" && item.projectId && filters.currentProjectId && item.projectId !== filters.currentProjectId) {
        return false;
      }
    }
    return matchesQuery(item, query);
  });
}

export function catalogItems(items: readonly CapabilitySummary[], query: string) {
  if (query.trim()) return items;
  return items.filter((item) => item.kind === "skill" || item.kind === "tool" || item.kind === "mcp");
}

export function countByType(items: readonly CapabilitySummary[]) {
  const catalog = items.filter((item) => item.kind === "skill" || item.kind === "tool" || item.kind === "mcp");
  return {
    all: catalog.length,
    skill: catalog.filter((item) => item.type === "skill").length,
    tool: catalog.filter((item) => item.type === "tool").length,
    mcp: catalog.filter((item) => item.kind === "mcp").length,
  } satisfies Record<"all" | CapabilityType, number> & { all: number };
}
