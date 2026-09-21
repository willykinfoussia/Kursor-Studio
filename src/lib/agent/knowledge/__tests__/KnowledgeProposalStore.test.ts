import { describe, expect, it } from "vitest";
import { createMemoryKnowledgeProposalStore } from "../KnowledgeProposalStore";
import type { KnowledgeProposal } from "../types";

function proposal(id = "kp-1"): KnowledgeProposal {
  return {
    id,
    projectId: "p1",
    runId: "run-1",
    conversationId: "c1",
    createdAt: 1,
    updatedAt: 1,
    status: "pending",
    summary: "Auth knowledge",
    payload: {
      summary: "Auth knowledge",
      skillActions: [{
        id: "skill:0:jwt-refresh",
        action: "create",
        skillId: "jwt-refresh",
        scope: "project",
        rationale: "Reusable",
      }],
      specActions: [],
    },
  };
}

describe("createMemoryKnowledgeProposalStore", () => {
  it("lists pending by project and resolves a decision", async () => {
    const store = createMemoryKnowledgeProposalStore();
    await store.save(proposal());
    await store.save({ ...proposal("kp-2"), projectId: "p2" });
    expect(await store.listPending("p1")).toHaveLength(1);
    expect(await store.listForConversation("c1")).toHaveLength(2);
    const rejected = await store.resolve("kp-1", "rejected");
    expect(rejected?.status).toBe("rejected");
    expect(await store.listPending("p1")).toHaveLength(0);
    expect(await store.get("missing")).toBeNull();
  });
});
