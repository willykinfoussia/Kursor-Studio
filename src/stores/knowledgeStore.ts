import { create } from "zustand";
import { applyProposal } from "../lib/agent/knowledge/applyProposal";
import { knowledgeProposalStore } from "../lib/agent/knowledge/KnowledgeProposalStore";
import type { KnowledgeProposal } from "../lib/agent/knowledge/types";
import { graphService } from "../lib/graph/GraphService";
import { useProjectStore } from "./projectStore";

interface KnowledgeState {
  proposals: KnowledgeProposal[];
  ingest: (proposal: KnowledgeProposal) => void;
  loadPending: (projectId: string) => Promise<void>;
  accept: (id: string, selection?: { skillIds?: string[]; specIds?: string[] }) => Promise<void>;
  reject: (id: string) => Promise<void>;
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  proposals: [],
  ingest: (proposal) => set((state) => ({
    proposals: [proposal, ...state.proposals.filter((item) => item.id !== proposal.id)],
  })),
  loadPending: async (projectId) => {
    const pending = await knowledgeProposalStore.listPending(projectId);
    set((state) => {
      const others = state.proposals.filter((item) => item.projectId !== projectId || item.status !== "pending");
      return { proposals: [...pending, ...others] };
    });
  },
  accept: async (id, selection) => {
    const proposal = get().proposals.find((item) => item.id === id) ?? await knowledgeProposalStore.get(id);
    if (!proposal) return;
    const projectId = useProjectStore.getState().currentProject?.id;
    await applyProposal(proposal, {
      files: graphService.getFiles(),
      onSpecChanged: async (path, kind) => {
        if (!projectId) return;
        await graphService.updateFile(projectId, path, kind === "remove" ? "remove" : kind === "create" ? "create" : "modify");
      },
    }, selection);
    const next: KnowledgeProposal = { ...proposal, status: "applied", updatedAt: Date.now() };
    await knowledgeProposalStore.save(next);
    set((state) => ({
      proposals: state.proposals.map((item) => item.id === id ? next : item),
    }));
  },
  reject: async (id) => {
    const next = await knowledgeProposalStore.resolve(id, "rejected");
    if (!next) return;
    set((state) => ({
      proposals: state.proposals.map((item) => item.id === id ? next : item),
    }));
  },
}));
