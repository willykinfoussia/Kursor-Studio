import { APICallError } from "ai";

export class AIProviderError extends Error {
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(message: string, options?: { retryable?: boolean; statusCode?: number; cause?: unknown }) {
    super(message);
    this.name = "AIProviderError";
    this.retryable = options?.retryable ?? false;
    this.statusCode = options?.statusCode;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class AIProviderTimeoutError extends AIProviderError {
  constructor(cause?: unknown) {
    super("The model request timed out.", { retryable: true, cause });
    this.name = "AIProviderTimeoutError";
  }
}

export class AIProviderRateLimitError extends AIProviderError {
  constructor(statusCode = 429, cause?: unknown, message?: string) {
    super(message ?? "The model provider is rate limited.", { retryable: true, statusCode, cause });
    this.name = "AIProviderRateLimitError";
  }
}

export class AIProviderCancelledError extends AIProviderError {
  constructor(cause?: unknown) {
    super("Generation cancelled by the user.", { retryable: false, cause });
    this.name = "AIProviderCancelledError";
  }
}

export class AIFallbackExhaustedError extends AIProviderError {
  readonly failures: readonly AIProviderError[];

  constructor(failures: readonly AIProviderError[]) {
    const last = failures[failures.length - 1];
    super(last?.message ?? "All configured AI providers failed.", {
      retryable: false,
      statusCode: last?.statusCode,
      cause: last,
    });
    this.name = "AIFallbackExhaustedError";
    this.failures = failures;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function messageFromData(data: unknown): string | undefined {
  const record = asRecord(data);
  if (!record) return undefined;
  const nested = asRecord(record.error);
  if (typeof nested?.message === "string" && nested.message.trim()) return nested.message.trim();
  if (typeof nested?.error === "string" && nested.error.trim()) return nested.error.trim();
  if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
  if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
  return undefined;
}

export function extractProviderDetail(error: unknown): { statusCode?: number; message: string } {
  if (APICallError.isInstance(error)) {
    const fromData = messageFromData(error.data);
    let fromBody: string | undefined;
    if (!fromData && error.responseBody) {
      try {
        fromBody = messageFromData(JSON.parse(error.responseBody));
      } catch {
        const trimmed = error.responseBody.trim();
        if (trimmed) fromBody = trimmed.slice(0, 500);
      }
    }
    return {
      statusCode: error.statusCode,
      message: fromData || fromBody || error.message || "The model provider rejected the request.",
    };
  }

  if (error instanceof AIProviderError) {
    return { statusCode: error.statusCode, message: error.message };
  }

  if (error instanceof Error && error.message.trim()) {
    return { message: error.message };
  }

  return { message: "The model provider returned an unexpected error." };
}

export function formatProviderMessage(statusCode: number | undefined, message: string): string {
  return statusCode !== undefined ? `HTTP ${statusCode} — ${message}` : message;
}

export function classifyError(error: unknown, userSignal?: AbortSignal): AIProviderError {
  if (error instanceof AIProviderError) return error;
  if (userSignal?.aborted) {
    if (userSignal.reason === "agent-duration") {
      return new AIProviderError("The agent run exceeded the maximum duration.", { retryable: false, cause: error });
    }
    return new AIProviderCancelledError(error);
  }
  if (error instanceof DOMException && error.name === "AbortError") return new AIProviderCancelledError(error);
  if (error instanceof DOMException && error.name === "TimeoutError") return new AIProviderTimeoutError(error);

  if (APICallError.isInstance(error)) {
    const detail = extractProviderDetail(error);
    const retryable = error.isRetryable || (detail.statusCode !== undefined && detail.statusCode >= 500);
    if (detail.statusCode === 429) {
      return new AIProviderRateLimitError(detail.statusCode, error, detail.message);
    }
    return new AIProviderError(detail.message, {
      retryable,
      statusCode: detail.statusCode,
      cause: error,
    });
  }

  if (error instanceof TypeError) {
    return new AIProviderError(error.message || "Unable to connect to the model provider.", {
      retryable: true,
      cause: error,
    });
  }

  const detail = extractProviderDetail(error);
  return new AIProviderError(detail.message, {
    retryable: false,
    statusCode: detail.statusCode,
    cause: error,
  });
}

export function toUserMessage(error: unknown): string {
  if (error instanceof AIProviderCancelledError) return "Generation cancelled.";
  if (error instanceof AIProviderTimeoutError) {
    const cause = (error as Error & { cause?: unknown }).cause;
    const extra = cause instanceof Error && cause.message.trim() && cause.message !== error.message
      ? ` ${cause.message}`
      : "";
    return `The model request timed out.${extra}`;
  }
  if (error instanceof AIFallbackExhaustedError) {
    const last = error.failures[error.failures.length - 1];
    if (last) return formatProviderMessage(last.statusCode, last.message);
    return formatProviderMessage(error.statusCode, error.message);
  }
  if (error instanceof AIProviderError) {
    return formatProviderMessage(error.statusCode, error.message);
  }
  const detail = extractProviderDetail(error);
  return formatProviderMessage(detail.statusCode, detail.message);
}
