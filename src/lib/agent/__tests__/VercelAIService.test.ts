import { describe, expect, it } from "vitest";
import { foldSystemMessages, toModelMessages, toolCallCap } from "../VercelAIService";
import type { AgentMessage } from "../types";

function message(role: AgentMessage["role"], content: string, id = role): AgentMessage {
  return { id, role, content, timestamp: 1 };
}

describe("foldSystemMessages", () => {
  it("moves system-role messages into the system prompt", () => {
    const folded = foldSystemMessages(
      [
        message("system", "Call create_plan now."),
        message("user", "oui"),
        message("assistant", "ok"),
      ],
      "You are the coding agent.",
    );
    expect(folded.systemPrompt).toBe("You are the coding agent.\n\nCall create_plan now.");
    expect(folded.messages.map((item) => item.role)).toEqual(["user", "assistant"]);
  });

  it("leaves a prompt unchanged when there are no system messages", () => {
    const folded = foldSystemMessages([message("user", "hi")], "Base.");
    expect(folded.systemPrompt).toBe("Base.");
    expect(folded.messages).toHaveLength(1);
  });
});

describe("toModelMessages", () => {
  it("does not emit system roles to the provider messages array", () => {
    const mapped = toModelMessages([
      message("system", "must not appear"),
      message("user", "hello"),
      message("assistant", "hi"),
      message("tool", "done"),
    ]);
    expect(mapped).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "Tool result:\ndone" },
    ]);
  });
});

describe("toolCallCap", () => {
  it("never stops when both caps are unlimited", () => {
    const stop = toolCallCap();
    expect(stop({ steps: [{}, {}, { toolCalls: [{}, {}, {}] }] })).toBe(false);
    expect(toolCallCap(null, null)({ steps: Array.from({ length: 40 }, () => ({ toolCalls: [{}] })) })).toBe(false);
  });

  it("stops when the step cap is reached", () => {
    const stop = toolCallCap(2, null);
    expect(stop({ steps: [{}] })).toBe(false);
    expect(stop({ steps: [{}, {}] })).toBe(true);
  });

  it("stops when the tool-call cap is reached", () => {
    const stop = toolCallCap(null, 3);
    expect(stop({ steps: [{ toolCalls: [{}, {}] }] })).toBe(false);
    expect(stop({ steps: [{ toolCalls: [{}, {}, {}] }] })).toBe(true);
    expect(stop({ steps: [{ toolCalls: [{}] }, { toolCalls: [{}, {}] }] })).toBe(true);
  });
});
