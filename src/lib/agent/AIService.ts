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

export type EvaluateState =
  | string
  | number
  | boolean
  | null
  | EvaluateState[]
  | { [key: string]: EvaluateState };

export interface ChoiceEvaluationQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface EvaluateOptions {
  state: EvaluateState;
  questions: Record<string, ChoiceEvaluationQuestion>;
  signal?: AbortSignal;
}

export interface ChoiceEvaluationAnswer {
  type: "choice";
  choice: string;
  probabilities?: Record<string, number>;
}

export interface EvaluateResult {
  answers: Record<string, ChoiceEvaluationAnswer>;
}

export interface AIService {
  streamChat(messages: AgentMessage[], options: AIRequestOptions): Promise<AgentStream>;
  completeText?(messages: AgentMessage[], options: CompleteTextOptions): Promise<CompleteTextResult>;
  evaluate?(options: EvaluateOptions): Promise<EvaluateResult>;
}
