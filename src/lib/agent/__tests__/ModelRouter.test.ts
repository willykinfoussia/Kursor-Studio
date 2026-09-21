import { describe, expect, it } from "vitest";
import { AI_MODELS } from "../config";
import { ModelRouter } from "../ModelRouter";

describe("ModelRouter", () => {
  it("returns Laguna first by default", () => {
    const models = new ModelRouter().getModels();
    expect(models[0].id).toBe("poolside/laguna-s-2.1-free");
    expect(models.map((model) => model.id)).toEqual(AI_MODELS.map((model) => model.id));
  });

  it("uses the configured modelOrder as fallback sequence", () => {
    const order = [
      "deepseek/deepseek-v4-flash-0731",
      "inclusionai/ling-3.0-flash-sante-free",
      "poolside/laguna-s-2.1-free",
    ];
    const models = new ModelRouter().getModels(order);
    expect(models.map((model) => model.id)).toEqual(order);
  });

  it("appends enabled models missing from the configured order", () => {
    const models = new ModelRouter().getModels(["deepseek/deepseek-v4-flash-0731"]);
    expect(models.map((model) => model.id)).toEqual([
      "deepseek/deepseek-v4-flash-0731",
      "poolside/laguna-s-2.1-free",
      "inclusionai/ling-3.0-flash-sante-free",
    ]);
  });

  it("selects a custom model first when it leads the order", () => {
    const custom = {
      id: "moonshotai/kimi-k2.5",
      name: "kimi-k2.5",
      priority: 4,
      enabled: true,
    };
    const order = [custom.id, ...AI_MODELS.map((model) => model.id)];
    const models = new ModelRouter([...AI_MODELS, custom]).getModels(order);
    expect(models[0]?.id).toBe(custom.id);
    expect(models.map((model) => model.id)).toEqual(order);
  });
});
