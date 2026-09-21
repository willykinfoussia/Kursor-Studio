import { create } from "zustand";

interface RagIndexState {
  indexing: boolean;
  projectId: string | null;
  done: number;
  total: number;
  path: string | null;
  status: string;
  setProgress: (update: Partial<Omit<RagIndexState, "setProgress">>) => void;
}

export const useRagStore = create<RagIndexState>((set) => ({
  indexing: false,
  projectId: null,
  done: 0,
  total: 0,
  path: null,
  status: "idle",
  setProgress: (update) => set(update),
}));
