import { useEffect } from "react";
import { applyAgentFileChange, shouldApplyAgentFileChange } from "../lib/agent/applyAgentFileChange";
import { agentRuntime } from "../lib/agent/AgentRuntime";
import { toolOutputOk } from "../lib/agent/AgentStep";
import { toolChangedPath } from "../lib/agent/tools/result";
import { useAgentStore } from "../stores/agentStore";
import { useReviewStore } from "../stores/reviewStore";
import { useVerificationStore } from "../stores/verificationStore";
import type { WorkflowStepStatus } from "../lib/agent/workflows/types";
import { parseQuestionOptions } from "../lib/agent/workflow/questionOptions";
import { applyPlanTodoProgress } from "../lib/agent/plans/applyPlanTodoProgress";
import { shouldIngestKnowledgeProposal } from "../lib/agent/conversation/chatEventWire";
import { activeToolLabel } from "../lib/agent/conversation";
import { knowledgeProposalStore } from "../lib/agent/knowledge/KnowledgeProposalStore";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import type { WorkStatus } from "../types/agent";

export function useAgentRuntime() {
  useEffect(() => agentRuntime.subscribe((event) => {
    const store = useAgentStore.getState();
    switch (event.type) {
      case "started":
        if (!store.isStreaming) {
          store.clearFallback();
          store.resetWork();
        }
        store.addMessage(event.userMessage);
        store.prepareAssistantMessage(event.messageId);
        store.setActiveModel(event.model);
        store.setError(null);
        store.setStreaming(true);
        store.setStatus(store.fallbackTo === event.model ? "fallback" : "thinking");
        store.syncActiveMessages();
        store.applyTimelineEvent(event);
        break;
      case "text-delta":
        store.appendDelta(event.messageId, event.text);
        store.setStatus("streaming");
        store.syncActiveMessages();
        store.applyTimelineEvent(event);
        break;
      case "fallback":
        store.setFallback(event.fromModel, event.toModel, event.reason);
        store.applyTimelineEvent(event);
        break;
      case "context-assembled":
        store.setStatus("thinking");
        break;
      case "compacted":
        store.applyTimelineEvent(event);
        break;
      case "run-resumed":
        store.setError(null);
        store.applyTimelineEvent(event);
        break;
      case "hook-denied":
        store.applyTimelineEvent(event);
        break;
      case "hook-warned":
        store.applyTimelineEvent(event);
        break;
      case "hook-fired":
        if (event.result !== "continue") {
          store.addHookTrace({
            event: event.event,
            hook: event.hook,
            result: event.result,
            message: event.message,
          });
        }
        store.applyTimelineEvent(event);
        break;
      case "workflow-started":
        store.setStreaming(true);
        store.setStatus("planning");
        store.setPendingWorkflowApproval(null);
        for (const stepId of event.stepIds) {
          store.upsertTask({
            id: `workflow:${stepId}`,
            title: workflowStepTitle(stepId),
            status: "pending",
            progress: 0,
          });
        }
        store.applyTimelineEvent(event);
        break;
      case "workflow-step": {
        const status = workflowTaskStatus(event.status);
        store.upsertTask({
          id: `workflow:${event.stepId}`,
          title: workflowStepTitle(event.stepId),
          status,
          progress: status === "completed" ? 100 : status === "running" ? 40 : 0,
        });
        store.applyTimelineEvent(event);
        break;
      }
      case "workflow-checkpoint":
        break;
      case "workflow-approval-required":
        store.setPendingWorkflowApproval({
          id: event.id,
          runId: event.runId,
          stepId: event.stepId,
          summary: event.summary,
        });
        store.setStatus("waiting_approval");
        store.applyTimelineEvent(event);
        break;
      case "workflow-completed":
        store.setPendingWorkflowApproval(null);
        if (event.status === "rejected") store.setStatus("cancelled");
        store.applyTimelineEvent(event);
        break;
      case "orchestration-started":
        store.setStreaming(true);
        store.setStatus("planning");
        store.setSpecialists(event.agentIds.map((id) => ({
          id,
          name: specialistName(id),
          status: "pending" as const,
        })));
        for (const id of event.agentIds) {
          store.upsertTask({
            id: `agent:${id}`,
            title: specialistName(id),
            status: "pending",
            progress: 0,
          });
        }
        store.applyTimelineEvent(event);
        break;
      case "agent-started": {
        const taskKey = `agent:${event.taskId ?? event.agentId}`;
        store.upsertSpecialist({
          id: event.taskId ?? event.agentId,
          name: event.name,
          status: "running",
        });
        store.upsertTask({
          id: taskKey,
          title: event.name,
          status: "running",
          progress: 0,
          activity: "Starting...",
        });
        store.setStatus("thinking");
        store.applyTimelineEvent(event);
        break;
      }
      case "agent-completed": {
        const taskKey = `agent:${event.taskId ?? event.agentId}`;
        store.upsertSpecialist({
          id: event.taskId ?? event.agentId,
          name: event.name,
          status: "completed",
          summary: event.report.summary,
        });
        store.upsertTask({
          id: taskKey,
          title: event.name,
          status: "completed",
          progress: 100,
        });
        store.applyTimelineEvent(event);
        break;
      }
      case "orchestration-completed":
        store.setStatus("thinking");
        store.applyTimelineEvent(event);
        break;
      case "permission-required":
        store.setPendingPermission({
          id: event.id,
          tool: event.tool,
          input: event.input,
          reason: event.reason,
          riskLevel: event.riskLevel,
          capability: event.capability,
          scope: event.scope,
          mode: event.mode,
        });
        store.addPermissionTrace({
          id: event.id,
          tool: event.tool,
          reason: event.reason,
          riskLevel: event.riskLevel,
          status: "pending",
        });
        store.setStatus("waiting_approval");
        store.applyTimelineEvent(event);
        break;
      case "step-started":
        store.upsertStep({ id: event.stepId, index: event.index, kind: event.kind, status: "running" });
        if (event.kind === "verify") store.setStatus("verifying");
        else if (event.kind === "model") store.setStatus("thinking");
        else store.setStatus("tool_call");
        break;
      case "step-finished":
        store.upsertStep({ id: event.stepId, index: event.index, kind: event.kind, status: "completed" });
        break;
      case "verification-started":
        store.setStatus("verifying");
        store.applyTimelineEvent(event);
        useVerificationStore.getState().applyEvent(event);
        break;
      case "verification-check-started":
      case "verification-check-completed":
        useVerificationStore.getState().applyEvent(event);
        break;
      case "verification-completed":
        store.setVerification({
          ok: event.ok,
          blockers: event.blockers,
          commands: event.commands,
          attempt: event.attempt,
          results: event.results,
          durationMs: event.durationMs,
          trigger: event.trigger,
        });
        store.applyTimelineEvent(event);
        useVerificationStore.getState().applyEvent(event);
        break;
      case "tool-started": {
        store.upsertTool({
          id: event.id,
          tool: event.tool,
          input: event.input,
          status: "running",
          startedAt: Date.now(),
          sourceTaskId: event.taskId,
        });
        if (event.taskId) {
          const taskKey = `agent:${event.taskId}`;
          const existing = store.tasks.find((item) => item.id === taskKey);
          if (existing) {
            store.upsertTask({
              ...existing,
              activity: activeToolLabel(event.tool, event.input),
            });
          }
        }
        store.setStatus("tool_call");
        store.applyTimelineEvent(event);
        break;
      }
      case "tool-completed": {
        const existing = store.toolCalls.find((item) => item.id === event.id);
        const success = toolOutputOk(event.output);
        const path = toolChangedPath(event.output);
        store.resolvePermissionTrace(event.id, success ? "allow-task" : "deny");
        store.dequeuePendingApproval(event.id);
        store.upsertTool({
          id: event.id,
          tool: event.tool,
          input: existing?.input ?? {},
          output: event.output,
          status: success ? "completed" : "failed",
          startedAt: existing?.startedAt,
          finishedAt: Date.now(),
        });
        store.setStatus("tool_result");
        if (event.tool === "run_command") {
          const command = readCommandOutput(existing?.input, event.output);
          store.addCommandLog({
            id: event.id,
            command: command.command,
            stdout: command.stdout,
            stderr: command.stderr,
            exitCode: command.exitCode,
            status: success ? "completed" : "failed",
          });
        }
        if (success && path && shouldApplyAgentFileChange(event.tool)) {
          store.addChangedFile(path);
          void applyAgentFileChange(path);
        }
        if (success && event.tool === "web_search") {
          const parsed = readWebSearchOutput(event.output);
          if (parsed) {
            store.setLastWebSearch({
              query: parsed.query,
              count: parsed.results.length,
              hits: parsed.results.map((hit) => ({ title: hit.title, url: hit.url })),
            });
            store.addWebDocuments(parsed.results.map((hit) => ({
              title: hit.title,
              url: hit.url,
              snippet: hit.snippet,
              content: "",
              retrievedAt: Date.now(),
            })));
          }
        }
        if (success && event.tool === "fetch_url") {
          const document = readWebFetchOutput(event.output);
          if (document) store.addWebDocuments([document]);
        }
        store.applyTimelineEvent(event);
        break;
      }
      case "completed":
        store.clearPendingApprovals();
        store.setActiveModel(event.model);
        store.setStatus("completed");
        store.setStreaming(false);
        store.syncActiveMessages();
        store.applyTimelineEvent(event);
        break;
      case "error":
        store.clearPendingApprovals();
        store.setError(event.message);
        store.setStatus("failed");
        store.setStreaming(false);
        for (const specialist of store.specialists) {
          if (specialist.status === "running" || specialist.status === "pending") {
            store.upsertSpecialist({ ...specialist, status: specialist.status === "running" ? "failed" : specialist.status });
          }
        }
        store.syncActiveMessages();
        store.applyTimelineEvent(event);
        break;
      case "cancelled":
        store.clearPendingApprovals();
        store.setStatus("cancelled");
        store.setStreaming(false);
        for (const specialist of store.specialists) {
          if (specialist.status === "running") {
            store.upsertSpecialist({ ...specialist, status: "failed" });
          }
        }
        store.syncActiveMessages();
        store.applyTimelineEvent(event);
        break;
      case "recovery-checkpoint":
        store.setRecoveryCheckpoint(event.checkpoint);
        store.applyTimelineEvent(event);
        break;
      case "recovery-available":
        store.setRecoveryAvailable(true);
        store.applyTimelineEvent(event);
        break;
      case "recovery-dismissed":
        store.setRecoveryAvailable(false);
        break;
      case "recovery-cleared":
        store.clearRecovery();
        break;
      case "recovery-rolled-back":
        store.clearRecovery();
        break;
      case "task-started":
      case "task-completed":
      case "skill-selected":
      case "skill-check":
      case "skill-loaded":
      case "design-gate":
      case "plan-written":
      case "plan-mode":
        if (event.type === "plan-mode") store.setPlanMode(event.enabled);
        store.applyTimelineEvent(event);
        break;
      case "plan-created":
        void import("../stores/planStore").then(({ usePlanStore }) => usePlanStore.getState().loadPlan(event.path));
        store.applyTimelineEvent(event);
        break;
      case "plan-todo-updated":
        applyPlanTodoProgress(event);
        store.applyTimelineEvent(event);
        break;
      case "plan-build-started":
        void import("../stores/planStore").then(({ usePlanStore }) => usePlanStore.getState().markBuilding(event.planId));
        store.applyTimelineEvent(event);
        break;
      case "plan-completed":
        void import("../stores/planStore").then(({ usePlanStore }) => usePlanStore.getState().markDone(event.planId));
        store.applyTimelineEvent(event);
        break;
      case "agent-mode":
        store.setAgentMode(event.mode);
        store.applyTimelineEvent(event);
        break;
      case "user-question":
        store.setPendingWorkflowApproval({
          id: event.id,
          runId: event.id,
          stepId: event.kind ?? "question",
          summary: event.prompt,
          options: event.choices?.length ? event.choices : parseQuestionOptions(event.options),
        });
        store.setStatus("waiting_approval");
        store.applyTimelineEvent(event);
        break;
      case "branch-created":
        store.setAgentWorkspace(event.branch);
        store.applyTimelineEvent(event);
        break;
      case "merge-conflicts":
        store.applyTimelineEvent(event);
        break;
      case "subagent-task-started":
      case "subagent-task-completed":
      case "sdd-task-started":
      case "sdd-task-completed":
      case "permission-classifier":
      case "compact_boundary":
      case "llm-started":
      case "finish-branch":
        if (event.type === "finish-branch") store.setAgentWorkspace(null);
        store.applyTimelineEvent(event);
        break;
      case "approval-resolved":
      case "review-completed":
        store.applyTimelineEvent(event);
        break;
      case "change-set-created":
      case "file-change-detected":
      case "change-hunk-created":
      case "review-started":
      case "change-hunk-accepted":
      case "change-hunk-rejected":
      case "file-change-accepted":
      case "file-change-rejected":
      case "change-set-accepted":
      case "change-set-rejected":
      case "review-conflict-detected":
      case "review-decision-undone":
        store.applyTimelineEvent(event);
        useReviewStore.getState().refresh();
        break;
      default: {
        store.applyTimelineEvent(event);
        const proposalId = shouldIngestKnowledgeProposal(event);
        if (proposalId) {
          void knowledgeProposalStore.get(proposalId).then((proposal) => {
            if (proposal) useKnowledgeStore.getState().ingest(proposal);
          });
        }
        break;
      }
    }
  }), []);

  useEffect(() => agentRuntime.getChangeTracking().subscribe((changeSet) => {
    useReviewStore.getState().ingest(changeSet);
  }), []);

  return agentRuntime;
}

function workflowStepTitle(stepId: string) {
  return stepId.charAt(0).toUpperCase() + stepId.slice(1);
}

function specialistName(id: string) {
  if (id === "explore" || id === "research") return "Explore";
  if (id === "implement" || id === "coding" || id === "testing") return "Implement";
  if (id === "review") return "Review";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function workflowTaskStatus(status: WorkflowStepStatus): WorkStatus {
  if (status === "running") return "running";
  if (status === "failed" || status === "blocked") return "failed";
  if (status === "completed" || status === "skipped") return "completed";
  return "pending";
}

function readWebSearchOutput(output: unknown): {
  query: string;
  results: { title: string; url: string; snippet: string }[];
} | null {
  const data = readToolData(output);
  if (!data) return null;
  const query = typeof data.query === "string" ? data.query : "";
  if (!Array.isArray(data.results)) return null;
  const results = data.results.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { title?: unknown; url?: unknown; snippet?: unknown };
    if (typeof record.title !== "string" || typeof record.url !== "string") return [];
    return [{
      title: record.title,
      url: record.url,
      snippet: typeof record.snippet === "string" ? record.snippet : "",
    }];
  });
  return { query, results };
}

function readWebFetchOutput(output: unknown) {
  const data = readToolData(output);
  if (!data) return null;
  const url = typeof data.url === "string" ? data.url : "";
  if (!url) return null;
  const body = typeof data.body === "string" ? data.body : "";
  const title = typeof data.title === "string" && data.title ? data.title : url;
  return {
    title,
    url,
    snippet: body.slice(0, 200),
    content: body,
    retrievedAt: Date.now(),
  };
}

function readToolData(output: unknown): Record<string, unknown> | null {
  if (!output || typeof output !== "object") return null;
  const record = output as { data?: unknown };
  if (record.data && typeof record.data === "object") return record.data as Record<string, unknown>;
  return record as Record<string, unknown>;
}

function readCommandOutput(input: unknown, output: unknown) {
  const data = readToolData(output);
  const inputRecord = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const command = typeof data?.command === "string"
    ? data.command
    : typeof inputRecord.command === "string" ? inputRecord.command : "command";
  return {
    command,
    stdout: typeof data?.stdout === "string" ? data.stdout : "",
    stderr: typeof data?.stderr === "string" ? data.stderr : "",
    exitCode: typeof data?.exitCode === "number" ? data.exitCode : null,
  };
}
