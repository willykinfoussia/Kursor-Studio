import { create } from "zustand";

interface AgentUiState {
  expanded: Record<string, boolean>;
  stickyDismissed: boolean;
  highlightedItemId: string | null;
  setExpanded: (id: string, expanded: boolean) => void;
  dismissSticky: () => void;
  highlight: (id: string | null) => void;
  resetUi: () => void;
}

export const useAgentUiStore = create<AgentUiState>((set) => ({
  expanded: {},
  stickyDismissed: false,
  highlightedItemId: null,
  setExpanded: (id, expanded) => set((state) => ({
    expanded: { ...state.expanded, [id]: expanded },
  })),
  dismissSticky: () => set({ stickyDismissed: true }),
  highlight: (highlightedItemId) => set({ highlightedItemId }),
  resetUi: () => set({ expanded: {}, stickyDismissed: false, highlightedItemId: null }),
}));
