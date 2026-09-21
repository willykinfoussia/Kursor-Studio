import { isPlanDocumentPath } from "../workflow/planPath";

export const MIN_USEFUL_MESSAGES = 2;
export const SHORT_GOAL_MAX_TOKENS = 6;

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

export function shouldSkipKnowledgeReflect(input: KnowledgeReflectGateInput):
  | { skip: true; reason: string }
  | { skip: false } {
  if (!input.enabled) return { skip: true, reason: "disabled" };
  if (input.skipFlag) return { skip: true, reason: "reflect-turn" };
  if (input.alreadyRunning) return { skip: true, reason: "in-flight" };
  const useful = input.messages.filter((message) => message.role === "user" || message.role === "assistant");
  if (useful.length < MIN_USEFUL_MESSAGES) return { skip: true, reason: "trivial" };
  if (!hasProductFileChanges(input.filesChanged)) {
    return { skip: true, reason: "not-implementation" };
  }
  if (input.planUnfinished) return { skip: true, reason: "not-implementation" };
  return { skip: false };
}
