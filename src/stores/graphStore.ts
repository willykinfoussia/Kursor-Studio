import { create } from "zustand";
import { edgeMatchesFilters, nodeMatchesFilters, toggleGraphFilter, type GraphFilterToken } from "../lib/graph/filters";
import { GRAPH_FILTER_TOKENS } from "../lib/graph/filters";
import { graphService } from "../lib/graph/GraphService";
import { fileNodeId } from "../lib/graph/ids";
import { RELATION_TYPES, type FileNode, type GraphEdge, type RelationType } from "../lib/graph/types";
import { useEditorStore } from "./editorStore";

export type GraphRelationFilter = "all" | RelationType;

interface GraphUiState {
  nodes: FileNode[];
  edges: GraphEdge[];
  status: string | null;
  rebuilding: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  centerRequest: string | null;
  centerNonce: number;
  revealEditorNonce: number;
  filters: GraphFilterToken[];
  relationFilter: GraphRelationFilter;
  showUncertain: boolean;
  hydrate: () => void;
  rebuild: () => Promise<void>;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  selectSpec: (path: string, options?: { open?: boolean; center?: boolean }) => void;
  syncFromEditor: (path: string) => void;
  clearCenterRequest: () => void;
  toggleFilter: (token: GraphFilterToken) => void;
  clearTypeFilters: () => void;
  setRelationFilter: (value: GraphRelationFilter) => void;
  setShowUncertain: (value: boolean) => void;
  visibleNodes: () => FileNode[];
  visibleEdges: () => GraphEdge[];
}

function snapshotFromService(): Pick<GraphUiState, "nodes" | "edges"> {
  const graph = graphService.getGraph();
  if (!graph) return { nodes: [], edges: [] };
  return graph.snapshot();
}

export const useGraphStore = create<GraphUiState>((set, get) => ({
  nodes: [],
  edges: [],
  status: null,
  rebuilding: false,
  selectedNodeId: null,
  selectedEdgeId: null,
  centerRequest: null,
  centerNonce: 0,
  revealEditorNonce: 0,
  filters: ["all"],
  relationFilter: "all",
  showUncertain: false,
  hydrate: () => set(snapshotFromService()),
  rebuild: async () => {
    const projectId = graphService.getProjectId();
    if (!projectId) {
      set({ status: "Open a project to build the graph." });
      return;
    }
    set({ rebuilding: true, status: "Rebuilding graph…" });
    try {
      await graphService.rebuild(projectId);
      set({ ...snapshotFromService(), rebuilding: false, status: null });
    } catch (error) {
      set({ rebuilding: false, status: error instanceof Error ? error.message : "Graph rebuild failed." });
    }
  },
  selectNode: (selectedNodeId) => set({ selectedNodeId, selectedEdgeId: null, centerRequest: selectedNodeId, centerNonce: get().centerNonce + 1 }),
  selectEdge: (selectedEdgeId) => set({ selectedEdgeId, selectedNodeId: selectedEdgeId ? get().selectedNodeId : get().selectedNodeId }),
  selectSpec: (path, options) => {
    const node = get().nodes.find((item) => item.path === path) ?? get().nodes.find((item) => item.id === fileNodeId(path));
    const revealEditorNonce = get().revealEditorNonce + 1;
    if (node) {
      set({
        selectedNodeId: node.id,
        selectedEdgeId: null,
        centerRequest: options?.center === false ? get().centerRequest : node.id,
        centerNonce: options?.center === false ? get().centerNonce : get().centerNonce + 1,
        revealEditorNonce,
      });
    } else {
      set({ revealEditorNonce });
    }
    if (options?.open !== false) void useEditorStore.getState().openFile(path);
  },
  syncFromEditor: (path) => {
    const node = get().nodes.find((item) => item.path === path);
    if (!node) return;
    if (node.id === get().selectedNodeId && !get().selectedEdgeId) return;
    set({ selectedNodeId: node.id, selectedEdgeId: null });
  },
  clearCenterRequest: () => set({ centerRequest: null }),
  toggleFilter: (token) => set({ filters: toggleGraphFilter(get().filters, token) }),
  clearTypeFilters: () => set({ filters: ["all"] }),
  setRelationFilter: (relationFilter) => set({ relationFilter }),
  setShowUncertain: (showUncertain) => set({ showUncertain }),
  visibleNodes: () => get().nodes.filter((node) => nodeMatchesFilters(node, get().filters)),
  visibleEdges: () => {
    const visible = get().visibleNodes();
    const ids = new Set(visible.map((node) => node.id));
    return get().edges.filter((edge) => edgeMatchesFilters(edge, ids, get().relationFilter, get().showUncertain));
  },
}));

graphService.subscribe(() => {
  useGraphStore.getState().hydrate();
});

export const GRAPH_TOOLBAR_FILTERS: GraphFilterToken[] = GRAPH_FILTER_TOKENS;
export const GRAPH_RELATION_FILTERS: GraphRelationFilter[] = ["all", ...RELATION_TYPES];
