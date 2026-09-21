import { create } from "zustand";
import type { BuiltInMcpId } from "../lib/mcp/builtin/types";

interface McpSetupState {
  catalogId: BuiltInMcpId | null;
  jumpStep?: string;
  open: (catalogId: BuiltInMcpId, jumpStep?: string) => void;
  close: () => void;
}

export const useMcpSetupStore = create<McpSetupState>((set) => ({
  catalogId: null,
  open: (catalogId, jumpStep) => set({ catalogId, jumpStep }),
  close: () => set({ catalogId: null, jumpStep: undefined }),
}));
