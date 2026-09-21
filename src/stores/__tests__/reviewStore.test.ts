import { beforeEach, describe, expect, it } from "vitest";
import type { AiChangeSet } from "../../lib/review";
import { useAgentStore } from "../agentStore";
import { filterChangeSetsForConversation } from "../reviewStore";

function changeSet(id: string, conversationId?: string, path = `${id}.ts`): AiChangeSet {
  return {
    id,
    accountId: "acc",
    projectId: "proj",
    runId: id,
    conversationId,
    status: "pending-review",
    createdAt: 1,
    updatedAt: 1,
    files: [{
      id: `${id}-file`,
      path,
      kind: "modify",
      status: "pending",
      hunks: [],
    }],
  } as AiChangeSet;
}

describe("reviewStore liveSets conversation scope", () => {
  beforeEach(() => {
    useAgentStore.getState().reset();
  });

  it("hydrate of a project with two conversations shows only the active chat files", () => {
    const loaded = [
      changeSet("a", "conv-a", "hunt.ts"),
      changeSet("b", "conv-b", "box.ts"),
    ];
    useAgentStore.setState({ activeConversationId: "conv-a" });
    const dock = filterChangeSetsForConversation(loaded, useAgentStore.getState().activeConversationId);
    expect(dock.map((item) => item.files[0]?.path)).toEqual(["hunt.ts"]);
  });

  it("does not mix legacy files into a named conversation", () => {
    const loaded = [changeSet("legacy"), changeSet("a", "conv-a", "hunt.ts")];
    useAgentStore.setState({ activeConversationId: "conv-a" });
    const dock = filterChangeSetsForConversation(loaded, useAgentStore.getState().activeConversationId);
    expect(dock.map((item) => item.id)).toEqual(["a"]);
  });
});
