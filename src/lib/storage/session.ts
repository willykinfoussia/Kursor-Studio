import { isTauri } from "../tauri/invoke";
import { conversationRepository } from "./conversationRepository";
import { messageRepository } from "./messageRepository";
import { agentRunRepository } from "./agentRunRepository";
import { toolCallRepository } from "./toolCallRepository";
import { usageRepository } from "./usageRepository";
import { stepRepository } from "./stepRepository";
import { eventTraceRepository } from "./eventTraceRepository";
import { useAgentStore, conversationTitle } from "../../stores/agentStore";
import { timelineFromMessages } from "../agent/conversation";
import { useProjectStore } from "../../stores/projectStore";
import { useAccountStore } from "../../stores/accountStore";
import type { AgentConversation, AgentEvent, AgentMessage } from "../agent/types";
import type { AgentRuntime } from "../agent/AgentRuntime";
import { sessionManager } from "../agent/session";
import { taskManager } from "../agent/tasks";
import { usageMetrics } from "../agent/metrics";

const FLUSH_MS = 2_000;
const PAGE_SIZE = 100;

function now() {
  return Date.now();
}

function projectId() {
  return useProjectStore.getState().currentProject?.id ?? null;
}

async function persistConversationMeta(conversation: AgentConversation) {
  if (!isTauri()) return;
  await conversationRepository.upsert({
    id: conversation.id,
    projectId: projectId(),
    title: conversation.title || conversationTitle(conversation.messages),
    createdAt: conversation.updatedAt || now(),
    updatedAt: now(),
    archived: 0,
  });
}

async function persistMessage(conversationId: string, message: AgentMessage, model?: string | null) {
  if (!isTauri()) return;
  await messageRepository.upsert({
    id: message.id,
    conversationId,
    role: message.role,
    content: message.content,
    model: model ?? null,
    createdAt: message.timestamp,
  });
}

export async function hydrateConversations() {
  if (!isTauri()) {
    useAgentStore.getState().reset();
    return;
  }
  const currentProjectId = projectId();
  if (!currentProjectId) {
    useAgentStore.getState().reset();
    return;
  }
  const records = await conversationRepository.list(currentProjectId);
  if (records.length === 0) {
    useAgentStore.getState().reset();
    return;
  }
  const conversations: AgentConversation[] = [];
  for (const record of records) {
    const messages = await messageRepository.list(record.id, PAGE_SIZE);
    conversations.push({
      id: record.id,
      projectId: record.projectId,
      title: record.title,
      updatedAt: record.updatedAt,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role as AgentMessage["role"],
        content: message.content,
        timestamp: message.createdAt,
      })),
    });
  }
  const active = conversations[0];
  if (!active) {
    useAgentStore.getState().reset();
    return;
  }
  useAgentStore.setState({
    conversations,
    activeConversationId: active.id,
    messages: active.messages.map((message) => ({ ...message })),
    timeline: timelineFromMessages(active.messages),
  });
}

export async function hydrateTasks() {
  const project = projectId();
  if (!project) {
    useAgentStore.getState().setPersistedTasks([]);
    return;
  }
  const records = await taskManager.list(project);
  useAgentStore.getState().setPersistedTasks(records.map((record) => ({
    id: record.id,
    title: record.title,
    status: record.status === "completed"
      ? "completed"
      : record.status === "failed"
        ? "failed"
        : record.status === "running"
          ? "running"
          : "pending",
    progress: record.progress,
  })));
}

export async function persistNewConversation(conversation: AgentConversation) {
  await persistConversationMeta(conversation);
}

export async function persistActiveConversation() {
  const store = useAgentStore.getState();
  const conversation = store.conversations.find((item) => item.id === store.activeConversationId);
  if (!conversation) return;
  await persistConversationMeta({ ...conversation, messages: store.messages });
}

export async function persistConversationSwitch(id: string, runtime: AgentRuntime) {
  runtime.stashActiveWorkflow();
  const messages = await messageRepository.list(id, PAGE_SIZE);
  const mapped: AgentMessage[] = messages.map((message) => ({
    id: message.id,
    role: message.role as AgentMessage["role"],
    content: message.content,
    timestamp: message.createdAt,
  }));
  useAgentStore.getState().switchConversation(id);
  const existing = useAgentStore.getState().timeline;
  useAgentStore.setState({
    messages: mapped,
    activeConversationId: id,
    timeline: existing.length > 0 ? existing : timelineFromMessages(mapped),
  });
  const projectIdValue = projectId();
  const accountId = useAccountStore.getState().currentAccount?.id ?? "local-account";
  if (projectIdValue) runtime.setContext({ accountId, projectId: projectIdValue, conversationId: id });
  const target = useAgentStore.getState().conversations.find((item) => item.id === id);
  runtime.adoptConversationWorkflow(target?.workflowSession ?? null);
  runtime.loadMessages(mapped);
}

export async function persistConversationDelete(id: string) {
  await conversationRepository.archive(id);
}

export function attachConversationPersistence(runtime: AgentRuntime) {
  let runId: string | null = null;
  let lastFlush = 0;
  let userPersisted = false;

  runtime.setTraceSink({
    append(record) {
      if (!isTauri()) return;
      void eventTraceRepository.append({
        id: record.id,
        runId: record.runId,
        sessionId: record.sessionId,
        taskId: record.taskId,
        seq: record.seq,
        eventType: record.event.type,
        payloadJson: JSON.stringify(record),
        createdAt: record.ts,
      }).catch(() => undefined);
    },
  });

  runtime.subscribe((event: AgentEvent) => {
    void handle(event);
  });

  async function persistUsage(agentRunId: string, model: string, status: string) {
    const snapshot = usageMetrics.snapshot().find((item) => item.model === model);
    await usageRepository.insert({
      id: crypto.randomUUID(),
      agentRunId,
      model,
      inputTokens: snapshot?.inputTokens ?? null,
      outputTokens: snapshot?.outputTokens ?? null,
      latencyMs: snapshot?.avgLatencyMs ? Math.round(snapshot.avgLatencyMs) : null,
      status,
      createdAt: now(),
    });
  }

  async function handle(event: AgentEvent) {
    if (!isTauri()) return;
    const store = useAgentStore.getState();
    const conversationId = store.activeConversationId;
    const conversation = store.conversations.find((item) => item.id === conversationId);
    const taskId = runtime.getTaskId();

    if (event.type === "task-started") {
      runId = runtime.getRunId();
      if (runId) {
        await agentRunRepository.upsert({
          id: runId,
          accountId: useAccountStore.getState().currentAccount?.id ?? null,
          conversationId,
          projectId: projectId(),
          agentId: "coding-agent",
          status: "running",
          startedAt: now(),
          sessionId: sessionManager.getActive()?.id ?? null,
          taskId: event.taskId,
        });
      }
    } else if (event.type === "started") {
      if (!userPersisted) {
        if (conversation) await persistConversationMeta({ ...conversation, messages: [event.userMessage] });
        await persistMessage(conversationId, event.userMessage);
        userPersisted = true;
      }
      runId = event.requestId;
      await agentRunRepository.upsert({
        id: event.requestId,
        accountId: useAccountStore.getState().currentAccount?.id ?? null,
        conversationId,
        projectId: projectId(),
        agentId: "coding-agent",
        status: "running",
        model: event.model,
        startedAt: now(),
        sessionId: sessionManager.getActive()?.id ?? null,
        taskId,
      });
      await persistUsage(event.requestId, event.model, "running");
    } else if (event.type === "orchestration-started") {
      runId = event.runId;
      await agentRunRepository.upsert({
        id: event.runId,
        conversationId,
        projectId: projectId(),
        agentId: "coding-agent",
        status: "running",
        model: store.activeModel,
        startedAt: now(),
        sessionId: sessionManager.getActive()?.id ?? null,
        taskId,
      });
    } else if (event.type === "text-delta") {
      const at = Date.now();
      if (at - lastFlush < FLUSH_MS) return;
      lastFlush = at;
      const assistant = store.messages.find((message) => message.id === event.messageId);
      if (assistant) await persistMessage(conversationId, assistant, store.activeModel);
    } else if (event.type === "tool-started" && runId) {
      await toolCallRepository.upsert({
        id: event.id,
        agentRunId: runId,
        toolName: event.tool,
        inputJson: JSON.stringify(event.input ?? {}),
        status: "running",
        startedAt: now(),
      });
    } else if (event.type === "tool-completed" && runId) {
      const failed = event.output && typeof event.output === "object" && (event.output as { ok?: unknown }).ok === false;
      await toolCallRepository.upsert({
        id: event.id,
        agentRunId: runId,
        toolName: event.tool,
        outputJson: JSON.stringify(event.output ?? {}),
        status: failed ? "failed" : "completed",
        finishedAt: now(),
        error: failed ? JSON.stringify(event.output) : null,
      });
    } else if (event.type === "step-started" && runId) {
      await stepRepository.upsert({
        id: event.stepId,
        agentRunId: runId,
        index: event.index,
        kind: event.kind,
        status: "running",
        startedAt: now(),
      });
    } else if (event.type === "step-finished" && runId) {
      await stepRepository.upsert({
        id: event.stepId,
        agentRunId: runId,
        index: event.index,
        kind: event.kind,
        status: "completed",
        startedAt: now(),
        finishedAt: now(),
      });
    } else if (event.type === "workflow-started" && runId) {
      for (const [index, stepId] of event.stepIds.entries()) {
        await taskManager.upsertStep({
          id: `workflow:${stepId}`,
          title: stepId,
          status: "pending",
          progress: 0,
          projectId: projectId(),
          agentRunId: runId,
        });
        void index;
      }
    } else if (event.type === "workflow-step" && runId) {
      const progress = event.status === "completed" ? 100 : event.status === "running" ? 40 : 0;
      await taskManager.upsertStep({
        id: `workflow:${event.stepId}`,
        title: event.stepId,
        status: event.status === "failed" || event.status === "blocked" ? "failed" : event.status === "running" ? "running" : event.status === "pending" ? "pending" : "completed",
        progress,
        projectId: projectId(),
        agentRunId: runId,
      });
    } else if (event.type === "fallback" && runId) {
      await usageRepository.insert({
        id: crypto.randomUUID(),
        agentRunId: runId,
        model: event.toModel,
        status: "fallback",
        fallbackFrom: event.fromModel,
        fallbackTo: event.toModel,
        createdAt: now(),
      });
    } else if (event.type === "completed") {
      const assistant = store.messages.find((message) => message.id === event.messageId);
      if (assistant) await persistMessage(conversationId, assistant, event.model);
      if (conversation) {
        await persistConversationMeta({
          ...conversation,
          messages: store.messages,
          title: conversationTitle(store.messages),
          updatedAt: now(),
        });
      }
      if (runId) {
        await agentRunRepository.upsert({
          id: runId,
          conversationId,
          projectId: projectId(),
          agentId: "coding-agent",
          status: "completed",
          model: event.model,
          startedAt: now(),
          finishedAt: now(),
          sessionId: sessionManager.getActive()?.id ?? null,
          taskId,
        });
        await persistUsage(runId, event.model, "completed");
      }
      userPersisted = false;
      runId = null;
    } else if (event.type === "error" || event.type === "cancelled") {
      if (runId) {
        await agentRunRepository.upsert({
          id: runId,
          conversationId,
          projectId: projectId(),
          agentId: "coding-agent",
          status: event.type === "cancelled" ? "cancelled" : "failed",
          model: store.activeModel,
          startedAt: now(),
          finishedAt: now(),
          error: event.type === "error" ? event.message : null,
          sessionId: sessionManager.getActive()?.id ?? null,
          taskId,
        });
      }
      const active = sessionManager.getActive();
      if (active && (event.type === "cancelled" || event.type === "error")) {
        await sessionManager.setStatus(
          active.id,
          event.type === "cancelled" ? "interrupted" : "failed",
        );
      }
      userPersisted = false;
      runId = null;
    }
  }
}
