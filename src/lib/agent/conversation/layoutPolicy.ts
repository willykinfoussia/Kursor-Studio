import type { AgentStatus, WorkStatus } from "../types";
import type { AgentChatPrefs, ConversationItem } from "./types";
import { DEFAULT_AGENT_CHAT_PREFS } from "./types";

export interface PresentationState {
  expanded: boolean;
  sticky: boolean;
  showDetails: boolean;
  focused: boolean;
}

export interface LayoutContext {
  prefs: AgentChatPrefs;
  status: AgentStatus;
  pendingApprovalId?: string | null;
  userExpanded: Record<string, boolean>;
  taskRunning: boolean;
  taskElapsedMs: number;
  itemsAfterPlan: number;
  stickyDismissed: boolean;
  latestActiveId?: string;
  toolStatus?: WorkStatus;
  toolFailed?: boolean;
}

export const LONG_TASK_MS = 15_000;
export const LONG_TASK_ITEMS = 8;

export function defaultChatPrefs(partial?: Partial<AgentChatPrefs>): AgentChatPrefs {
  const next: AgentChatPrefs = { ...DEFAULT_AGENT_CHAT_PREFS };
  if (!partial) return next;
  for (const key of Object.keys(next) as (keyof AgentChatPrefs)[]) {
    if (typeof partial[key] === "boolean") next[key] = partial[key];
  }
  return next;
}

function override(id: string, auto: boolean, userExpanded: Record<string, boolean>) {
  if (Object.prototype.hasOwnProperty.call(userExpanded, id)) return userExpanded[id] === true;
  return auto;
}

export function shouldStickCurrentTask(ctx: Pick<LayoutContext, "prefs" | "taskRunning" | "taskElapsedMs" | "itemsAfterPlan" | "stickyDismissed">) {
  if (!ctx.prefs.stickyCurrentTask || !ctx.taskRunning || ctx.stickyDismissed) return false;
  return ctx.taskElapsedMs >= LONG_TASK_MS || ctx.itemsAfterPlan >= LONG_TASK_ITEMS;
}

export function getBlockPresentationState(
  item: ConversationItem,
  ctx: LayoutContext,
): PresentationState {
  const focused = item.type === "approval" && ctx.pendingApprovalId === item.approvalId;
  switch (item.type) {
    case "tool": {
      const running = ctx.toolStatus === "running";
      const failed = ctx.toolFailed || ctx.toolStatus === "failed";
      const auto = running || failed || !ctx.prefs.autoCollapseCompletedTools || ctx.prefs.showToolDetails;
      const expanded = override(item.id, auto, ctx.userExpanded);
      return {
        expanded,
        sticky: false,
        showDetails: expanded && (!ctx.prefs.compactTools || running || failed || ctx.prefs.showToolDetails),
        focused: false,
      };
    }
    case "plan": {
      const auto = item.status === "running";
      const expanded = override(item.id, auto, ctx.userExpanded);
      return { expanded, sticky: false, showDetails: expanded, focused: false };
    }
    case "task": {
      const sticky = item.status === "running" && shouldStickCurrentTask(ctx);
      const expanded = override(item.id, false, ctx.userExpanded);
      return { expanded, sticky, showDetails: expanded, focused: false };
    }
    case "approval": {
      const pending = Boolean(focused);
      const expanded = override(item.id, pending, ctx.userExpanded);
      return { expanded, sticky: false, showDetails: expanded, focused: pending };
    }
    case "verification": {
      const auto = item.status === "running" || item.ok === false;
      const expanded = override(item.id, auto, ctx.userExpanded);
      return { expanded, sticky: false, showDetails: expanded, focused: false };
    }
    case "changes":
    case "completion":
    case "review-summary":
    case "knowledge-proposal": {
      const expanded = override(item.id, false, ctx.userExpanded);
      return { expanded, sticky: false, showDetails: expanded, focused: false };
    }
    case "plan-card":
      return { expanded: true, sticky: false, showDetails: true, focused: false };
    case "user-question":
      return { expanded: true, sticky: false, showDetails: true, focused: !item.selected };
    default:
      return { expanded: true, sticky: false, showDetails: true, focused: false };
  }
}

export function isAgentWorking(status: AgentStatus) {
  return status !== "idle" && status !== "completed" && status !== "failed" && status !== "error" && status !== "cancelled";
}
