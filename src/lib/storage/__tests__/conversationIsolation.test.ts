import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentStore } from "../../../stores/agentStore";
import { useProjectStore } from "../../../stores/projectStore";

const { conversationsList } = vi.hoisted(() => ({
  conversationsList: vi.fn(async (projectId?: string | null) => {
    if (projectId === "proj-a") {
      return [{ id: "a1", projectId: "proj-a", title: "Ajoute un système de filtre", createdAt: 1, updatedAt: 2, archived: 0 }];
    }
    if (projectId === "proj-b") {
      return [{ id: "b1", projectId: "proj-b", title: "Ajoute une page contact", createdAt: 1, updatedAt: 2, archived: 0 }];
    }
    return [];
  }),
}));

vi.mock("../../tauri/invoke", () => ({
  isTauri: () => true,
}));

vi.mock("../../tauri/databaseApi", () => ({
  databaseApi: {
    conversationsList,
    messagesList: vi.fn(async () => []),
    conversationsUpsert: vi.fn(),
  },
}));

import { hydrateConversations } from "../session";

describe("project conversation isolation", () => {
  beforeEach(() => {
    useAgentStore.getState().reset();
  });

  it("loads only the active project history when switching A → B → A", async () => {
    useProjectStore.setState({
      currentProject: { id: "proj-a", accountId: "acc", name: "TodoApp", rootPath: "/a", localPath: "/a" },
    });
    await hydrateConversations();
    expect(useAgentStore.getState().conversations.map((item) => item.id)).toEqual(["a1"]);
    expect(useAgentStore.getState().conversations[0]?.title).toContain("filtre");

    useProjectStore.setState({
      currentProject: { id: "proj-b", accountId: "acc", name: "MyWebsite", rootPath: "/b", localPath: "/b" },
    });
    await hydrateConversations();
    expect(useAgentStore.getState().conversations.map((item) => item.id)).toEqual(["b1"]);
    expect(useAgentStore.getState().conversations[0]?.title).toContain("contact");

    useProjectStore.setState({
      currentProject: { id: "proj-a", accountId: "acc", name: "TodoApp", rootPath: "/a", localPath: "/a" },
    });
    await hydrateConversations();
    expect(useAgentStore.getState().conversations.map((item) => item.id)).toEqual(["a1"]);
  });

  it("resets the store when the next project has no conversations", async () => {
    useProjectStore.setState({
      currentProject: { id: "proj-a", accountId: "acc", name: "TodoApp", rootPath: "/a", localPath: "/a" },
    });
    await hydrateConversations();
    useProjectStore.setState({
      currentProject: { id: "proj-empty", accountId: "acc", name: "Empty", rootPath: "/e", localPath: "/e" },
    });
    await hydrateConversations();
    expect(useAgentStore.getState().conversations).toHaveLength(1);
    expect(useAgentStore.getState().conversations[0]?.title).not.toContain("filtre");
    expect(useAgentStore.getState().messages).toEqual([]);
  });
});
