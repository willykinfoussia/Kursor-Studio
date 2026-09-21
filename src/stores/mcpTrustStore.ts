import { create } from "zustand";
import type { MCPServerSnapshot } from "../lib/mcp/types";

interface McpTrustState {
  pending: MCPServerSnapshot[];
  setPending: (pending: MCPServerSnapshot[]) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useMcpTrustStore = create<McpTrustState>((set) => ({
  pending: [],
  setPending: (pending) => set({ pending }),
  dismiss: (id) => set((state) => ({ pending: state.pending.filter((item) => item.id !== id) })),
  clear: () => set({ pending: [] }),
}));
