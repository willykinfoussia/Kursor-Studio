import { useEffect, useMemo } from "react";
import {
  getBlockPresentationState,
  groupTimelineItems,
  sanitizeTimeline,
  type AgentChatPrefs,
  type ConversationItem as Item,
} from "../../../lib/agent/conversation";
import type { AgentStatus, ToolCall } from "../../../types/agent";
import { ConversationItem } from "./ConversationItem";
import { EmptyState } from "./EmptyState";
import { ToolGroup } from "../blocks/ToolGroup";
import { ThoughtSummary } from "./ThoughtSummary";

export function ConversationTimeline({
  items,
  messages,
  tools,
  prefs,
  status,
  streamingMessageId,
  recoveryAvailable,
  userExpanded,
  stickyDismissed,
  taskRunning,
  taskElapsedMs,
  latestActiveId,
  thinking,
  thoughtMs,
  onToggle,
  onSuggest,
  onStopProcess,
  onRetry,
  onContinue,
  onRollback,
  highlightedItemId,
  onAnswerQuestion,
}: {
  items: Item[];
  messages: { id: string; content: string }[];
  tools: ToolCall[];
  prefs: AgentChatPrefs;
  status: AgentStatus;
  streamingMessageId?: string | null;
  recoveryAvailable: boolean;
  userExpanded: Record<string, boolean>;
  stickyDismissed: boolean;
  taskRunning: boolean;
  taskElapsedMs: number;
  latestActiveId?: string;
  thinking?: boolean;
  thoughtMs?: number | null;
  onToggle: (id: string, currentlyExpanded: boolean) => void;
  onSuggest: (text: string) => void;
  onStopProcess: () => void;
  onRetry: () => void;
  onContinue: () => void;
  onRollback: () => void;
  highlightedItemId?: string | null;
  onAnswerQuestion?: (questionId: string, selected: string) => void;
}) {
  const toolMap = useMemo(() => new Map(tools.map((tool) => [tool.id, tool])), [tools]);
  const lookup = useMemo(
    () => new Map(tools.map((tool) => [tool.id, {
      tool: tool.tool,
      status: tool.status,
      input: tool.input,
      output: tool.output,
    }])),
    [tools],
  );
  const visibleItems = useMemo(() => sanitizeTimeline(items), [items]);
  const views = useMemo(() => groupTimelineItems(visibleItems, lookup), [visibleItems, lookup]);
  const planIndex = visibleItems.findIndex((item) => item.type === "plan");
  const itemsAfterPlan = planIndex >= 0 ? visibleItems.length - planIndex : visibleItems.length;
  const messageMap = useMemo(() => new Map(messages.map((message) => [message.id, message.content])), [messages]);

  useEffect(() => {
    if (!highlightedItemId || highlightedItemId.startsWith("approval:")) return;
    const exact = document.querySelector(`[data-timeline-id="${CSS.escape(highlightedItemId)}"]`);
    const el = exact instanceof HTMLElement
      ? exact
      : [...document.querySelectorAll("[data-timeline-id]")].find((node) => (
        itemMatchesHighlight(node.getAttribute("data-timeline-id"), highlightedItemId)
      ));
    if (el instanceof HTMLElement) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightedItemId]);

  if (visibleItems.length === 0) {
    return <EmptyState onSuggest={onSuggest} />;
  }

  return (
    <div className="conversation-timeline">
      {views.map((view) => {
        if (view.kind === "tool-group") {
          const running = view.items.some((item) => toolMap.get(item.toolCallId)?.status === "running");
          const expanded = userExpanded[view.id] ?? running;
          return (
            <div
              key={view.id}
              data-timeline-id={view.items.find((item) => item.id === highlightedItemId)?.id ?? view.items[0]?.id}
              className={view.items.some((item) => itemMatchesHighlight(item.id, highlightedItemId)) ? "timeline-highlight" : undefined}
            >
              <ToolGroup
                items={view.items}
                tools={toolMap}
                presentation={{ expanded, sticky: false, showDetails: expanded, focused: false }}
                onToggle={() => onToggle(view.id, expanded)}
              />
            </div>
          );
        }
        const item = view.item;
        const tool = item.type === "tool" ? toolMap.get(item.toolCallId) : undefined;
        const childTools = item.type === "task"
          ? (item.toolCallIds ?? []).map((id) => toolMap.get(id)).filter((call): call is ToolCall => Boolean(call))
          : undefined;
        const presentation = getBlockPresentationState(item, {
          prefs,
          status,
          userExpanded,
          taskRunning,
          taskElapsedMs,
          itemsAfterPlan,
          stickyDismissed,
          latestActiveId,
          toolStatus: tool?.status,
          toolFailed: tool?.status === "failed",
        });
        return (
          <div
            key={item.id}
            data-timeline-id={item.id}
            className={itemMatchesHighlight(item.id, highlightedItemId) ? "timeline-highlight" : undefined}
          >
            <ConversationItem
              item={item}
              presentation={presentation}
              messageContent={item.type === "user" ? messageMap.get(item.messageId) : undefined}
              streaming={item.type === "assistant" && item.messageId === streamingMessageId}
              tool={tool}
              childTools={childTools}
              recoveryAvailable={recoveryAvailable}
              onToggle={() => onToggle(item.id, presentation.expanded)}
              onStopProcess={onStopProcess}
              onRetry={onRetry}
              onContinue={onContinue}
              onRollback={onRollback}
              onAnswerQuestion={onAnswerQuestion}
            />
          </div>
        );
      })}
      <ThoughtSummary thinking={Boolean(thinking)} durationMs={thoughtMs ?? null} />
    </div>
  );
}

function itemMatchesHighlight(itemId: string | null | undefined, highlighted?: string | null) {
  if (!itemId || !highlighted) return false;
  if (itemId === highlighted) return true;
  return itemId.startsWith(`${highlighted}:`) || highlighted.startsWith(`${itemId}:`);
}
