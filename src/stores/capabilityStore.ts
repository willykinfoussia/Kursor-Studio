import { create } from "zustand";
import { capabilityService } from "../lib/capabilities/instance";
import {
  attentionCount as countAttention,
  matchesStatusView,
  needsAttention,
  sortCapabilities,
  type CapabilitySort,
  type CapabilityStatusView,
} from "../lib/capabilities/presentationalStatus";
import { applyCapabilityFilters, catalogItems, countByType } from "../lib/capabilities/query";
import type {
  CapabilityFilters,
  CapabilityStatus,
  CapabilitySummary,
  CapabilityType,
} from "../lib/capabilities/types";
import type { RiskLevel } from "../lib/agent/permissions/types";
import { useProjectStore } from "./projectStore";

export type CapabilityTypeFilter = "all" | CapabilityType;
export type { CapabilitySort, CapabilityStatusView };

interface CapabilityUiState {
  summaries: CapabilitySummary[];
  selectedCapabilityId: string | null;
  search: string;
  typeFilter: CapabilityTypeFilter;
  sourceFilter: Array<"builtin" | "project" | "user" | "mcp" | "external">;
  statusFilter: CapabilityStatus[];
  riskFilter: RiskLevel[];
  scopeFilter: Array<"global" | "project" | "agent">;
  agentFilter: string;
  projectFilter: "current" | "all" | "global";
  statusView: CapabilityStatusView;
  sortBy: CapabilitySort;
  attentionOnly: boolean;
  detailsOpen: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  select: (id: string | null) => void;
  setSearch: (search: string) => void;
  setTypeFilter: (typeFilter: CapabilityTypeFilter) => void;
  toggleSource: (source: CapabilityUiState["sourceFilter"][number]) => void;
  toggleStatus: (status: CapabilityStatus) => void;
  toggleRisk: (risk: RiskLevel) => void;
  setAgentFilter: (agentFilter: string) => void;
  setProjectFilter: (projectFilter: CapabilityUiState["projectFilter"]) => void;
  setStatusView: (statusView: CapabilityStatusView) => void;
  setSortBy: (sortBy: CapabilitySort) => void;
  setAttentionOnly: (attentionOnly: boolean) => void;
  setDetailsOpen: (open: boolean) => void;
  clearFilters: () => void;
}

function currentFilters(state: CapabilityUiState): CapabilityFilters {
  return {
    type: state.typeFilter,
    sources: state.sourceFilter.length ? state.sourceFilter : undefined,
    statuses: state.statusFilter.length ? state.statusFilter : undefined,
    risk: state.riskFilter.length ? state.riskFilter : undefined,
    scope: state.scopeFilter.length ? state.scopeFilter : undefined,
    agentId: state.agentFilter,
    project: state.projectFilter,
    currentProjectId: useProjectStore.getState().currentProject?.id ?? null,
  };
}

const clearedFilters = {
  search: "",
  sourceFilter: [] as CapabilityUiState["sourceFilter"],
  statusFilter: [] as CapabilityStatus[],
  riskFilter: [] as RiskLevel[],
  agentFilter: "all",
  projectFilter: "all" as const,
  statusView: "all" as const,
  attentionOnly: false,
};

export const useCapabilityStore = create<CapabilityUiState>((set) => ({
  summaries: [],
  selectedCapabilityId: null,
  search: "",
  typeFilter: "all",
  sourceFilter: [],
  statusFilter: [],
  riskFilter: [],
  scopeFilter: [],
  agentFilter: "all",
  projectFilter: "all",
  statusView: "all",
  sortBy: "name",
  attentionOnly: false,
  detailsOpen: false,
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const summaries = await capabilityService.listCapabilities();
      set({ summaries, loading: false, error: null });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Couldn't load capabilities.",
      });
    }
  },
  select: (id) => set({ selectedCapabilityId: id, detailsOpen: Boolean(id) }),
  setSearch: (search) => set({ search }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
  toggleSource: (source) => set((state) => ({
    sourceFilter: state.sourceFilter.includes(source)
      ? state.sourceFilter.filter((item) => item !== source)
      : [...state.sourceFilter, source],
  })),
  toggleStatus: (status) => set((state) => ({
    statusFilter: state.statusFilter.includes(status)
      ? state.statusFilter.filter((item) => item !== status)
      : [...state.statusFilter, status],
  })),
  toggleRisk: (risk) => set((state) => ({
    riskFilter: state.riskFilter.includes(risk)
      ? state.riskFilter.filter((item) => item !== risk)
      : [...state.riskFilter, risk],
  })),
  setAgentFilter: (agentFilter) => set({ agentFilter }),
  setProjectFilter: (projectFilter) => set({ projectFilter }),
  setStatusView: (statusView) => set({ statusView, attentionOnly: false }),
  setSortBy: (sortBy) => set({ sortBy }),
  setAttentionOnly: (attentionOnly) => set((state) => ({
    attentionOnly,
    statusView: attentionOnly ? "all" : state.statusView,
  })),
  setDetailsOpen: (detailsOpen) => set({ detailsOpen }),
  clearFilters: () => set(clearedFilters),
}));

export function filteredCapabilities() {
  const state = useCapabilityStore.getState();
  return capabilityService.filter(state.summaries, currentFilters(state), state.search);
}

export function visibleCapabilities(summaries: CapabilitySummary[], state: Pick<
  CapabilityUiState,
  | "search"
  | "typeFilter"
  | "sourceFilter"
  | "statusFilter"
  | "riskFilter"
  | "scopeFilter"
  | "agentFilter"
  | "projectFilter"
  | "attentionOnly"
  | "sortBy"
  | "statusView"
>) {
  let items = applyCapabilityFilters(
    catalogItems(summaries, state.search),
    {
      type: state.typeFilter,
      sources: state.sourceFilter.length ? state.sourceFilter : undefined,
      statuses: state.statusFilter.length ? state.statusFilter : undefined,
      risk: state.riskFilter.length ? state.riskFilter : undefined,
      scope: state.scopeFilter.length ? state.scopeFilter : undefined,
      agentId: state.agentFilter,
      project: state.projectFilter,
      currentProjectId: useProjectStore.getState().currentProject?.id ?? null,
    },
    state.search,
  );
  if (state.attentionOnly) items = items.filter(needsAttention);
  if (state.statusView !== "all") items = items.filter((item) => matchesStatusView(item, state.statusView));
  return sortCapabilities(items, state.sortBy);
}

export function capabilityCounts(summaries: CapabilitySummary[]) {
  return countByType(summaries);
}

export function capabilityAttentionCount(summaries: CapabilitySummary[]) {
  return countAttention(catalogItems(summaries, ""));
}

export function hasCapabilityFilters(state: Pick<
  CapabilityUiState,
  "search" | "sourceFilter" | "statusFilter" | "riskFilter" | "agentFilter" | "projectFilter" | "attentionOnly" | "statusView"
>) {
  return Boolean(state.search.trim())
    || state.sourceFilter.length > 0
    || state.statusFilter.length > 0
    || state.riskFilter.length > 0
    || state.agentFilter !== "all"
    || state.projectFilter !== "all"
    || state.attentionOnly
    || state.statusView !== "all";
}
