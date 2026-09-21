import { describe, expect, it } from "vitest";
import { parseClassifierDecision, classifyPermission } from "../permissionClassifier";
import type { AIService } from "../AIService";

describe("parseClassifierDecision", () => {
  it("reads allow, deny, and ask_human from JSON", () => {
    expect(parseClassifierDecision('{"decision":"allow","reason":"read"}').decision).toBe("allow");
    expect(parseClassifierDecision('{"decision":"deny"}').decision).toBe("deny");
    expect(parseClassifierDecision('{"decision":"ask_human"}').decision).toBe("ask_human");
  });

  it("fails closed to ask_human on garbage", () => {
    expect(parseClassifierDecision("not json").decision).toBe("ask_human");
  });
});

describe("classifyPermission", () => {
  it("returns ask_human when completeText throws", async () => {
    const ai: AIService = {
      async streamChat() {
        return { events: (async function* () {})() };
      },
      async completeText() {
        throw new Error("gateway down");
      },
    };
    const result = await classifyPermission(ai, {
      tool: "write_file",
      args: { path: "a.ts" },
      cwd: null,
      mode: "workspace-write",
      model: "test",
    });
    expect(result.decision).toBe("ask_human");
  });

  it("returns ask_human when completeText is missing", async () => {
    const ai: AIService = {
      async streamChat() {
        return { events: (async function* () {})() };
      },
    };
    const result = await classifyPermission(ai, {
      tool: "read_file",
      args: {},
      cwd: null,
      mode: "read-only",
      model: "test",
    });
    expect(result.decision).toBe("ask_human");
  });
});
