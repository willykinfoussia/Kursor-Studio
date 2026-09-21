import { createGateway } from "@ai-sdk/gateway";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { generateText, jsonSchema, streamText, tool, type ModelMessage } from "ai";
import { isTauri } from "../tauri/invoke";
import type { AIService, CompleteTextOptions, CompleteTextResult } from "./AIService";
import { AIProviderError } from "./errors";
import { AI_GATEWAY_KEY, secretStore, type SecretStore } from "./SecretStore";
import { toolRegistry, type AgentTool } from "./ToolRegistry";
import type { AgentEvent, AgentMessage, AgentStream, AIRequestOptions } from "./types";

export function foldSystemMessages(
  messages: AgentMessage[],
  systemPrompt = "",
): { systemPrompt: string; messages: AgentMessage[] } {
  const extras = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean);
  return {
    systemPrompt: [systemPrompt, ...extras].filter(Boolean).join("\n\n"),
    messages: messages.filter((message) => message.role !== "system"),
  };
}

export function toModelMessages(messages: AgentMessage[]): ModelMessage[] {
  return messages.flatMap((message): ModelMessage[] => {
    if (message.role === "user" || message.role === "assistant") {
      return [{ role: message.role, content: message.content }];
    }
    if (message.role === "tool") {
      return [{ role: "user", content: `Tool result:\n${message.content}` }];
    }
    return [];
  });
}

const gatewayFetch: typeof globalThis.fetch = (input, init) => {
  if (isTauri()) return tauriFetch(input, init);
  return globalThis.fetch(input, init);
};

export function toolCallCap(maxSteps?: number | null, maxToolCalls?: number | null) {
  return ({ steps }: { steps: Array<{ toolCalls?: unknown[] }> }) => {
    if (typeof maxSteps === "number" && maxSteps >= 1 && steps.length >= maxSteps) return true;
    if (typeof maxToolCalls === "number" && maxToolCalls >= 1) {
      const calls = steps.reduce((sum, step) => (
        sum + (Array.isArray(step.toolCalls) ? step.toolCalls.length : 0)
      ), 0);
      return calls >= maxToolCalls;
    }
    return false;
  };
}

function toSdkTools(tools: AgentTool[], options: AIRequestOptions) {
  return Object.fromEntries(tools.map((item) => [
    item.name,
    tool({
      description: item.description,
      inputSchema: jsonSchema(item.parameters),
      execute: async (input, sdkOptions: { abortSignal?: AbortSignal; toolCallId?: string }) => {
        if (options.executor) {
          return options.executor.run(item.name, input, {
            signal: sdkOptions.abortSignal,
            callId: sdkOptions.toolCallId,
          });
        }
        try {
          if (options.gate?.needsPrompt?.(item.name, input)) {
            options.onStatus?.("waiting_approval");
          }
          const decision = await options.gate?.authorize(item.name, input) ?? "allow";
          if (decision === "deny") {
            return { success: false, error: { code: "permission_denied", message: "Permission denied." }, durationMs: 0 };
          }
          return await item.execute(input, {
            signal: sdkOptions.abortSignal ?? new AbortController().signal,
            projectRoot: options.getProjectRoot?.() ?? null,
            skillSession: options.skillSession,
          });
        } catch (error) {
          return {
            success: false,
            error: { code: "execution_failed", message: error instanceof Error ? error.message : "Tool failed." },
            durationMs: 0,
          };
        }
      },
    }),
  ]));
}

function streamPart(part: { type: string } & Record<string, unknown>): AgentEvent | null {
  if (part.type === "text-delta" && typeof part.text === "string") {
    return { type: "text-delta", messageId: "", text: part.text };
  }
  if (part.type === "start-step" || part.type === "step-start") {
    return { type: "step-started", stepId: String(part.id ?? ""), index: Number(part.index ?? 0), kind: "model" };
  }
  if (part.type === "finish-step" || part.type === "step-finish") {
    return { type: "step-finished", stepId: String(part.id ?? ""), index: Number(part.index ?? 0), kind: "model" };
  }
  if (part.type === "tool-call") {
    return {
      type: "tool-started",
      id: String(part.toolCallId ?? ""),
      tool: String(part.toolName ?? ""),
      input: part.input ?? part.args ?? {},
    };
  }
  if (part.type === "tool-result") {
    return {
      type: "tool-completed",
      id: String(part.toolCallId ?? ""),
      tool: String(part.toolName ?? ""),
      output: part.output ?? part.result ?? {},
    };
  }
  return null;
}

export class VercelAIService implements AIService {
  constructor(private readonly secrets: SecretStore = secretStore) {}

  async streamChat(messages: AgentMessage[], options: AIRequestOptions): Promise<AgentStream> {
    const apiKey = await this.secrets.get(AI_GATEWAY_KEY);
    if (!apiKey) {
      throw new AIProviderError("AI Gateway API key is missing.", { statusCode: 401 });
    }
    if (options.simulateFailureFor?.includes(options.model)) {
      throw new AIProviderError("Simulated provider outage.", { retryable: false });
    }

    const signal = options.signal;
    const gateway = createGateway({ apiKey, fetch: gatewayFetch });
    const enabledTools = options.toolsEnabled === false
      ? []
      : (options.tools ?? toolRegistry.listEnabled());
    const sdkTools = enabledTools.length > 0 ? toSdkTools(enabledTools, options) : undefined;

    const folded = foldSystemMessages(messages, options.systemPrompt);
    const result = streamText({
      model: gateway(options.model),
      system: folded.systemPrompt,
      messages: toModelMessages(folded.messages),
      ...(signal ? { abortSignal: signal } : {}),
      maxRetries: 0,
      ...(sdkTools ? { tools: sdkTools, stopWhen: toolCallCap(options.maxSteps, options.maxToolCalls) } : {}),
      onError: () => {
        // Errors are normalized and logged by AgentRuntime after the stream drains.
      },
    });

    const events = (async function* (): AsyncGenerator<AgentEvent> {
      let streamError: unknown;
      for await (const part of result.fullStream) {
        const event = streamPart(part as { type: string } & Record<string, unknown>);
        if (event && streamError === undefined) {
          yield event;
        } else if (part.type === "error") {
          streamError ??= (part as { error?: unknown }).error;
        } else if (part.type === "abort") {
          streamError ??= signal?.reason;
        }
      }
      if (streamError !== undefined) throw streamError;
    })();

    return { events, usage: Promise.resolve(result.usage).then((value) => readUsage(value)).catch(() => undefined) };
  }

  async completeText(messages: AgentMessage[], options: CompleteTextOptions): Promise<CompleteTextResult> {
    const apiKey = await this.secrets.get(AI_GATEWAY_KEY);
    if (!apiKey) {
      throw new AIProviderError("AI Gateway API key is missing.", { statusCode: 401 });
    }
    const gateway = createGateway({ apiKey, fetch: gatewayFetch });
    const folded = foldSystemMessages(messages, options.systemPrompt);
    const result = await generateText({
      model: gateway(options.model),
      system: folded.systemPrompt,
      messages: toModelMessages(folded.messages),
      ...(options.signal ? { abortSignal: options.signal } : {}),
      maxRetries: 0,
    });
    return {
      text: result.text,
      usage: readUsage(result.usage),
    };
  }
}

function readUsage(usage: unknown): { inputTokens?: number; outputTokens?: number } | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as {
    inputTokens?: unknown;
    outputTokens?: unknown;
    promptTokens?: unknown;
    completionTokens?: unknown;
  };
  const inputTokens = numberOrUndefined(record.inputTokens ?? record.promptTokens);
  const outputTokens = numberOrUndefined(record.outputTokens ?? record.completionTokens);
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  return { inputTokens, outputTokens };
}

function numberOrUndefined(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
