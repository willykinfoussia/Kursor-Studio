import { CONTEXT_PRIORITIES, type ContextSource, type SourceCollectResult } from "../types";
import { RECENT_MESSAGE_COUNT } from "../budget";
import { estimateTokens } from "../tokens";
import { SESSION_COMPACT_PREFIX } from "../../session/types";

export class ConversationSource implements ContextSource {
  readonly id = "conversation" as const;

  async collect(snapshot: Parameters<ContextSource["collect"]>[0]): Promise<SourceCollectResult> {
    if (snapshot.messages.length === 0) {
      return { slices: [], skipReason: "no conversation" };
    }

    const lastUserIndex = lastIndex(snapshot.messages, (message) => message.role === "user");
    const recentStart = Math.max(0, snapshot.messages.length - RECENT_MESSAGE_COUNT);
    const slices = snapshot.messages.map((message, index) => {
      const isRequest = index === lastUserIndex;
      const compact = message.content.startsWith(SESSION_COMPACT_PREFIX);
      const recent = index >= recentStart || compact;
      const priority = isRequest
        ? CONTEXT_PRIORITIES.userRequest
        : recent
          ? CONTEXT_PRIORITIES.recentMessages
          : CONTEXT_PRIORITIES.oldConversation;
      const text = `${message.role}: ${message.content}`;
      return {
        id: `conversation:${index}:${message.id}`,
        source: this.id,
        priority,
        score: isRequest ? 1 : compact ? 0.7 : recent ? 0.5 : 0.1,
        tokens: estimateTokens(text),
        text: message.content,
        meta: {
          role: message.role,
          messageId: message.id,
          index: String(index),
          timestamp: String(message.timestamp),
          compact: compact ? "1" : "0",
        },
      };
    });

    if (snapshot.compactSummary && !snapshot.messages.some((message) => message.content.startsWith(SESSION_COMPACT_PREFIX))) {
      const text = snapshot.compactSummary;
      slices.unshift({
        id: "conversation:compact",
        source: this.id,
        priority: CONTEXT_PRIORITIES.recentMessages,
        score: 0.7,
        tokens: estimateTokens(text),
        text,
        meta: { role: "system", messageId: "compact", index: "-1", timestamp: "0", compact: "1" },
      });
    }

    return { slices };
  }
}

function lastIndex<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) return index;
  }
  return -1;
}
