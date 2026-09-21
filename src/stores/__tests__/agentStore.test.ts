import { beforeEach, describe, expect, it } from "vitest";
import type { AgentMessage } from "../../types/agent";
import { conversationTitle, useAgentStore } from "../agentStore";

function message(id: string, role: AgentMessage["role"], content: string): AgentMessage {
  return { id, role, content, timestamp: 1 };
}

describe("agentStore conversations", () => {
  beforeEach(() => {
    useAgentStore.getState().reset();
  });

  it("creates a new conversation without losing the previous one", () => {
    const first = useAgentStore.getState().activeConversationId;
    useAgentStore.getState().addMessage(message("u1", "user", "Build a todo app"));
    useAgentStore.getState().addMessage(message("a1", "assistant", "Sure"));
    useAgentStore.getState().syncActiveMessages();
    useAgentStore.getState().createConversation();

    const state = useAgentStore.getState();
    expect(state.conversations).toHaveLength(2);
    expect(state.messages).toEqual([]);
    expect(state.timeline).toEqual([]);
    expect(state.activeConversationId).not.toBe(first);
    expect(state.conversations.find((conversation) => conversation.id === first)?.title).toBe("Build a todo app");
  });

  it("switches back to previous conversation messages", () => {
    useAgentStore.getState().addMessage(message("u1", "user", "Hello"));
    useAgentStore.getState().addMessage(message("a1", "assistant", "Hi"));
    useAgentStore.getState().applyTimelineEvent({
      type: "started",
      requestId: "r1",
      messageId: "a1",
      model: "m",
      userMessage: message("u1", "user", "Hello"),
    });
    useAgentStore.getState().syncActiveMessages();
    const first = useAgentStore.getState().activeConversationId;
    useAgentStore.getState().createConversation();
    useAgentStore.getState().addMessage(message("u2", "user", "Second chat"));
    useAgentStore.getState().syncActiveMessages();

    useAgentStore.getState().switchConversation(first);

    expect(useAgentStore.getState().messages.map((item) => item.content)).toEqual(["Hello", "Hi"]);
    expect(useAgentStore.getState().timeline.some((item) => item.type === "user")).toBe(true);
  });

  it("queues and dequeues pending approvals without timeline items", () => {
    const permission = {
      id: "p1",
      tool: "run_command",
      input: { command: "pnpm test" },
      reason: "test",
      riskLevel: "high" as const,
      capability: "terminal.execute" as const,
      scope: { kind: "project" as const },
      mode: "workspace-write" as const,
    };
    useAgentStore.getState().enqueuePendingApproval({ kind: "permission", id: "p1", permission });
    useAgentStore.getState().enqueuePendingApproval({
      kind: "permission",
      id: "p2",
      permission: { ...permission, id: "p2" },
    });
    expect(useAgentStore.getState().pendingApprovals).toHaveLength(2);
    expect(useAgentStore.getState().pendingPermission?.id).toBe("p1");
    useAgentStore.getState().dequeuePendingApproval("p1");
    expect(useAgentStore.getState().pendingPermission?.id).toBe("p2");
    useAgentStore.getState().clearPendingApprovals();
    expect(useAgentStore.getState().pendingApprovals).toEqual([]);
  });

  it("does not duplicate an empty active conversation", () => {
    useAgentStore.getState().createConversation();
    expect(useAgentStore.getState().conversations).toHaveLength(1);
  });

  it("derives titles from the first user message", () => {
    expect(conversationTitle([message("u1", "user", "  Hello   world  ")])).toBe("Hello world");
  });

  it("keeps workflow snapshots on the previous conversation", () => {
    const first = useAgentStore.getState().activeConversationId;
    useAgentStore.getState().saveActiveWorkflow({
      skipProcess: false,
      designApproved: { scope: "oui", at: 1 },
      planApproved: true,
      planPath: ".kursor/plans/x.plan.md",
      planMode: true,
      interactionMode: "plan",
      agentBranch: null,
      criticalReviewOpen: false,
      lastUserPrompt: "oui",
      goalKind: "build",
      invokedSkillIds: ["brainstorming"],
      sddEnabled: true,
      sddRound: 0,
    });
    useAgentStore.getState().addMessage(message("u1", "user", "Build a todo app"));
    useAgentStore.getState().syncActiveMessages();
    useAgentStore.getState().createConversation();
    expect(useAgentStore.getState().activeConversationId).not.toBe(first);
    expect(useAgentStore.getState().conversations.find((item) => item.id === first)?.workflowSession?.designApproved).toBeTruthy();
    expect(useAgentStore.getState().conversations.find((item) => item.id === useAgentStore.getState().activeConversationId)?.workflowSession).toBeUndefined();
  });
});
