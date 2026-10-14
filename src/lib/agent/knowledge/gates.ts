import { isPlanDocumentPath } from "../workflow/planPath";

export const MIN_USEFUL_MESSAGES = 2;
export const MIN_DURABLE_MESSAGES = 4;
export const MIN_DURABLE_CHARS = 480;
export const SHORT_GOAL_MAX_TOKENS = 6;

export type KnowledgeReflectMode = "full" | "skills";

export interface KnowledgeReflectGateInput {
  enabled: boolean;
  skipFlag?: boolean;
  alreadyRunning: boolean;
  messages: { role: string; content?: string }[];
  toolNames: string[];
  goal: string;
  filesChanged?: string[];
  planUnfinished?: boolean;
}

export function isProductImplementationPath(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, "/");
  if (!normalized) return false;
  return !isPlanDocumentPath(normalized);
}

export function hasProductFileChanges(filesChanged: readonly string[] = []): boolean {
  return filesChanged.some((path) => isProductImplementationPath(path));
}

function usefulMessages(messages: { role: string; content?: string }[]) {
  return messages.filter((message) => message.role === "user" || message.role === "assistant");
}

export function isDurableConversation(messages: { role: string; content?: string }[]): boolean {
  const useful = usefulMessages(messages);
  if (useful.length >= MIN_DURABLE_MESSAGES) return true;
  const text = useful.map((message) => message.content ?? "").join("\n").trim();
  return text.length >= MIN_DURABLE_CHARS;
}

export function shouldSkipKnowledgeReflect(input: KnowledgeReflectGateInput):
  | { skip: true; reason: string }
  | { skip: false; mode: KnowledgeReflectMode } {
  if (!input.enabled) return { skip: true, reason: "disabled" };
  if (input.skipFlag) return { skip: true, reason: "reflect-turn" };
  if (input.alreadyRunning) return { skip: true, reason: "in-flight" };
  const useful = usefulMessages(input.messages);
  if (useful.length < MIN_USEFUL_MESSAGES) return { skip: true, reason: "trivial" };
  const product = hasProductFileChanges(input.filesChanged);
  if (product && !input.planUnfinished) return { skip: false, mode: "full" };
  if ((input.planUnfinished || !product) && isDurableConversation(input.messages)) {
    return { skip: false, mode: "skills" };
  }
  return { skip: true, reason: "not-implementation" };
}
