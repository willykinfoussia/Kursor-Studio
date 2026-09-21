import { resolveProfile } from "./routing/ModelPolicy";
import type { ModelPolicyConfig } from "./routing/types";
import type { ModelUsage, ModelUsageSnapshot } from "./types";

export type { ModelUsageSnapshot };

export class UsageMetrics {
  private readonly usage = new Map<string, ModelUsage>();
  private profiles: Record<string, Partial<import("./routing/types").ModelProfile>> = {};

  private getMutable(model: string): ModelUsage {
    const current = this.usage.get(model);
    if (current) return current;
    const created: ModelUsage = {
      model,
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      fallbackCount: 0,
      totalLatencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    this.usage.set(model, created);
    return created;
  }

  configure(policy?: Pick<ModelPolicyConfig, "profiles"> | null) {
    this.profiles = policy?.profiles ?? {};
  }

  request(model: string) {
    this.getMutable(model).requestCount += 1;
  }

  success(model: string, latencyMs: number, tokens?: { inputTokens?: number; outputTokens?: number }) {
    const usage = this.getMutable(model);
    usage.successCount += 1;
    usage.totalLatencyMs += latencyMs;
    this.addTokens(usage, tokens);
  }

  error(model: string, latencyMs: number, tokens?: { inputTokens?: number; outputTokens?: number }) {
    const usage = this.getMutable(model);
    usage.errorCount += 1;
    usage.totalLatencyMs += latencyMs;
    this.addTokens(usage, tokens);
  }

  fallback(model: string) {
    this.getMutable(model).fallbackCount += 1;
  }

  snapshot(): ModelUsageSnapshot[] {
    return [...this.usage.values()].map((item) => {
      const attempts = item.successCount + item.errorCount;
      const profile = resolveProfile(item.model, this.profiles);
      const costEstimateUsd = (item.inputTokens / 1000) * profile.usdPer1kInput
        + (item.outputTokens / 1000) * profile.usdPer1kOutput;
      return {
        ...item,
        successRate: item.requestCount > 0 ? item.successCount / item.requestCount : 0,
        fallbackRate: item.requestCount > 0 ? item.fallbackCount / item.requestCount : 0,
        avgLatencyMs: attempts > 0 ? item.totalLatencyMs / attempts : 0,
        costEstimateUsd,
      };
    });
  }

  private addTokens(usage: ModelUsage, tokens?: { inputTokens?: number; outputTokens?: number }) {
    if (!tokens) return;
    if (typeof tokens.inputTokens === "number" && tokens.inputTokens > 0) {
      usage.inputTokens += tokens.inputTokens;
    }
    if (typeof tokens.outputTokens === "number" && tokens.outputTokens > 0) {
      usage.outputTokens += tokens.outputTokens;
    }
  }
}

export const usageMetrics = new UsageMetrics();
