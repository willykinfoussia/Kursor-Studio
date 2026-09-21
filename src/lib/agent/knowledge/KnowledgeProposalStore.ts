import { databaseApi } from "../../tauri/databaseApi";
import { isTauri } from "../../tauri/invoke";
import type { KnowledgeProposalRecord } from "../../storage/types";
import type { KnowledgeProposal, KnowledgeProposalStatus, KnowledgeReflectResult } from "./types";

const memory = new Map<string, KnowledgeProposal>();

function fromRecord(record: KnowledgeProposalRecord): KnowledgeProposal {
  let payload: KnowledgeReflectResult = { summary: "", skillActions: [], specActions: [] };
  try {
    payload = JSON.parse(record.payloadJson) as KnowledgeReflectResult;
  } catch {
    payload = { summary: record.summary, skillActions: [], specActions: [] };
  }
  return {
    id: record.id,
    projectId: record.projectId,
    runId: record.runId,
    conversationId: record.conversationId ?? "",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status as KnowledgeProposalStatus,
    summary: record.summary,
    payload,
  };
}

function toRecord(proposal: KnowledgeProposal): KnowledgeProposalRecord {
  return {
    id: proposal.id,
    projectId: proposal.projectId,
    runId: proposal.runId,
    conversationId: proposal.conversationId,
    status: proposal.status,
    summary: proposal.summary,
    payloadJson: JSON.stringify(proposal.payload),
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  };
}

export interface KnowledgeProposalStore {
  save(proposal: KnowledgeProposal): Promise<void>;
  get(id: string): Promise<KnowledgeProposal | null>;
  listPending(projectId: string): Promise<KnowledgeProposal[]>;
  listForConversation(conversationId: string): Promise<KnowledgeProposal[]>;
  resolve(id: string, decision: "accepted" | "rejected"): Promise<KnowledgeProposal | null>;
}

export function createMemoryKnowledgeProposalStore(seed: KnowledgeProposal[] = []): KnowledgeProposalStore {
  const local = new Map(seed.map((item) => [item.id, item]));
  return {
    async save(proposal) {
      local.set(proposal.id, { ...proposal, payload: structuredClone(proposal.payload) });
    },
    async get(id) {
      return local.get(id) ?? null;
    },
    async listPending(projectId) {
      return [...local.values()].filter((item) => item.projectId === projectId && item.status === "pending");
    },
    async listForConversation(conversationId) {
      return [...local.values()].filter((item) => item.conversationId === conversationId);
    },
    async resolve(id, decision) {
      const current = local.get(id);
      if (!current) return null;
      const next = { ...current, status: decision, updatedAt: Date.now() };
      local.set(id, next);
      return next;
    },
  };
}

export const knowledgeProposalStore: KnowledgeProposalStore = {
  async save(proposal) {
    memory.set(proposal.id, proposal);
    if (isTauri()) await databaseApi.knowledgeProposalUpsert(toRecord(proposal));
  },
  async get(id) {
    if (isTauri()) {
      const record = await databaseApi.knowledgeProposalGet(id);
      return record ? fromRecord(record) : null;
    }
    return memory.get(id) ?? null;
  },
  async listPending(projectId) {
    if (isTauri()) {
      const rows = await databaseApi.knowledgeProposalList(projectId, "pending");
      return rows.map(fromRecord);
    }
    return [...memory.values()].filter((item) => item.projectId === projectId && item.status === "pending");
  },
  async listForConversation(conversationId) {
    if (isTauri()) {
      const rows = await databaseApi.knowledgeProposalListByConversation(conversationId);
      return rows.map(fromRecord);
    }
    return [...memory.values()].filter((item) => item.conversationId === conversationId);
  },
  async resolve(id, decision) {
    const current = await knowledgeProposalStore.get(id);
    if (!current) return null;
    const next: KnowledgeProposal = { ...current, status: decision, updatedAt: Date.now() };
    await knowledgeProposalStore.save(next);
    return next;
  },
};
