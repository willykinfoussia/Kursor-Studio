import { create } from "zustand";
import type { GraphFocus } from "../lib/workflow/graphFocus";
import { DEFAULT_GRAPH_FILTERS, type GraphFilterCategory, type GraphLayoutName } from "../lib/workflow/types";

export type WorkflowCanvasMode = "pipeline" | "trace";

interface WorkflowUiState {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  filters: Record<GraphFilterCategory, boolean>;
  layout: GraphLayoutName;
  canvasMode: WorkflowCanvasMode;
  followAgent: boolean;
  livePaused: boolean;
  detailsOpen: boolean;
  developerMode: boolean;
  searchQuery: string;
  collapsedGroups: Record<string, boolean>;
  focusStack: GraphFocus[];
  centerRequest: string | null;
  userMovedViewport: boolean;
  pendingChatItem: string | null;
  highlightedCapabilityId: string | null;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  toggleFilter: (category: GraphFilterCategory) => void;
  setLayout: (layout: GraphLayoutName) => void;
  setFollowAgent: (follow: boolean) => void;
  setLivePaused: (paused: boolean) => void;
  setDetailsOpen: (open: boolean) => void;
  setDeveloperMode: (on: boolean) => void;
  setSearchQuery: (query: string) => void;
  toggleGroup: (id: string) => void;
  enterFocus: (focus: GraphFocus) => void;
  exitFocus: () => void;
  resetFocus: () => void;
  setFocusStack: (stack: GraphFocus[]) => void;
  requestCenter: (id: string | null) => void;
  markUserMovedViewport: () => void;
  resetViewportInteraction: () => void;
  clearSelection: () => void;
  setPendingChatItem: (id: string | null) => void;
  setHighlightedCapabilityId: (id: string | null) => void;
  setCanvasMode: (mode: WorkflowCanvasMode) => void;
}

export const useWorkflowStore = create<WorkflowUiState>((set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,
  filters: { ...DEFAULT_GRAPH_FILTERS },
  layout: "dag",
  canvasMode: "pipeline",
  followAgent: true,
  livePaused: false,
  detailsOpen: true,
  developerMode: false,
  searchQuery: "",
  collapsedGroups: {},
  focusStack: [],
  centerRequest: null,
  userMovedViewport: false,
  pendingChatItem: null,
  highlightedCapabilityId: null,
  selectNode: (id) => set({
    selectedNodeId: id,
    selectedEdgeId: null,
    detailsOpen: Boolean(id),
    centerRequest: id,
  }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
  toggleFilter: (category) => set((state) => ({
    filters: { ...state.filters, [category]: !state.filters[category] },
  })),
  setLayout: (layout) => set({ layout }),
  setFollowAgent: (followAgent) => set((state) => ({
    followAgent,
    userMovedViewport: followAgent ? false : state.userMovedViewport,
  })),
  setLivePaused: (livePaused) => set({ livePaused }),
  setDetailsOpen: (detailsOpen) => set({ detailsOpen }),
  setDeveloperMode: (developerMode) => set({ developerMode }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleGroup: (id) => set((state) => ({
    collapsedGroups: { ...state.collapsedGroups, [id]: !state.collapsedGroups[id] },
    centerRequest: id,
  })),
  enterFocus: (focus) => set((state) => {
    if (state.focusStack.at(-1)?.id === focus.id) return {};
    return { focusStack: [...state.focusStack, focus], userMovedViewport: false, followAgent: true };
  }),
  exitFocus: () => set((state) => ({
    focusStack: state.focusStack.slice(0, -1),
    userMovedViewport: false,
    followAgent: true,
  })),
  resetFocus: () => set({ focusStack: [], userMovedViewport: false, followAgent: true }),
  setFocusStack: (focusStack) => set({ focusStack, userMovedViewport: false, followAgent: true }),
  requestCenter: (centerRequest) => set({ centerRequest }),
  markUserMovedViewport: () => set({ userMovedViewport: true, followAgent: false }),
  resetViewportInteraction: () => set({ userMovedViewport: false, followAgent: true }),
  clearSelection: () => set({ selectedNodeId: null, selectedEdgeId: null, highlightedCapabilityId: null }),
  setPendingChatItem: (pendingChatItem) => set({ pendingChatItem }),
  setHighlightedCapabilityId: (highlightedCapabilityId) => set({ highlightedCapabilityId }),
  setCanvasMode: (canvasMode) => set({ canvasMode, userMovedViewport: false, followAgent: true, focusStack: [] }),
}));
