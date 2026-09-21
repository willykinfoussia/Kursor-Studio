import type { AgentMessage, AgentStream, AIRequestOptions } from "./types";

export interface CompleteTextOptions {
  model: string;
  systemPrompt: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  json?: boolean;
}

export interface CompleteTextResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface AIService {
  streamChat(messages: AgentMessage[], options: AIRequestOptions): Promise<AgentStream>;
  completeText?(messages: AgentMessage[], options: CompleteTextOptions): Promise<CompleteTextResult>;
}
