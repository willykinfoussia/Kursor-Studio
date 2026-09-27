import { describe, expect, it } from "vitest";
import type { AIService, ChoiceEvaluationAnswer } from "../../AIService";
import { classifyTurn, routeGoalKind, SAFE_TURN_VERDICT, TURN_CHOICE_PROBABILITY } from "../turnClassifier";

function choice(value: string, probability = 0.9): ChoiceEvaluationAnswer {
  return { type: "choice", choice: value, probabilities: { [value]: probability } };
}

function ai(answers: Record<string, ChoiceEvaluationAnswer>): AIService {
  return {
    streamChat: async () => {
      throw new Error("unused");
    },
    evaluate: async () => ({ answers }),
  };
}

const input = {
  prompt: "améliorer l'ui",
  previousGoalKind: "other" as const,
  designPending: false,
  planOpen: false,
};

describe("classifyTurn", () => {
  it("maps a confident JEV answer onto the verdict", async () => {
    const verdict = await classifyTurn(ai({
      goalKind: choice("other"),
      complexity: choice("complex"),
      reply: choice("none"),
      skipProcess: choice("keep"),
      continuation: choice("new"),
      modelTask: choice("planning"),
    }), input);
    expect(verdict.complexity).toBe("complex");
    expect(verdict.modelTask).toBe("planning");
    expect(routeGoalKind(verdict, "agent")).toBe("build");
  });

  it("keeps a simple action on the direct loop", async () => {
    const verdict = await classifyTurn(ai({
      goalKind: choice("other"),
      complexity: choice("simple"),
      reply: choice("none"),
      skipProcess: choice("keep"),
      continuation: choice("new"),
      modelTask: choice("simple-edit"),
    }), { ...input, prompt: "supprimer readme.md" });
    expect(routeGoalKind(verdict, "agent")).toBe("other");
    expect(verdict.complexity).toBe("simple");
  });

  it("drops a choice below the probability threshold to its safe pole", async () => {
    const verdict = await classifyTurn(ai({
      goalKind: choice("build"),
      complexity: choice("simple", TURN_CHOICE_PROBABILITY - 0.01),
      reply: choice("design_yes", 0.2),
      skipProcess: choice("skip", 0.1),
      continuation: choice("continue", 0.1),
      modelTask: choice("planning"),
    }), input);
    expect(verdict.complexity).toBe("medium");
    expect(verdict.reply).toBe("none");
    expect(verdict.skipProcess).toBe("keep");
    expect(verdict.continuation).toBe("new");
    expect(verdict.goalKind).toBe("build");
  });

  it("returns the safe verdict when evaluate throws", async () => {
    const failing: AIService = {
      streamChat: async () => {
        throw new Error("unused");
      },
      evaluate: async () => {
        throw new Error("down");
      },
    };
    expect(await classifyTurn(failing, input)).toEqual(SAFE_TURN_VERDICT);
  });

  it("returns the safe verdict when evaluate is missing", async () => {
    const bare: AIService = {
      streamChat: async () => {
        throw new Error("unused");
      },
    };
    expect(await classifyTurn(bare, input)).toEqual(SAFE_TURN_VERDICT);
  });

  it("lets Ask and Debug override the verdict", () => {
    expect(routeGoalKind(SAFE_TURN_VERDICT, "ask")).toBe("explain");
    expect(routeGoalKind(SAFE_TURN_VERDICT, "debug")).toBe("bug");
  });
});
