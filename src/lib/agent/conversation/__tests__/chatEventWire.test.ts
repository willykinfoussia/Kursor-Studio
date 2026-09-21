import { describe, expect, it } from "vitest";
import { isUnhandledChatEvent, shouldIngestKnowledgeProposal } from "../chatEventWire";
import { CHAT_EVENT_POLICY } from "../chatPolicy";

describe("chat event wire", () => {
  it("routes knowledge-reflect events that the runtime switch used to drop", () => {
    expect(isUnhandledChatEvent("knowledge-reflect-started")).toBe(true);
    expect(isUnhandledChatEvent("knowledge-reflect-skipped")).toBe(true);
    expect(isUnhandledChatEvent("knowledge-reflect-completed")).toBe(true);
    expect(CHAT_EVENT_POLICY["knowledge-reflect-completed"]).toBe("timeline");
    expect(shouldIngestKnowledgeProposal({
      type: "knowledge-reflect-completed",
      runId: "r1",
      proposalId: "kp-1",
      summary: "Specs",
      skillCount: 0,
      specCount: 1,
    })).toBe("kp-1");
    expect(shouldIngestKnowledgeProposal({ type: "completed", requestId: "r1", messageId: "a", model: "m" })).toBeNull();
  });
});
