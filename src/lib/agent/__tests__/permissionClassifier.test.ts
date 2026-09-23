import { describe, expect, it } from "vitest";
import { classifyPermission } from "../permissionClassifier";
import type { AIService, ChoiceEvaluationAnswer } from "../AIService";

function service(evaluate: AIService["evaluate"]): AIService {
  return {
    async streamChat() {
      return { events: (async function* () {})() };
    },
    evaluate,
  };
}

function choice(choiceName: "allow" | "escalate", probability: number): ChoiceEvaluationAnswer {
  return {
    type: "choice",
    choice: choiceName,
    probabilities: {
      allow: choiceName === "allow" ? probability : 1 - probability,
      escalate: choiceName === "escalate" ? probability : 1 - probability,
    },
  };
}

describe("classifyPermission", () => {
  it("allows when allow is at least 0.55", async () => {
    const result = await classifyPermission(service(async () => ({
      answers: { decision: choice("allow", 0.55) },
    })), {
      tool: "read_file",
      args: { path: "a.ts" },
      cwd: null,
      mode: "workspace-write",
    });
    expect(result).toEqual({ decision: "allow", reason: "allow 0.55" });
  });

  it("asks the human when allow is below 0.55", async () => {
    const result = await classifyPermission(service(async () => ({
      answers: { decision: choice("allow", 0.54) },
    })), {
      tool: "write_file",
      args: { path: "a.ts" },
      cwd: null,
      mode: "workspace-write",
    });
    expect(result).toEqual({ decision: "ask_human", reason: "allow 0.54" });
  });

  it("asks the human when the choice is escalate", async () => {
    const result = await classifyPermission(service(async () => ({
      answers: { decision: choice("escalate", 0.99) },
    })), {
      tool: "shell",
      args: { command: "sudo reboot" },
      cwd: null,
      mode: "workspace-write",
    });
    expect(result).toEqual({ decision: "ask_human", reason: "escalate 0.99" });
  });

  it("returns ask_human when evaluate throws", async () => {
    const result = await classifyPermission(service(async () => {
      throw new Error("gateway down");
    }), {
      tool: "write_file",
      args: { path: "a.ts" },
      cwd: null,
      mode: "workspace-write",
    });
    expect(result).toEqual({ decision: "ask_human", reason: "gateway down" });
  });

  it("returns ask_human when evaluate is missing", async () => {
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
    });
    expect(result).toEqual({ decision: "ask_human", reason: "No evaluate on AIService." });
  });
});
