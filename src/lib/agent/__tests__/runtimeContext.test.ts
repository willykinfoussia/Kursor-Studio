import { beforeEach, describe, expect, it } from "vitest";
import { useAgentStore } from "../../../stores/agentStore";
import { useProjectStore } from "../../../stores/projectStore";
import { useAccountStore } from "../../../stores/accountStore";
import { agentRuntime } from "../AgentRuntime";

const projectA = {
  id: "proj-a",
  accountId: "local-account",
  name: "TodoApp",
  rootPath: "/projects/A",
  localPath: "/projects/A",
};
const projectB = {
  id: "proj-b",
  accountId: "local-account",
  name: "MyWebsite",
  rootPath: "/projects/B",
  localPath: "/projects/B",
};

describe("agent runtime project context", () => {
  beforeEach(() => {
    useAccountStore.setState({ currentAccount: { id: "local-account", provider: "local", onboarded: true, createdAt: 1, updatedAt: 1 } });
    useAgentStore.getState().reset();
    agentRuntime.clearContext();
  });

  it("keeps runtime context aligned with the active project and conversation", () => {
    useProjectStore.setState({ currentProject: projectA });
    useAgentStore.setState({ activeConversationId: "a1" });
    agentRuntime.setContext({ accountId: "local-account", projectId: "proj-a", conversationId: "a1" });
    expect(agentRuntime.getContext()).toEqual({
      accountId: "local-account",
      projectId: "proj-a",
      conversationId: "a1",
    });

    useProjectStore.setState({ currentProject: projectB });
    useAgentStore.setState({ activeConversationId: "b1" });
    agentRuntime.setContext({ accountId: "local-account", projectId: "proj-b", conversationId: "b1" });
    expect(agentRuntime.getContext()?.projectId).toBe("proj-b");
    expect(agentRuntime.getContext()?.conversationId).toBe("b1");
  });
});
