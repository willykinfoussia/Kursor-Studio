import { describe, expect, it } from "vitest";
import { applyAgentEvent } from "../applyAgentEvent";
import type { AgentEvent } from "../../types";
import type { ConversationItem } from "../types";

describe("long conversations", () => {
  it("appends 100 messages and 100 tools without dropping history", () => {
    let items: ConversationItem[] = [];
    for (let index = 0; index < 100; index += 1) {
      const events: AgentEvent[] = [
        {
          type: "started",
          requestId: `r${index}`,
          messageId: `a${index}`,
          model: "m",
          userMessage: { id: `u${index}`, role: "user", content: `Q${index}`, timestamp: index },
        },
        { type: "text-delta", messageId: `a${index}`, text: `A${index}` },
        { type: "tool-started", id: `t${index}`, tool: "read_file", input: { path: `f${index}.ts` } },
        { type: "tool-completed", id: `t${index}`, tool: "read_file", output: { success: true } },
      ];
      items = events.reduce((current, event) => applyAgentEvent(current, event), items);
    }
    expect(items.filter((item) => item.type === "user")).toHaveLength(100);
    expect(items.filter((item) => item.type === "tool")).toHaveLength(100);
    expect(items.filter((item) => item.type === "assistant")).toHaveLength(100);
  });
});
