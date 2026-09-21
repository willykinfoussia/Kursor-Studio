import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import {
  AIFallbackExhaustedError,
  AIProviderCancelledError,
  AIProviderError,
  AIProviderRateLimitError,
  classifyError,
  toUserMessage,
} from "../errors";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/ai/language-model";

function gatewayError(options: {
  statusCode: number;
  message?: string;
  data?: unknown;
  responseBody?: string;
  isRetryable?: boolean;
}) {
  return new APICallError({
    message: options.message ?? "API call failed",
    url: GATEWAY_URL,
    requestBodyValues: {},
    statusCode: options.statusCode,
    data: options.data,
    responseBody: options.responseBody,
    isRetryable: options.isRetryable,
  });
}

describe("classifyError", () => {
  it("keeps the Gateway 401 message and status", () => {
    const classified = classifyError(gatewayError({
      statusCode: 401,
      data: { error: { message: "Incorrect API key provided" } },
    }));
    expect(classified).toBeInstanceOf(AIProviderError);
    expect(classified.statusCode).toBe(401);
    expect(classified.message).toBe("Incorrect API key provided");
    expect(classified.retryable).toBe(false);
  });

  it("keeps the Gateway 429 message as a rate-limit error", () => {
    const classified = classifyError(gatewayError({
      statusCode: 429,
      data: { error: { message: "Rate limit exceeded" } },
    }));
    expect(classified).toBeInstanceOf(AIProviderRateLimitError);
    expect(classified.statusCode).toBe(429);
    expect(classified.message).toBe("Rate limit exceeded");
    expect(classified.retryable).toBe(true);
  });

  it("keeps the Gateway 500 message from the response body", () => {
    const classified = classifyError(gatewayError({
      statusCode: 500,
      responseBody: JSON.stringify({ message: "Internal server error from gateway" }),
    }));
    expect(classified.statusCode).toBe(500);
    expect(classified.message).toBe("Internal server error from gateway");
    expect(classified.retryable).toBe(true);
  });

  it("treats user abort as cancellation", () => {
    const controller = new AbortController();
    controller.abort();
    const classified = classifyError(new Error("aborted"), controller.signal);
    expect(classified).toBeInstanceOf(AIProviderCancelledError);
  });

  it("maps agent-duration abort to a non-retryable duration error", () => {
    const controller = new AbortController();
    controller.abort("agent-duration");
    const classified = classifyError(new Error("aborted"), controller.signal);
    expect(classified).toBeInstanceOf(AIProviderError);
    expect(classified.retryable).toBe(false);
    expect(classified.message).toBe("The agent run exceeded the maximum duration.");
  });
});

describe("toUserMessage", () => {
  it("formats HTTP 401 with the exact Gateway message", () => {
    const error = classifyError(gatewayError({
      statusCode: 401,
      data: { error: { message: "Invalid API key" } },
    }));
    expect(toUserMessage(error)).toBe("HTTP 401 — Invalid API key");
  });

  it("formats HTTP 429 with the exact Gateway message", () => {
    const error = classifyError(gatewayError({
      statusCode: 429,
      data: { message: "Too many requests" },
    }));
    expect(toUserMessage(error)).toBe("HTTP 429 — Too many requests");
  });

  it("formats HTTP 500 with the exact Gateway message", () => {
    const error = classifyError(gatewayError({
      statusCode: 500,
      data: { error: { message: "Provider overloaded" } },
    }));
    expect(toUserMessage(error)).toBe("HTTP 500 — Provider overloaded");
  });

  it("shows the last fallback failure instead of a generic summary", () => {
    const exhausted = new AIFallbackExhaustedError([
      new AIProviderError("Laguna unavailable", { statusCode: 503 }),
      new AIProviderError("Ling rejected the request", { statusCode: 403 }),
    ]);
    expect(toUserMessage(exhausted)).toBe("HTTP 403 — Ling rejected the request");
    expect(toUserMessage(exhausted)).not.toContain("Unable to contact AI providers");
  });

  it("keeps cancellation copy unchanged", () => {
    expect(toUserMessage(new AIProviderCancelledError())).toBe("Generation cancelled.");
  });
});
