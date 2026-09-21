import type { AgentEvent } from "../types";

export function shouldIngestKnowledgeProposal(event: AgentEvent): string | null {
  if (event.type !== "knowledge-reflect-completed") return null;
  return event.proposalId || null;
}

export function isUnhandledChatEvent(type: AgentEvent["type"]) {
  return type === "knowledge-reflect-started"
    || type === "knowledge-reflect-skipped"
    || type === "knowledge-reflect-completed";
}
