import type { AIService } from "./AIService";
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
}

export function toAIService(provider: ModelProvider): AIService {
  return { streamChat: (messages, options) => provider.streamChat(messages, options) };
}
