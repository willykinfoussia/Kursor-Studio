import { describe, expect, it, vi } from "vitest";
import { AI_MODELS } from "../config";
import {
  AIFallbackExhaustedError,
  AIProviderCancelledError,
  AIProviderError,
} from "../errors";
import { FallbackManager } from "../FallbackManager";

const unavailable = () => new AIProviderError("Unavailable", { retryable: false });

describe("FallbackManager", () => {
  it("falls back from Laguna to Ling", async () => {
    const operation = vi.fn(async (model: { id: string }) => {
      if (model.id === AI_MODELS[0].id) throw unavailable();
      return model.id;
    });
    const result = await new FallbackManager().execute(operation, {
      models: AI_MODELS,
      fallbackEnabled: true,
    });
    expect(result.model.id).toBe(AI_MODELS[1].id);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("reaches DeepSeek when Laguna and Ling fail", async () => {
    const result = await new FallbackManager().execute(async (model) => {
      if (model.id !== AI_MODELS[2].id) throw unavailable();
      return "ok";
    }, { models: AI_MODELS, fallbackEnabled: true });
    expect(result.model.id).toBe(AI_MODELS[2].id);
  });

  it("throws a final typed error when all models fail", async () => {
    await expect(new FallbackManager().execute(async () => {
      throw unavailable();
    }, { models: AI_MODELS, fallbackEnabled: true })).rejects.toBeInstanceOf(AIFallbackExhaustedError);
  });

  it("does not advance when automatic fallback is disabled", async () => {
    const operation = vi.fn(async () => {
      throw unavailable();
    });
    await expect(new FallbackManager().execute(operation, {
      models: AI_MODELS,
      fallbackEnabled: false,
    })).rejects.toBeInstanceOf(AIFallbackExhaustedError);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries one temporary failure before falling back", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new AIProviderError("Temporary", { retryable: true }))
      .mockResolvedValue("ok");
    const result = await new FallbackManager().execute(operation, {
      models: AI_MODELS,
      fallbackEnabled: true,
    });
    expect(result.model.id).toBe(AI_MODELS[0].id);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("never falls back after user cancellation", async () => {
    const operation = vi.fn(async () => {
      throw new AIProviderCancelledError();
    });
    await expect(new FallbackManager().execute(operation, {
      models: AI_MODELS,
      fallbackEnabled: true,
    })).rejects.toBeInstanceOf(AIProviderCancelledError);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
