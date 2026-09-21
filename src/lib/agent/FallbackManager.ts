import { MAX_RETRIES_PER_MODEL } from "./config";
import {
  AIFallbackExhaustedError,
  AIProviderCancelledError,
  type AIProviderError,
  classifyError,
} from "./errors";
import type { AIModel } from "./types";

export interface FallbackOptions {
  models: readonly AIModel[];
  fallbackEnabled: boolean;
  signal?: AbortSignal;
  maxRetriesPerModel?: number;
  onAttempt?: (model: AIModel, attempt: number) => void;
  onModelError?: (model: AIModel, error: AIProviderError) => void;
  onFallback?: (fromModel: AIModel, toModel: AIModel, reason: string) => void;
}

export interface FallbackResult<T> {
  value: T;
  model: AIModel;
}

export class FallbackManager {
  async execute<T>(
    operation: (model: AIModel, signal?: AbortSignal) => Promise<T>,
    options: FallbackOptions,
  ): Promise<FallbackResult<T>> {
    const models = options.fallbackEnabled ? options.models : options.models.slice(0, 1);
    const failures: AIProviderError[] = [];
    const maxRetries = options.maxRetriesPerModel ?? MAX_RETRIES_PER_MODEL;

    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const model = models[modelIndex];
      let attempt = 0;

      while (attempt <= maxRetries) {
        if (options.signal?.aborted) throw new AIProviderCancelledError();
        options.onAttempt?.(model, attempt);
        try {
          const value = await operation(model, options.signal);
          return { value, model };
        } catch (rawError) {
          const error = classifyError(rawError, options.signal);
          if (error instanceof AIProviderCancelledError) throw error;
          failures.push(error);
          options.onModelError?.(model, error);
          if (!error.retryable || attempt >= maxRetries) break;
          attempt += 1;
        }
      }

      const nextModel = models[modelIndex + 1];
      if (nextModel) {
        options.onFallback?.(
          model,
          nextModel,
          failures[failures.length - 1]?.message ?? "Provider unavailable",
        );
      }
    }

    throw new AIFallbackExhaustedError(failures);
  }
}
