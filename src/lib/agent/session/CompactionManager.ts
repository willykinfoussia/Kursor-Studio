import { estimateTokens } from "../context/tokens";
import type { AgentMessage } from "../types";
import {
  COMPACT_KEEP_MESSAGES,
  SESSION_COMPACT_PREFIX,
  type CompactInput,
  type CompactResult,
} from "./types";

const DECISION_PATTERN = /\b(decided(?:\s+to)?|chose|choosing|decision(?:\s+is)?|we'll go with|going with|picked)\b/i;

export class CompactionManager {
  needsCompact(
    messages: readonly AgentMessage[],
    budget: { maxTokens: number; maxHistoryMessages: number },
  ) {
    if (messages.length > budget.maxHistoryMessages) return true;
    return estimateTokens(messages.map((message) => message.content).join("\n")) > budget.maxTokens;
  }

  compact(input: CompactInput): CompactResult {
    const keepCount = input.keepCount ?? COMPACT_KEEP_MESSAGES;
    const kept = selectKeptMessages(input.messages, keepCount);
    const dropped = input.messages.filter((message) => !kept.some((item) => item.id === message.id));
    const excerpts = dropped
      .filter((message) => message.role === "user" || message.role === "assistant")
      .filter((message) => !message.content.startsWith(SESSION_COMPACT_PREFIX))
      .map((message) => `${message.role}: ${clip(message.content, 400)}`);
    const summary = excerpts.join("\n") || "No earlier conversation.";
    const decisions = extractDecisions(dropped);
    const currentState = [input.currentGoal, input.currentStep, input.currentModel]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
    const unresolvedIssues = [
      ...input.toolCalls
        .filter((call) => call.status === "failed")
        .map((call) => `tool ${call.tool} failed`),
      ...input.toolCalls
        .filter((call) => call.status === "running")
        .map((call) => `tool ${call.tool} running`),
      ...(input.currentTask?.status === "running"
        ? [`task running: ${input.currentTask.title}`]
        : []),
    ];
    const summaryMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: "system",
      content: formatCompactMessage({
        summary,
        decisions,
        currentState,
        filesChanged: input.filesChanged,
        unresolvedIssues,
      }),
      timestamp: Date.now(),
    };
    const withoutOldCompact = kept.filter((message) => !message.content.startsWith(SESSION_COMPACT_PREFIX));
    return {
      summary,
      decisions,
      currentState,
      filesChanged: [...input.filesChanged],
      unresolvedIssues,
      keptMessages: [summaryMessage, ...withoutOldCompact],
    };
  }
}

export function formatCompactMessage(input: {
  summary: string;
  decisions: string[];
  currentState: string;
  filesChanged: string[];
  unresolvedIssues: string[];
}) {
  const lines = [
    SESSION_COMPACT_PREFIX,
    "Summary:",
    input.summary,
    "",
    "Decisions:",
    ...(input.decisions.length > 0 ? input.decisions.map((item) => `- ${item}`) : ["- none"]),
    "",
    `State: ${input.currentState || "unknown"}`,
    "",
    "Files changed:",
    ...(input.filesChanged.length > 0 ? input.filesChanged.map((item) => `- ${item}`) : ["- none"]),
    "",
    "Unresolved:",
    ...(input.unresolvedIssues.length > 0 ? input.unresolvedIssues.map((item) => `- ${item}`) : ["- none"]),
  ];
  return lines.join("\n");
}

function selectKeptMessages(messages: readonly AgentMessage[], keepCount: number): AgentMessage[] {
  if (messages.length === 0) return [];
  const groups = groupAtomic(messages);
  const lastUserIndex = lastIndex(groups, (group) => group.some((message) => message.role === "user"));
  const keepFrom = Math.max(0, groups.length - keepCount);
  const ids = new Set<string>();
  groups.forEach((group, index) => {
    if (index >= keepFrom || index === lastUserIndex) {
      for (const message of group) ids.add(message.id);
    }
  });
  return expandPairs(messages, ids);
}

function groupAtomic(messages: readonly AgentMessage[]): AgentMessage[][] {
  const groups: AgentMessage[][] = [];
  for (const message of messages) {
    const last = groups[groups.length - 1];
    if (message.role === "tool" && last) {
      last.push(message);
      continue;
    }
    groups.push([message]);
  }
  return groups;
}

function expandPairs(messages: readonly AgentMessage[], ids: Set<string>): AgentMessage[] {
  const next = new Set(ids);
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const previous = messages[index - 1];
    const following = messages[index + 1];
    if (!message) continue;
    if (message.role === "tool" && next.has(message.id) && previous) next.add(previous.id);
    if (message.role === "assistant" && next.has(message.id) && following?.role === "tool") {
      next.add(following.id);
    }
  }
  return messages.filter((message) => next.has(message.id));
}

function extractDecisions(messages: readonly AgentMessage[]): string[] {
  const found: string[] = [];
  for (const message of messages) {
    if (message.role !== "assistant" && message.role !== "user") continue;
    for (const sentence of message.content.split(/(?<=[.!?])\s+/)) {
      const trimmed = sentence.trim();
      if (trimmed && DECISION_PATTERN.test(trimmed)) found.push(trimmed);
    }
  }
  return [...new Set(found)].slice(0, 12);
}

function lastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) return index;
  }
  return -1;
}

function clip(text: string, max: number) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}
