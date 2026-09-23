import type { AIService, EvaluateOptions, EvaluateResult } from "./AIService";
import type { AgentStream, AgentMessage, AIRequestOptions } from "./types";

export type ModelProviderKind = "gateway" | "openrouter" | "ollama" | "local";

export interface ModelProvider {
  id: string;
  kind: ModelProviderKind;
  streamChat(messages: AgentMessage[], options: AIRequestOptions): Promise<AgentStream>;
}

export class GatewayModelProvider implements ModelProvider, AIService {
  readonly id = "vercel-gateway";
  readonly kind = "gateway" as const;

  constructor(private readonly service: AIService) {}

  streamChat(messages: AgentMessage[], options: AIRequestOptions) {
    return this.service.streamChat(messages, options);
  }

  completeText(messages: AgentMessage[], options: import("./AIService").CompleteTextOptions) {
    if (!this.service.completeText) {
      return Promise.reject(new Error("completeText is not available"));
    }
    return this.service.completeText(messages, options);
  }

  evaluate(options: EvaluateOptions): Promise<EvaluateResult> {
    if (!this.service.evaluate) {
      return Promise.reject(new Error("evaluate is not available"));
    }
    return this.service.evaluate(options);
  }
}

export function toAIService(provider: ModelProvider): AIService {
  return { streamChat: (messages, options) => provider.streamChat(messages, options) };
}
