import type { AgentEvent, AgentMessage, WorkStatus } from "../types";
import { modeNoticeText } from "../modes";
import { isBuildPlanPrompt } from "../plans/isBuildPlanPrompt";
import { chatEventSurface } from "./chatPolicy";
import type { ConversationItem, PlanStepView, TimelineContext } from "./types";
import { activeToolLabel } from "./toolGrouping";

export const DESIGN_APPROVED_NOTICE = "Design approved. Next: write the implementation plan.";

const VISIBLE_KNOWLEDGE_SKIP = new Set(["failed", "no-llm", "no-project"]);

export function knowledgeSkipNotice(reason: string, error?: string): string | null {
  if (!VISIBLE_KNOWLEDGE_SKIP.has(reason)) return null;
  if (reason === "no-llm") return "Knowledge reflect skipped: no LLM available.";
  if (reason === "no-project") return "Knowledge reflect skipped: no project.";
  const detail = error?.trim();
  return detail ? `Knowledge reflect failed: ${detail}` : "Knowledge reflect failed.";
}

function lastItem(items: ConversationItem[]) {
  return items[items.length - 1];
}

function findLastIndex(items: ConversationItem[], predicate: (item: ConversationItem) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && predicate(item)) return index;
  }
  return -1;
}

function replaceById(items: ConversationItem[], id: string, patch: (item: ConversationItem) => ConversationItem) {
  return items.map((item) => item.id === id ? patch(item) : item);
}

function hasId(items: ConversationItem[], id: string) {
  return items.some((item) => item.id === id);
}

function workflowTitle(stepId: string) {
  return stepId.charAt(0).toUpperCase() + stepId.slice(1);
}

function specialistName(id: string) {
  if (id === "explore" || id === "research") return "Explore";
  if (id === "implement" || id === "coding") return "Implement";
  if (id === "testing") return "Implement";
  if (id === "review") return "Review";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function workflowStatus(status: string): WorkStatus {
  if (status === "running") return "running";
  if (status === "failed" || status === "blocked") return "failed";
  if (status === "completed" || status === "skipped") return "completed";
  return "pending";
}

const HIDDEN_SYSTEM_KINDS = new Set(["checkpoint", "compacted", "resume", "specialist", "hook"]);

export function sanitizeTimeline(items: ConversationItem[]): ConversationItem[] {
  return items.filter((item) => {
    if (item.type === "approval" || item.type === "fallback") return false;
    if (item.type === "assistant" && !item.content.trim()) return false;
    if (item.type === "system" && HIDDEN_SYSTEM_KINDS.has(item.kind)) return false;
    return true;
  });
}

export function changePathsFromContext(ctx: TimelineContext) {
  if (ctx.changeLog) {
    return [
      ...ctx.changeLog.created.map((path) => ({ flag: "A" as const, path })),
      ...ctx.changeLog.modified.map((path) => ({ flag: "M" as const, path })),
      ...ctx.changeLog.deleted.map((path) => ({ flag: "D" as const, path })),
    ];
  }
  return (ctx.filesChanged ?? []).map((path) => ({ flag: "M" as const, path }));
}

function completionFromContext(ctx: TimelineContext) {
  const paths = changePathsFromContext(ctx);
  const parts: string[] = [];
  if (paths.length > 0) parts.push(`${paths.length} file${paths.length === 1 ? "" : "s"} changed`);
  const passed = ctx.commandLog?.find((entry) => /test/i.test(entry.command) && entry.status === "completed");
  if (passed) parts.push(passed.exitCode === 0 ? "Tests passed" : "Tests failed");
  if (ctx.verification) parts.push(ctx.verification.ok ? "Build successful" : "Verification failed");
  return {
    summary: parts.join(". ") || "Task completed.",
    filesChanged: paths.length,
    verificationOk: ctx.verification?.ok,
    testsHint: passed ? (passed.exitCode === 0 ? "Tests passed" : "Tests failed") : undefined,
  };
}

function markPlansCompleted(items: ConversationItem[]): ConversationItem[] {
  return items.map((item) => (
    item.type === "plan" && item.status === "running"
      ? { ...item, status: "completed" as const, steps: item.steps.map((step) => step.status === "running" ? { ...step, status: "completed" as const } : step) }
      : item.type === "task" && item.status === "running"
        ? { ...item, status: "completed" as const, progress: 100 }
        : item
  ));
}

export function timelineFromMessages(messages: AgentMessage[]): ConversationItem[] {
  const items: ConversationItem[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      if (isBuildPlanPrompt(message.content)) continue;
      items.push({ type: "user", id: `user:${message.id}`, messageId: message.id });
    } else if (message.role === "assistant") {
      items.push({
        type: "assistant",
        id: `assistant:${message.id}:0`,
        messageId: message.id,
        content: message.content,
      });
    }
  }
  return items;
}

export function applyAgentEvent(
  items: ConversationItem[],
  event: AgentEvent,
  ctx: TimelineContext = {},
): ConversationItem[] {
  const current = sanitizeTimeline(items);
  if (event.type === "approval-resolved") {
    if (!event.selected) return current;
    return current.map((item) => (
      item.type === "user-question" && item.questionId === event.id
        ? { ...item, selected: event.selected }
        : item
    ));
  }
  const surface = chatEventSurface(event.type);
  if (surface === "hidden" || surface === "dock") return current;
  if (surface === "strip-approval") return current;

  switch (event.type) {
    case "started": {
      if (isBuildPlanPrompt(event.userMessage.content)) return current;
      const id = `user:${event.userMessage.id}`;
      if (hasId(current, id)) return current;
      return [...current, { type: "user", id, messageId: event.userMessage.id }];
    }
    case "text-delta": {
      const last = lastItem(current);
      if (last?.type === "assistant" && last.messageId === event.messageId) {
        return [...current.slice(0, -1), { ...last, content: last.content + event.text }];
      }
      if (!event.text.trim()) return current;
      const segments = current.filter((item) => item.type === "assistant" && item.messageId === event.messageId).length;
      return [...current, {
        type: "assistant",
        id: `assistant:${event.messageId}:${segments}`,
        messageId: event.messageId,
        content: event.text,
      }];
    }
    case "tool-started": {
      if (event.tool === "agent") return current;
      if (event.taskId) {
        const label = activeToolLabel(event.tool, event.input);
        return current.map((item) => {
          if (item.type !== "task" || item.taskId !== event.taskId) return item;
          const toolCallIds = item.toolCallIds?.includes(event.id)
            ? item.toolCallIds
            : [...(item.toolCallIds ?? []), event.id];
          return { ...item, activity: label, toolCallIds };
        });
      }
      const id = `tool:${event.id}`;
      if (hasId(current, id)) return current;
      return [...current, { type: "tool", id, toolCallId: event.id }];
    }
    case "tool-completed":
      return current;
    case "workflow-started": {
      const id = `plan:${event.runId}`;
      const steps: PlanStepView[] = event.stepIds.map((stepId) => ({
        id: `workflow:${stepId}`,
        title: workflowTitle(stepId),
        status: "pending",
      }));
      if (hasId(current, id)) {
        return replaceById(current, id, (item) => item.type === "plan" ? { ...item, steps, status: "running" } : item);
      }
      return [...current, { type: "plan", id, steps, status: "running" }];
    }
    case "workflow-step": {
      const status = workflowStatus(event.status);
      const taskId = `workflow:${event.stepId}`;
      return current.map((item) => {
        if (item.type !== "plan") return item;
        const steps = item.steps.map((step) => step.id === taskId ? { ...step, status } : step);
        return {
          ...item,
          steps,
          status: steps.every((step) => step.status === "completed") ? "completed" as const : item.status,
        };
      });
    }
    case "workflow-completed": {
      return current.map((item) => (
        item.type === "plan" && item.id === `plan:${event.runId}`
          ? {
              ...item,
              status: "completed" as const,
              steps: item.steps.map((step) => step.status === "pending" || step.status === "running"
                ? { ...step, status: event.status === "rejected" ? "failed" as const : "completed" as const }
                : step),
            }
          : item
      ));
    }
    case "orchestration-started": {
      const id = `plan:${event.runId}`;
      const steps: PlanStepView[] = event.agentIds.map((agentId) => ({
        id: `agent:${agentId}`,
        title: specialistName(agentId),
        status: "pending",
      }));
      if (hasId(current, id)) {
        return replaceById(current, id, (item) => item.type === "plan" ? { ...item, steps, status: "running" } : item);
      }
      return [...current, { type: "plan", id, steps, status: "running" }];
    }
    case "agent-started": {
      const taskId = `agent:${event.taskId ?? event.agentId}`;
      return current.map((item) => {
        if (item.type !== "plan") return item;
        return {
          ...item,
          steps: item.steps.map((step) => step.id === taskId || step.id === `agent:${event.agentId}` ? { ...step, status: "running" as const } : step),
        };
      });
    }
    case "agent-completed": {
      const taskId = `agent:${event.taskId ?? event.agentId}`;
      return current.map((item) => {
        if (item.type === "plan") {
          return {
            ...item,
            steps: item.steps.map((step) => (
              step.id === taskId || step.id === `agent:${event.agentId}`
                ? { ...step, status: "completed" as const }
                : step
            )),
          };
        }
        if (item.type === "task" && (item.taskId === event.taskId || item.taskId === taskId)) {
          return { ...item, status: "completed" as const, progress: 100 };
        }
        return item;
      });
    }
    case "orchestration-completed":
      return current.map((item) => (
        item.type === "plan" && item.id === `plan:${event.runId}`
          ? { ...item, status: "completed" as const }
          : item
      ));
    case "verification-started": {
      const id = `verification:${event.requestId}:${current.filter((item) => item.type === "verification").length}`;
      return [...current, {
        type: "verification",
        id,
        status: "running",
        blockers: [],
        commands: [],
        attempt: 0,
      }];
    }
    case "verification-completed": {
      const index = findLastIndex(current, (item) => item.type === "verification" && item.status === "running");
      const payload = {
        status: "completed" as const,
        ok: event.ok,
        blockers: event.blockers,
        commands: event.commands,
        attempt: event.attempt,
        results: event.results,
      };
      if (index >= 0 && current[index]) {
        return replaceById(current, current[index].id, (item) => item.type === "verification" ? { ...item, ...payload } : item);
      }
      return [...current, { type: "verification", id: `verification:${event.requestId}:done`, ...payload }];
    }
    case "completed": {
      const completion = completionFromContext(ctx);
      return markPlansCompleted([...current, {
        type: "completion",
        id: `completion:${event.requestId}`,
        ...completion,
      }]);
    }
    case "error":
      return [...current, { type: "system", id: `error:${event.requestId}`, kind: "error", text: event.message }];
    case "cancelled":
      return markPlansCompleted([...current, {
        type: "system",
        id: `cancelled:${event.requestId}`,
        kind: "error",
        text: "Generation stopped",
      }]);
    case "hook-denied":
      return [...current, {
        type: "system",
        id: `hook-denied:${event.event}:${current.length}`,
        kind: "mode",
        text: event.message,
      }];
    case "design-gate":
      return [...current, {
        type: "system",
        id: `design-gate:${current.length}`,
        kind: event.reason === "approved" ? "mode" : "error",
        text: event.reason === "approved" ? DESIGN_APPROVED_NOTICE : event.reason,
      }];
    case "agent-mode":
      return [...current, {
        type: "system",
        id: `agent-mode:${event.mode}:${current.length}`,
        kind: "mode",
        text: modeNoticeText(event.mode),
      }];
    case "subagent-task-started":
    case "sdd-task-started":
      return [...current, {
        type: "task",
        id: `subagent:${event.taskId}`,
        taskId: event.taskId,
        title: event.title,
        status: "running",
        progress: 0,
        activity: "Starting...",
        agentId: event.agentId,
        toolCallIds: [],
      }];
    case "subagent-task-completed":
    case "sdd-task-completed":
      return current.map((item) => (
        item.type === "task" && item.taskId === event.taskId
          ? { ...item, status: "completed" as const, progress: 100 }
          : item
      ));
    case "recovery-available":
      return [...current, {
        type: "system",
        id: `recovery:${event.checkpointId}`,
        kind: "recovery",
        text: "Recovery available",
      }];
    case "review-completed":
      return [...current, {
        type: "review-summary",
        id: `review:${event.changeSetId}`,
        changeSetId: event.changeSetId,
        accepted: event.accepted,
        rejected: event.rejected,
        partial: event.partial,
        conflicted: event.conflicted,
      }];
    case "knowledge-reflect-skipped": {
      const text = knowledgeSkipNotice(event.reason, event.error);
      if (!text) return current;
      return [...current, {
        type: "system",
        id: `knowledge-skip:${event.runId}:${event.reason}`,
        kind: "knowledge",
        text,
      }];
    }
    case "knowledge-reflect-completed":
      if (!event.proposalId) return current;
      return [...current, {
        type: "knowledge-proposal",
        id: `knowledge:${event.proposalId}`,
        proposalId: event.proposalId,
        summary: event.summary || (event.skillCount === 0 && event.specCount === 0
          ? "Aucun skill ni spec créé"
          : "Created or updated skills and specs."),
      }];
    case "plan-created": {
      const id = `plan-card:${event.planId}`;
      if (hasId(current, id)) return current;
      return [...current, { type: "plan-card", id, planId: event.planId }];
    }
    case "user-question": {
      const id = `question:${event.id}`;
      if (hasId(current, id)) return current;
      const options = event.choices?.length
        ? event.choices
        : event.options.map((label) => ({ id: label, label }));
      return [...current, {
        type: "user-question",
        id,
        questionId: event.id,
        prompt: event.prompt,
        options,
        kind: event.kind,
      }];
    }
    case "merge-conflicts": {
      const files = event.files.length ? event.files.join(", ") : "unmerged files";
      return [...current, {
        type: "system",
        id: `merge-conflicts:${event.branch}:${current.length}`,
        kind: "error",
        text: `Merge conflicts in ${files}. Edit the markers, then call finish_development_branch again.`,
      }];
    }
    default:
      return current;
  }
}

export const projectChatEvent = applyAgentEvent;
