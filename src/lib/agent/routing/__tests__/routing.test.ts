import { describe, expect, it } from "vitest";
import { AI_MODELS } from "../../config";
import { AIProviderError } from "../../errors";
import { FallbackManager } from "../../FallbackManager";
import { UsageMetrics } from "../../metrics";
import type { AIModel } from "../../types";
import { classifyModelTask } from "../TaskClassifier";
import { ModelPolicy } from "../ModelPolicy";
import { routeModels } from "../index";

const laguna = AI_MODELS[0];
const ling = AI_MODELS[1];
const deepseek = AI_MODELS[2];

function model(id: string, name = id): AIModel {
  return { id, name, priority: 99, enabled: true };
}

describe("TaskClassifier", () => {
  it("maps a rename to simple-edit", () => {
    expect(classifyModelTask("renomme cette variable")).toBe("simple-edit");
  });

  it("maps OAuth and plan wording to planning", () => {
    expect(classifyModelTask("ajoute l'authentification OAuth")).toBe("planning");
    expect(classifyModelTask("plan the architecture for billing")).toBe("planning");
  });

  it("lets a research specialist hint win over the goal text", () => {
    expect(classifyModelTask("implement login", { specialistId: "research" })).toBe("research");
  });

  it("maps workflow plan steps to planning and implement to coding", () => {
    expect(classifyModelTask("feature", { workflowStepIds: ["specify", "plan"] })).toBe("planning");
    expect(classifyModelTask("feature", { workflowStepIds: ["implement", "verify"] })).toBe("coding");
  });
});

describe("ModelPolicy", () => {
  it("does not trust a model id that looks like reasoning", () => {
    const fake = model("vendor/totally-reasoning");
    const ordered = [fake, laguna, ling, deepseek];
    const resolved = new ModelPolicy().resolve("planning", ordered);
    expect(resolved[0]?.id).toBe(deepseek.id);
    expect(resolved.find((item) => item.id === fake.id)).toBe(fake);
    const compatiblePrefix = resolved.slice(0, resolved.findIndex((item) => item.id === fake.id));
    expect(compatiblePrefix.every((item) => item.id === deepseek.id)).toBe(true);
  });

  it("puts a compatible preferred model first, then other compatibles in router order", () => {
    const policy = new ModelPolicy({
      routes: {
        "simple-edit": { capabilities: ["fast"], preferredModelId: ling.id },
      },
    });
    const resolved = policy.resolve("simple-edit", [laguna, ling, deepseek]);
    expect(resolved.map((item) => item.id)).toEqual([ling.id, laguna.id, deepseek.id]);
  });

  it("ignores a skill pin that is not compatible", () => {
    const { models } = routeModels({
      goal: "plan the architecture",
      ordered: [laguna, ling, deepseek],
      pin: laguna.id,
    });
    expect(models[0]?.id).toBe(deepseek.id);
    expect(models[0]?.id).not.toBe(laguna.id);
  });
});

describe("compatible fallback", () => {
  it("lets FallbackManager continue with the next compatible model", async () => {
    const second = model("vendor/reason-peer");
    const policy = new ModelPolicy({
      profiles: {
        [second.id]: { capabilities: ["reasoning"], usdPer1kInput: 0, usdPer1kOutput: 0 },
      },
    });
    const models = policy.resolve("planning", [deepseek, second, laguna]);
    expect(models.slice(0, 2).map((item) => item.id)).toEqual([deepseek.id, second.id]);
    const result = await new FallbackManager().execute(async (current) => {
      if (current.id === deepseek.id) throw new AIProviderError("Unavailable", { retryable: false });
      return current.id;
    }, { models, fallbackEnabled: true });
    expect(result.model.id).toBe(second.id);
  });
});

describe("UsageMetrics", () => {
  it("reports success rate, fallback rate, latency, tokens, and cost", () => {
    const metrics = new UsageMetrics();
    metrics.configure({
      profiles: {
        "cost/test": { usdPer1kInput: 1, usdPer1kOutput: 2, capabilities: ["coding"] },
      },
    });
    metrics.request("cost/test");
    metrics.request("cost/test");
    metrics.success("cost/test", 100, { inputTokens: 1000, outputTokens: 500 });
    metrics.error("cost/test", 50);
    metrics.fallback("cost/test");
    const snapshot = metrics.snapshot()[0];
    expect(snapshot?.successRate).toBe(0.5);
    expect(snapshot?.fallbackRate).toBe(0.5);
    expect(snapshot?.avgLatencyMs).toBe(75);
    expect(snapshot?.inputTokens).toBe(1000);
    expect(snapshot?.outputTokens).toBe(500);
    expect(snapshot?.costEstimateUsd).toBe(2);
  });
});
