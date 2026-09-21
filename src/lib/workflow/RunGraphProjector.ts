import { shouldCollapseIntoToolGroup } from "./toolGroups";
import type { AgentEvent } from "../agent/types";
import type { ContextSliceSummary } from "../agent/context/types";
import { LAYOUT_SKIP_EVENT_TYPES, type AgentRunEvent } from "./events";
import {
  nodeIdForAgent,
  nodeIdForApproval,
  nodeIdForCheckpoint,
  nodeIdForContext,
  nodeIdForError,
  nodeIdForFallback,
  nodeIdForMcpServer,
  nodeIdForPrompt,
  nodeIdForResult,
  nodeIdForReview,
  nodeIdForSlice,
  nodeIdForSubagentRun,
  nodeIdForTask,
  nodeIdForTool,
  nodeIdForToolGroup,
  nodeIdForVerification,
  nodeIdForWorkflow,
} from "./GraphSelection";
import { phaseFromWorkflowStep } from "./phases";
import { nodeTypeForTool, stringifyPreview, toolFileLine, toolFilePath } from "./toolKind";
import { parseRuntimeToolName } from "../mcp/ids";
import { persistMcpUsage } from "../mcp/usage";
import { capabilityIdFromRuntimeTool, mcpServerCapabilityId, skillCapabilityId } from "../capabilities/ids";
import type {
  AgentGraphEdge,
  AgentGraphEdgeType,
  AgentGraphNode,
  AgentGraphNodeStatus,
  AgentGraphNodeType,
  AgentRun,
  EvidenceLevel,
  GraphEvidence,
  ProjectedGraph,
  RunPhase,
} from "./types";

const DEFAULT_AGENT_ID = "coding-agent";

interface ProjectorState {
  run: AgentRun;
  nodes: Map<string, AgentGraphNode>;
  edges: Map<string, AgentGraphEdge>;
  lastSpineId: string | null;
  pendingContextIds: string[];
  lastErrorId: string | null;
  lastToolId: string | null;
  lastVerificationId: string | null;
  currentPhase?: RunPhase;
  currentAgentId: string;
  lastSequence: number;
  structural: boolean;
  groupableBuffer: string[];
}

function emptyRun(id: string, timestamp: number): AgentRun {
  return {
    id,
    accountId: "",
    projectId: "",
    agentId: DEFAULT_AGENT_ID,
    status: "pending",
    startedAt: timestamp,
    totalSteps: 0,
    totalToolCalls: 0,
    fallbackCount: 0,
  };
}

function outputChars(value: unknown) {
  if (value === undefined) return 0;
  if (typeof value === "string") return value.length;
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function sliceNodeType(source: string): AgentGraphNodeType | null {
  if (source === "memory") return "memory";
  if (source === "rag") return "rag";
  if (source === "skill") return "skill";
  if (source === "editor" || source === "project") return "file";
  return null;
}

export class RunGraphProjector {
  private state: ProjectorState;

  constructor(runId = "", timestamp = 0) {
    this.state = {
      run: emptyRun(runId, timestamp),
      nodes: new Map(),
      edges: new Map(),
      lastSpineId: null,
      pendingContextIds: [],
      lastErrorId: null,
      lastToolId: null,
      lastVerificationId: null,
      currentAgentId: DEFAULT_AGENT_ID,
      lastSequence: 0,
      structural: false,
      groupableBuffer: [],
    };
  }

  snapshot(): ProjectedGraph {
    this.flushToolGroup();
    return {
      run: { ...this.state.run },
      nodes: [...this.state.nodes.values()].map((node) => ({ ...node, metadata: { ...node.metadata } })),
      edges: [...this.state.edges.values()].map((edge) => ({ ...edge, metadata: { ...edge.metadata } })),
      lastSequence: this.state.lastSequence,
      structural: this.state.structural,
    };
  }

  ingest(event: AgentRunEvent): boolean {
    this.state.structural = false;
    if (!this.state.run.id && event.runId) this.state.run.id = event.runId;
    if (event.runId && this.state.run.id && event.runId !== this.state.run.id && this.state.nodes.size > 0) {
      return false;
    }
    this.state.lastSequence = event.sequence;
    if (LAYOUT_SKIP_EVENT_TYPES.has(event.type)) return false;
    this.fold(event);
    return this.state.structural;
  }

  private fold(event: AgentRunEvent) {
    const payload = event.payload;
    switch (payload.type) {
      case "task-started":
        this.onTaskStarted(event, payload);
        break;
      case "task-completed":
        this.onTaskCompleted(event, payload);
        break;
      case "started":
        this.onStarted(event, payload);
        break;
      case "workflow-started":
        this.onWorkflowStarted(event, payload);
        break;
      case "workflow-step":
        this.onWorkflowStep(event, payload);
        break;
      case "context-assembled":
        this.onContext(event, payload);
        break;
      case "skill-selected":
        this.onSkillSelected(event, payload);
        break;
      case "tool-started":
        this.onToolStarted(event, payload);
        break;
      case "tool-completed":
        this.onToolCompleted(event, payload);
        break;
      case "mcp-server-ready":
      case "mcp-discovered":
        this.ensureMcpServerNode(event, payload.serverId, "completed", payload);
        break;
      case "mcp-server-started":
        this.ensureMcpServerNode(event, payload.serverId, "running");
        break;
      case "mcp-server-error":
        this.ensureMcpServerNode(event, payload.serverId, "failed", { message: payload.message });
        break;
      case "mcp-server-disconnected":
        this.patchNode(nodeIdForMcpServer(payload.serverId), { status: "cancelled", finishedAt: event.timestamp });
        break;
      case "mcp-tool-started":
        this.ensureMcpServerNode(event, payload.serverId, "running");
        break;
      case "mcp-tool-completed":
        break;
      case "permission-required":
        this.onApproval(event, payload, "permission");
        break;
      case "workflow-approval-required":
        this.onWorkflowApproval(event, payload);
        break;
      case "approval-resolved":
        this.onApprovalResolved(event, payload);
        break;
      case "verification-started":
        this.onVerificationStarted(event, payload);
        break;
      case "verification-completed":
        this.onVerificationCompleted(event, payload);
        break;
      case "fallback":
        this.onFallback(event, payload);
        break;
      case "error":
        this.onError(event, payload);
        break;
      case "completed":
        this.onCompleted(event, payload);
        break;
      case "cancelled":
        this.onCancelled(event, payload);
        break;
      case "orchestration-started":
        this.onOrchestrationStarted(event, payload);
        break;
      case "agent-started":
        this.onAgentStarted(event, payload);
        break;
      case "agent-completed":
        this.onAgentCompleted(event, payload);
        break;
      case "orchestration-completed":
        this.patchRun({ status: this.state.run.status === "failed" ? "failed" : "running" });
        break;
      case "recovery-checkpoint":
        this.onCheckpoint(event, payload.checkpoint.id);
        break;
      case "workflow-checkpoint":
        this.onCheckpoint(event, payload.checkpoint.stepId);
        break;
      case "review-started":
      case "review-completed":
      case "change-set-accepted":
      case "change-set-rejected":
        this.onReview(event, payload);
        break;
      case "step-started":
        this.patchRun({ totalSteps: this.state.run.totalSteps + 1, status: "running" });
        break;
      case "step-finished":
        break;
      default:
        break;
    }
  }

  private onTaskStarted(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "task-started" }>) {
    this.patchRun({
      status: "running",
      startedAt: this.state.run.startedAt || event.timestamp,
      title: payload.title,
    });
    const id = nodeIdForTask(payload.taskId);
    this.upsertNode({
      id,
      runId: event.runId,
      type: "task",
      label: payload.title,
      status: "running",
      timestamp: event.timestamp,
      startedAt: event.timestamp,
      phase: this.state.currentPhase,
      metadata: { taskId: payload.taskId, chatItemId: `task:${payload.taskId}` },
    });
    this.sequenceTo(id, event);
  }

  private onTaskCompleted(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "task-completed" }>) {
    const id = nodeIdForTask(payload.taskId);
    this.patchNode(id, {
      status: payload.status === "completed" ? "completed" : "failed",
      finishedAt: event.timestamp,
      durationMs: this.duration(id, event.timestamp),
    });
  }

  private onStarted(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "started" }>) {
    this.patchRun({
      id: event.runId || payload.requestId,
      status: "running",
      model: payload.model,
      startedAt: this.state.run.startedAt || event.timestamp,
      title: this.state.run.title ?? payload.userMessage.content.slice(0, 80),
    });
    const promptId = nodeIdForPrompt(payload.userMessage.id);
    if (!this.state.nodes.has(promptId)) {
      this.upsertNode({
        id: promptId,
        runId: event.runId,
        type: "user_prompt",
        label: payload.userMessage.content.slice(0, 72) || "User prompt",
        status: "completed",
        timestamp: event.timestamp,
        startedAt: event.timestamp,
        finishedAt: event.timestamp,
        metadata: { messageId: payload.userMessage.id, chatItemId: `user:${payload.userMessage.id}` },
      });
      this.sequenceTo(promptId, event);
    }
    const agentId = nodeIdForAgent(this.state.currentAgentId);
    const existed = this.state.nodes.has(agentId);
    this.upsertNode({
      id: agentId,
      runId: event.runId,
      type: "agent",
      label: "Coding Agent",
      status: "running",
      timestamp: event.timestamp,
      startedAt: this.state.nodes.get(agentId)?.startedAt ?? event.timestamp,
      metadata: { agentId: this.state.currentAgentId, model: payload.model },
    });
    if (!existed) {
      this.connect(promptId, agentId, "sequence", event, "observed");
      this.state.lastSpineId = agentId;
    }
  }

  private onWorkflowStarted(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "workflow-started" }>) {
    this.patchRun({ status: "running" });
    for (const stepId of payload.stepIds) {
      const id = nodeIdForWorkflow(stepId);
      this.upsertNode({
        id,
        runId: event.runId,
        type: "task",
        label: titleCase(stepId),
        status: "pending",
        timestamp: event.timestamp,
        phase: phaseFromWorkflowStep(stepId),
        metadata: { workflowStepId: stepId, chatItemId: `plan:${payload.runId}` },
      });
    }
  }

  private onWorkflowStep(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "workflow-step" }>) {
    this.flushToolGroup();
    const id = nodeIdForWorkflow(payload.stepId);
    const phase = phaseFromWorkflowStep(payload.stepId);
    this.state.currentPhase = phase;
    const status = workflowNodeStatus(payload.status);
    this.upsertNode({
      id,
      runId: event.runId,
      type: phase === "planning" ? "planning" : "task",
      label: titleCase(payload.stepId),
      status,
      timestamp: event.timestamp,
      startedAt: status === "running" ? event.timestamp : this.state.nodes.get(id)?.startedAt,
      finishedAt: status === "completed" || status === "failed" ? event.timestamp : undefined,
      durationMs: status === "completed" || status === "failed" ? this.duration(id, event.timestamp) : undefined,
      phase,
      metadata: { ...(this.state.nodes.get(id)?.metadata ?? {}), workflowStepId: payload.stepId },
    });
    if (status === "running") this.sequenceTo(id, event);
  }

  private onContext(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "context-assembled" }>) {
    const contextId = nodeIdForContext(event.sequence);
    this.upsertNode({
      id: contextId,
      runId: event.runId,
      type: "context",
      label: "Context",
      status: "completed",
      timestamp: event.timestamp,
      startedAt: event.timestamp,
      finishedAt: event.timestamp,
      phase: this.state.currentPhase,
      metadata: { tokensUsed: payload.tokensUsed, trace: payload.trace },
    });
    this.connect(this.state.lastSpineId, contextId, "sequence", event, "observed");
    const childIds: string[] = [];
    const slices = payload.slices ?? [];
    const includedSources = new Set(payload.trace.filter((entry) => entry.included).map((entry) => entry.source));
    const usedSlices = slices.length > 0
      ? slices.filter((slice) => slice.included !== false)
      : payload.trace.filter((entry) => entry.included).map((entry) => ({
        id: entry.source,
        source: entry.source,
        tokens: entry.tokens,
        included: true,
        meta: { reason: entry.reason },
      } satisfies ContextSliceSummary));

    for (const slice of usedSlices) {
      const type = sliceNodeType(slice.source);
      if (!type) continue;
      if (slices.length === 0 && !includedSources.has(slice.source)) continue;
      const id = slice.id;
      const meta = slice.meta as Record<string, string> | undefined;
      const label = meta?.name || meta?.path || titleCase(slice.source);
      this.upsertNode({
        id,
        runId: event.runId,
        type,
        label,
        status: "completed",
        timestamp: event.timestamp,
        startedAt: event.timestamp,
        finishedAt: event.timestamp,
        parentId: contextId,
        phase: this.state.currentPhase,
        metadata: {
          ...slice.meta,
          source: slice.source,
          tokens: slice.tokens,
          filePath: meta?.path,
          evidenceLevel: "observed",
        },
      });
      this.connect(id, contextId, "input", event, "observed", evidenceForSlice(slice));
      childIds.push(id);
    }
    this.state.pendingContextIds = [contextId, ...childIds];
    this.state.lastSpineId = contextId;
    this.state.structural = true;
  }

  private onSkillSelected(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "skill-selected" }>) {
    const id = payload.skillId.includes(":") ? payload.skillId : nodeIdForSlice("skill", payload.skillId);
    this.upsertNode({
      id,
      runId: event.runId,
      type: "skill",
      label: payload.name,
      status: "completed",
      timestamp: event.timestamp,
      startedAt: event.timestamp,
      finishedAt: event.timestamp,
      phase: this.state.currentPhase,
      metadata: {
        skillId: payload.skillId,
        reason: payload.reason,
        version: payload.version,
        evidenceLevel: "observed",
        capabilityId: skillCapabilityId("builtin", payload.skillId),
        capabilityType: "skill",
        usageInstanceId: id,
      },
    });
    this.connect(id, this.state.lastSpineId, "input", event, "observed");
    this.state.pendingContextIds.push(id);
  }

  private onToolStarted(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "tool-started" }>) {
    const id = nodeIdForTool(payload.id);
    const parsed = parseRuntimeToolName(payload.tool);
    const type = nodeTypeForTool(payload.tool);
    const path = toolFilePath(payload.input);
    const line = toolFileLine(payload.input);
    const serverNodeId = parsed ? this.ensureMcpServerNode(event, parsed.serverId, "running") : null;
    this.upsertNode({
      id,
      runId: event.runId,
      type,
      label: parsed ? parsed.toolName : payload.tool,
      status: "running",
      timestamp: event.timestamp,
      startedAt: event.timestamp,
      parentId: serverNodeId ?? undefined,
      phase: this.state.currentPhase,
      metadata: {
        tool: payload.tool,
        toolCallId: payload.id,
        input: payload.input,
        filePath: path,
        line,
        chatItemId: `tool:${payload.id}`,
        mcpServerId: parsed?.serverId,
        mcpToolName: parsed?.toolName,
        capabilityId: capabilityIdFromRuntimeTool(payload.tool),
        capabilityType: parsed ? "mcp" : "tool",
        usageInstanceId: id,
      },
    });
    this.patchRun({ totalToolCalls: this.state.run.totalToolCalls + 1, status: "running" });
    this.attachInputs(id, event);
    if (serverNodeId) {
      this.connect(serverNodeId, id, "sequence", event, "observed");
      persistMcpUsage({
        id: payload.id,
        runId: event.runId,
        serverId: parsed!.serverId,
        toolName: parsed!.toolName,
        startedAt: event.timestamp,
        status: "started",
      });
    }
    if (this.state.lastErrorId) {
      this.connect(this.state.lastErrorId, id, "recovery", event, "observed");
      this.state.lastErrorId = null;
    } else if (!serverNodeId) {
      this.sequenceTo(id, event);
    }
    this.state.lastToolId = id;
    if (!parsed && shouldCollapseIntoToolGroup(payload.tool, "running")) {
      this.state.groupableBuffer.push(id);
    } else {
      this.flushToolGroup();
    }
  }

  private onToolCompleted(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "tool-completed" }>) {
    const id = nodeIdForTool(payload.id);
    const failed = isFailedTool(payload.output);
    this.patchNode(id, {
      status: failed ? "failed" : "completed",
      finishedAt: event.timestamp,
      durationMs: this.duration(id, event.timestamp),
      metadata: {
        ...(this.state.nodes.get(id)?.metadata ?? {}),
        output: payload.output,
        outputChars: outputChars(payload.output),
        outputPreview: stringifyPreview(payload.output),
      },
    });
    const mcpServerId = this.state.nodes.get(id)?.metadata?.mcpServerId;
    const mcpToolName = this.state.nodes.get(id)?.metadata?.mcpToolName;
    if (typeof mcpServerId === "string" && typeof mcpToolName === "string") {
      persistMcpUsage({
        id: payload.id,
        runId: event.runId,
        serverId: mcpServerId,
        toolName: mcpToolName,
        startedAt: this.state.nodes.get(id)?.startedAt ?? event.timestamp,
        finishedAt: event.timestamp,
        status: failed ? "failed" : "completed",
      });
    }
    if (failed) {
      const errorId = nodeIdForError(payload.id);
      this.upsertNode({
        id: errorId,
        runId: event.runId,
        type: "error",
        label: payload.tool,
        status: "failed",
        timestamp: event.timestamp,
        phase: this.state.currentPhase,
        metadata: { toolCallId: payload.id, output: payload.output },
      });
      this.connect(id, errorId, "sequence", event, "observed");
      this.state.lastErrorId = errorId;
      this.state.lastSpineId = errorId;
    }
  }

  private onApproval(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "permission-required" }>, kind: "permission") {
    const id = nodeIdForApproval(payload.id);
    this.upsertNode({
      id,
      runId: event.runId,
      type: "approval",
      label: payload.tool,
      status: "running",
      timestamp: event.timestamp,
      startedAt: event.timestamp,
      phase: this.state.currentPhase,
      metadata: {
        approvalId: payload.id,
        kind,
        tool: payload.tool,
        input: payload.input,
        reason: payload.reason,
        riskLevel: payload.riskLevel,
        chatItemId: `approval:${payload.id}`,
      },
    });
    this.connect(this.state.lastToolId ?? this.state.lastSpineId, id, "sequence", event, "observed");
    this.state.lastSpineId = id;
  }

  private onWorkflowApproval(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "workflow-approval-required" }>) {
    const id = nodeIdForApproval(payload.id);
    this.upsertNode({
      id,
      runId: event.runId,
      type: "approval",
      label: "Plan approval",
      status: "running",
      timestamp: event.timestamp,
      startedAt: event.timestamp,
      phase: this.state.currentPhase ?? "planning",
      metadata: {
        approvalId: payload.id,
        kind: "workflow",
        stepId: payload.stepId,
        summary: payload.summary,
        chatItemId: `approval:${payload.id}`,
      },
    });
    this.sequenceTo(id, event);
  }

  private onApprovalResolved(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "approval-resolved" }>) {
    const id = nodeIdForApproval(payload.id);
    const denied = payload.decision === "deny";
    this.patchNode(id, {
      status: denied ? "cancelled" : "completed",
      finishedAt: event.timestamp,
      durationMs: this.duration(id, event.timestamp),
      metadata: {
        ...(this.state.nodes.get(id)?.metadata ?? {}),
        decision: payload.decision,
      },
    });
  }

  private onVerificationStarted(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "verification-started" }>) {
    this.flushToolGroup();
    const id = nodeIdForVerification(payload.requestId, 0);
    this.upsertNode({
      id,
      runId: event.runId,
      type: "verification",
      label: "Verification",
      status: "running",
      timestamp: event.timestamp,
      startedAt: event.timestamp,
      phase: "verification",
      metadata: { requestId: payload.requestId, chatItemId: `verification:${payload.requestId}` },
    });
    this.sequenceTo(id, event);
    this.state.lastVerificationId = id;
  }

  private onVerificationCompleted(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "verification-completed" }>) {
    const id = this.state.lastVerificationId ?? nodeIdForVerification(payload.requestId, payload.attempt);
    this.patchNode(id, {
      status: payload.ok ? "completed" : "failed",
      finishedAt: event.timestamp,
      durationMs: this.duration(id, event.timestamp),
      metadata: {
        ...(this.state.nodes.get(id)?.metadata ?? {}),
        ok: payload.ok,
        blockers: payload.blockers,
        commands: payload.commands,
        attempt: payload.attempt,
        requestId: payload.requestId,
      },
    });
    if (!payload.ok) {
      const errorId = nodeIdForError(`verify:${payload.requestId}:${payload.attempt}`);
      this.upsertNode({
        id: errorId,
        runId: event.runId,
        type: "error",
        label: payload.blockers[0] ?? "Verification failed",
        status: "failed",
        timestamp: event.timestamp,
        phase: "recovery",
        metadata: { blockers: payload.blockers, commands: payload.commands, attempt: payload.attempt },
      });
      this.connect(id, errorId, "sequence", event, "observed");
      this.state.lastErrorId = errorId;
      this.state.lastSpineId = errorId;
      this.state.currentPhase = "recovery";
    }
  }

  private onFallback(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "fallback" }>) {
    const id = nodeIdForFallback(payload.fromModel, payload.toModel, event.sequence);
    this.upsertNode({
      id,
      runId: event.runId,
      type: "fallback",
      label: `${payload.fromModel} → ${payload.toModel}`,
      status: "completed",
      timestamp: event.timestamp,
      startedAt: event.timestamp,
      finishedAt: event.timestamp,
      phase: this.state.currentPhase,
      metadata: { fromModel: payload.fromModel, toModel: payload.toModel, reason: payload.reason },
    });
    this.connect(this.state.lastSpineId, id, "fallback", event, "observed");
    this.state.lastSpineId = id;
    this.patchRun({ model: payload.toModel, fallbackCount: (this.state.run.fallbackCount ?? 0) + 1 });
  }

  private onError(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "error" }>) {
    const id = nodeIdForError(payload.requestId);
    this.upsertNode({
      id,
      runId: event.runId,
      type: "error",
      label: payload.message,
      status: "failed",
      timestamp: event.timestamp,
      phase: this.state.currentPhase,
      metadata: { message: payload.message, requestId: payload.requestId },
    });
    this.connect(this.state.lastSpineId, id, "sequence", event, "observed");
    this.state.lastErrorId = id;
    this.state.lastSpineId = id;
    this.patchRun({ status: "failed", error: payload.message, finishedAt: event.timestamp });
  }

  private onCompleted(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "completed" }>) {
    this.flushToolGroup();
    const id = nodeIdForResult(event.runId || payload.requestId);
    this.upsertNode({
      id,
      runId: event.runId,
      type: "result",
      label: "Result",
      status: "completed",
      timestamp: event.timestamp,
      startedAt: event.timestamp,
      finishedAt: event.timestamp,
      phase: "completion",
      metadata: { model: payload.model, messageId: payload.messageId },
    });
    this.sequenceTo(id, event);
    this.patchNode(nodeIdForAgent(this.state.currentAgentId), {
      status: "completed",
      finishedAt: event.timestamp,
      durationMs: this.duration(nodeIdForAgent(this.state.currentAgentId), event.timestamp),
    });
    this.patchRun({
      status: "completed",
      finishedAt: event.timestamp,
      model: payload.model || this.state.run.model,
    });
  }

  private onCancelled(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "cancelled" }>) {
    this.flushToolGroup();
    this.patchRun({ status: "cancelled", finishedAt: event.timestamp });
    if (this.state.lastSpineId) {
      this.patchNode(this.state.lastSpineId, { status: "cancelled", finishedAt: event.timestamp });
    }
    void payload;
  }

  private onOrchestrationStarted(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "orchestration-started" }>) {
    this.patchRun({ status: "running", title: this.state.run.title ?? payload.goal });
    const agentId = nodeIdForAgent(this.state.currentAgentId);
    this.upsertNode({
      id: agentId,
      runId: event.runId,
      type: "agent",
      label: "Orchestrator",
      status: "running",
      timestamp: event.timestamp,
      startedAt: event.timestamp,
      metadata: { agentIds: payload.agentIds, goal: payload.goal },
    });
    this.sequenceTo(agentId, event);
  }

  private onAgentStarted(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "agent-started" }>) {
    const id = nodeIdForSubagentRun(payload.agentId, payload.taskId);
    this.upsertNode({
      id,
      runId: event.runId,
      type: "subagent",
      label: payload.name,
      status: "running",
      timestamp: event.timestamp,
      startedAt: event.timestamp,
      metadata: { agentId: payload.agentId, taskId: payload.taskId },
    });
    this.connect(nodeIdForAgent(this.state.currentAgentId), id, "delegation", event, "observed");
    this.state.lastSpineId = id;
  }

  private onAgentCompleted(event: AgentRunEvent, payload: Extract<AgentEvent, { type: "agent-completed" }>) {
    const id = nodeIdForSubagentRun(payload.agentId, payload.taskId);
    this.patchNode(id, {
      status: "completed",
      finishedAt: event.timestamp,
      durationMs: this.duration(id, event.timestamp),
      metadata: { ...(this.state.nodes.get(id)?.metadata ?? {}), report: payload.report },
    });
    this.connect(id, nodeIdForAgent(this.state.currentAgentId), "output", event, "observed");
    this.state.lastSpineId = nodeIdForAgent(this.state.currentAgentId);
  }

  private ensureMcpServerNode(
    event: AgentRunEvent,
    serverId: string,
    status: AgentGraphNodeStatus,
    extra?: Record<string, unknown>,
  ) {
    const id = nodeIdForMcpServer(serverId);
    const existing = this.state.nodes.get(id);
    this.upsertNode({
      id,
      runId: event.runId,
      type: "mcp_server",
      label: serverId,
      status,
      timestamp: event.timestamp,
      startedAt: existing?.startedAt ?? event.timestamp,
      finishedAt: status === "running" ? existing?.finishedAt : event.timestamp,
      phase: this.state.currentPhase,
      metadata: {
        mcpServerId: serverId,
        capabilityId: mcpServerCapabilityId(serverId),
        capabilityType: "mcp",
        usageInstanceId: id,
        ...extra,
      },
    });
    if (!existing) this.sequenceTo(id, event);
    return id;
  }

  private onCheckpoint(event: AgentRunEvent, checkpointId: string) {
    const id = nodeIdForCheckpoint(checkpointId);
    if (this.state.nodes.has(id)) return;
    this.upsertNode({
      id,
      runId: event.runId,
      type: "checkpoint",
      label: "Checkpoint",
      status: "completed",
      timestamp: event.timestamp,
      startedAt: event.timestamp,
      finishedAt: event.timestamp,
      metadata: { checkpointId },
    });
  }

  private onReview(event: AgentRunEvent, payload: Extract<AgentEvent, { changeSetId: string }>) {
    const id = nodeIdForReview(payload.changeSetId);
    const completed = payload.type === "review-completed" || payload.type === "change-set-accepted" || payload.type === "change-set-rejected";
    this.upsertNode({
      id,
      runId: event.runId,
      type: "review",
      label: completed ? "Changes reviewed" : "AI review",
      status: payload.type === "change-set-rejected" ? "cancelled" : completed ? "completed" : "running",
      timestamp: event.timestamp,
      startedAt: event.timestamp,
      finishedAt: completed ? event.timestamp : undefined,
      metadata: { changeSetId: payload.changeSetId, chatItemId: `review:${payload.changeSetId}` },
    });
    this.sequenceTo(id, event);
  }

  private attachInputs(target: string, event: AgentRunEvent) {
    for (const source of this.state.pendingContextIds) {
      this.connect(source, target, "input", event, "observed");
    }
    this.state.pendingContextIds = [];
  }

  private sequenceTo(target: string, event: AgentRunEvent) {
    this.connect(this.state.lastSpineId, target, "sequence", event, "observed");
    this.state.lastSpineId = target;
  }

  private connect(
    source: string | null,
    target: string | null,
    type: AgentGraphEdgeType,
    event: AgentRunEvent,
    evidenceLevel: EvidenceLevel,
    evidence?: GraphEvidence[],
  ) {
    if (!source || !target || source === target) return;
    if (!this.state.nodes.has(source) || !this.state.nodes.has(target)) return;
    const id = `${type}:${source}->${target}`;
    if (this.state.edges.has(id)) return;
    const edge: AgentGraphEdge = {
      id,
      runId: event.runId,
      source,
      target,
      type,
      evidenceLevel,
      evidence,
    };
    this.state.edges.set(id, edge);
    this.state.structural = true;
  }

  private upsertNode(node: AgentGraphNode) {
    const existing = this.state.nodes.get(node.id);
    const sequence = node.sequence ?? existing?.sequence ?? this.state.lastSequence;
    this.state.nodes.set(node.id, existing
      ? { ...existing, ...node, sequence, metadata: { ...existing.metadata, ...node.metadata } }
      : { ...node, sequence });
    if (!existing) this.state.structural = true;
  }

  private patchNode(id: string, patch: Partial<AgentGraphNode>) {
    const existing = this.state.nodes.get(id);
    if (!existing) return;
    this.state.nodes.set(id, {
      ...existing,
      ...patch,
      metadata: { ...existing.metadata, ...patch.metadata },
    });
  }

  private patchRun(patch: Partial<AgentRun>) {
    this.state.run = { ...this.state.run, ...patch };
  }

  private duration(id: string, finishedAt: number) {
    const started = this.state.nodes.get(id)?.startedAt;
    if (!started) return undefined;
    return Math.max(0, finishedAt - started);
  }

  private flushToolGroup() {
    const ids = this.state.groupableBuffer;
    this.state.groupableBuffer = [];
    if (ids.length < 2) return;
    const first = this.state.nodes.get(ids[0] ?? "");
    if (!first) return;
    const groupId = nodeIdForToolGroup(ids[0] ?? "");
    const completed = ids.every((id) => {
      const status = this.state.nodes.get(id)?.status;
      return status === "completed" || status === "failed";
    });
    this.upsertNode({
      id: groupId,
      runId: first.runId,
      type: "tool_group",
      label: "Codebase inspection",
      status: completed ? "completed" : "running",
      timestamp: first.timestamp,
      startedAt: first.startedAt,
      phase: first.phase,
      metadata: { childIds: ids, count: ids.length },
    });
    for (const childId of ids) {
      this.patchNode(childId, { parentId: groupId });
      this.connect(groupId, childId, "dependency", {
        id: `${groupId}:${childId}`,
        runId: first.runId,
        timestamp: first.timestamp,
        sequence: this.state.lastSequence,
        type: "tool-started",
        payload: { type: "tool-started", id: childId, tool: "", input: {} },
      }, "derived");
    }
  }
}

export function projectRun(events: readonly AgentRunEvent[], previous?: RunGraphProjector): ProjectedGraph {
  const projector = previous ?? new RunGraphProjector(events[0]?.runId ?? "", events[0]?.timestamp ?? 0);
  if (!previous) {
    for (const event of events) projector.ingest(event);
  }
  return projector.snapshot();
}

export function projectRunIncremental(
  events: readonly AgentRunEvent[],
  cache?: { projector: RunGraphProjector; sequence: number; runId: string },
) {
  const runId = events[0]?.runId ?? "";
  const lastSeq = events.at(-1)?.sequence ?? 0;
  const mustRebuild = !cache
    || events.length === 0
    || cache.runId !== runId
    || lastSeq < cache.sequence;
  if (mustRebuild) {
    const projector = new RunGraphProjector(runId, events[0]?.timestamp ?? 0);
    let structural = false;
    for (const event of events) {
      if (projector.ingest(event)) structural = true;
    }
    const graph = projector.snapshot();
    return { graph, projector, structural: structural || graph.nodes.length > 0 };
  }
  let structural = false;
  for (const event of events) {
    if (event.sequence <= cache.sequence) continue;
    if (cache.projector.ingest(event)) structural = true;
  }
  return { graph: cache.projector.snapshot(), projector: cache.projector, structural };
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function workflowNodeStatus(status: string): AgentGraphNodeStatus {
  if (status === "running") return "running";
  if (status === "failed" || status === "blocked") return "failed";
  if (status === "completed" || status === "skipped") return "completed";
  return "pending";
}

function isFailedTool(output: unknown) {
  if (!output || typeof output !== "object") return false;
  const record = output as { ok?: unknown; success?: unknown; error?: unknown };
  if (record.ok === false || record.success === false) return true;
  if (typeof record.error === "string" && record.error) return true;
  if (record.error && typeof record.error === "object") return true;
  return false;
}

function evidenceForSlice(slice: ContextSliceSummary): GraphEvidence[] {
  const sourceType = slice.source === "memory" || slice.source === "rag" || slice.source === "skill"
    ? slice.source
    : slice.source === "editor" || slice.source === "project"
      ? "file"
      : "prompt";
  return [{
    sourceType,
    sourceId: slice.id,
    description: slice.meta?.reason || slice.meta?.name || slice.source,
    confidence: 1,
  }];
}

export function cloneProjectedGraph(graph: ProjectedGraph): ProjectedGraph {
  return {
    run: { ...graph.run },
    nodes: graph.nodes.map((node) => ({ ...node, metadata: { ...node.metadata } })),
    edges: graph.edges.map((edge) => ({ ...edge, metadata: { ...edge.metadata } })),
    lastSequence: graph.lastSequence,
    structural: graph.structural,
  };
}
