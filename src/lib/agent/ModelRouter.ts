import { AI_MODELS } from "./config";
import type { AIModel } from "./types";

export class ModelRouter {
  constructor(private readonly models: readonly AIModel[] = AI_MODELS) {}

  getModels(order: readonly string[] = []): AIModel[] {
    const enabled = this.models.filter((model) => model.enabled);
    const selected = new Set<string>();
    const ordered: AIModel[] = [];

    const sequence = order ?? [];
    for (const modelId of sequence) {
      const model = enabled.find((item) => item.id === modelId);
      if (!model || selected.has(model.id)) continue;
      ordered.push(model);
      selected.add(model.id);
    }

    for (const model of enabled) {
      if (selected.has(model.id)) continue;
      ordered.push(model);
    }

    return ordered;
  }

  getDefault(order: readonly string[] = []): AIModel {
    const model = this.getModels(order)[0];
    if (!model) throw new Error("No AI model is enabled.");
    return model;
  }
}
