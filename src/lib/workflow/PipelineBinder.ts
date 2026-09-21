import type { AgentEvent } from "../agent/types";
import type { ContextSourceId } from "../agent/context/types";
import { LAYOUT_SKIP_EVENT_TYPES, type AgentRunEvent } from "./events";
import { parseRuntimeToolName } from "../mcp/ids";
import { applyPhasePrompts, extractPhasePrompts } from "./phasePrompts";
import { nodeTypeForTool, toolFileLine, toolFilePath } from "./toolKind";
import {
  FILET_TREE_IDS,
  PIPELINE_CONTEXT_SOURCES,
  PIPELINE_CONTEXT_STAGES,
  PIPELINE_FILET_BRANCH_IDS,
  PIPELINE_IDS,
  PIPELINE_PROCESS_PHASE_IDS,
  PIPELINE_SPINE_EDGES,
  PROCESS_SKILL_PHASE,
  TOOL_PHASE,
  contextSourceById,
  filetBranchIdForGoal,
  processSkillForSubagent,
  templateNodeToGraph,
  visibleTemplateNodes,
} from "./pipelineSchema";
import type { AgentGraphEdge, AgentGraphNode, AgentGraphNodeStatus, AgentRun, ProjectedGraph } from "./types";

const MAX_TOOL_CHILDREN = 8;

interface BinderState {
  run: AgentRun;
  nodes: Map<string, AgentGraphNode>;
  edges: AgentGraphEdge[];
  lastSequence: number;
  toolOrder: string[];
  driver: "engine" | "orchestrator" | null;
  activeProcessSkill: string | null;
}

function emptyRun(id: string): AgentRun {
  return {
    id,
    accountId: "",
    projectId: "",
    agentId: "coding-agent",
    status: "pending",
    startedAt: 0,
    totalSteps: 0,
    totalToolCalls: 0,
  };
}

function cloneIdle(runId: string): BinderState {
  const visible = visibleTemplateNodes();
  const nodes = new Map(visible.map((node) => {
    const graph = templateNodeToGraph(node, runId);
    return [graph.id, graph] as const;
  }));
  const edges = PIPELINE_SPINE_EDGES.filter((item) => (
    nodes.has(item.source) && nodes.has(item.target)
  )).map((item) => ({ ...item, runId }));
  return {
    run: emptyRun(runId),
    nodes,
    edges,
    lastSequence: 0,
    toolOrder: [],
    driver: null,
    activeProcessSkill: null,
  };
}

function patch(node: AgentGraphNode | undefined, next: Partial<AgentGraphNode>) {
  if (!node) return;
  Object.assign(node, next, { metadata: { ...node.metadata, ...next.metadata } });
}

function mark(state: BinderState, id: string, status: AgentGraphNodeStatus, event: AgentRunEvent, extra?: Record<string, unknown>) {
  const node = state.nodes.get(id);
  if (!node) return;
  patch(node, {
    status,
    runId: event.runId || node.runId,
    timestamp: node.timestamp || event.timestamp,
    startedAt: node.startedAt ?? (status === "running" || status === "completed" || status === "failed" ? event.timestamp : node.startedAt),
    finishedAt: status === "completed" || status === "failed" || status === "skipped" || status === "cancelled" ? event.timestamp : node.finishedAt,
    sequence: event.sequence,
    metadata: extra,
  });
}

function completeIfActive(state: BinderState, id: string, event: AgentRunEvent, extra?: Record<string, unknown>) {
  const node = state.nodes.get(id);
  if (!node) return;
  if (node.status === "idle" || node.status === "skipped") return;
  mark(state, id, node.status === "failed" ? "failed" : "completed", event, extra);
}

function markSkipped(state: BinderState, id: string) {
  const node = state.nodes.get(id);
  if (!node) return;
  if (node.status === "idle") node.status = "skipped";
}

function skipBranch(state: BinderState, rootId: string) {
  markSkipped(state, rootId);
  const walk = (id: string) => {
    for (const node of state.nodes.values()) {
      if (node.parentId !== id) continue;
      markSkipped(state, node.id);
      walk(node.id);
    }
  };
  walk(rootId);
}

export function bindPipeline(events: readonly AgentRunEvent[], activeRun?: AgentRun | null): ProjectedGraph {
  const runId = events.find((item) => item.runId)?.runId || activeRun?.id || "";
  const teaching = events.length === 0;
  const state = cloneIdle(runId);
  if (activeRun) state.run = { ...emptyRun(runId), ...activeRun, id: runId || activeRun.id };

  const hasOrch = events.some((item) => (
    item.type === "orchestration-started"
    || item.type === "sdd-task-started"
    || item.type === "subagent-task-started"
    || item.type === "agent-started"
  ));
  if (!teaching && !hasOrch) {
    skipBranch(state, PIPELINE_IDS.orchestrator);
  }

  for (const event of events) {
    if (LAYOUT_SKIP_EVENT_TYPES.has(event.type)) continue;
    state.lastSequence = event.sequence;
    fold(state, event);
  }

  placeToolChildren(state);

  if (state.run.status === "completed" || state.run.status === "failed" || state.run.status === "cancelled") {
    for (const node of state.nodes.values()) {
      if (node.status !== "running") continue;
      if (node.id === PIPELINE_IDS.knowledgeReflect) continue;
      node.status = state.run.status === "completed" ? "completed" : state.run.status === "cancelled" ? "cancelled" : "failed";
    }
  }

  applyPhasePrompts(state.nodes.values(), extractPhasePrompts(events));

  return {
    run: state.run,
    nodes: [...state.nodes.values()],
    edges: state.edges,
    lastSequence: state.lastSequence,
    structural: true,
  };
}

function fold(state: BinderState, event: AgentRunEvent) {
  const payload = event.payload;
  switch (payload.type) {
    case "task-started":
      state.run.title = payload.title;
      state.run.status = "running";
      state.run.startedAt = state.run.startedAt || event.timestamp;
      mark(state, PIPELINE_IDS.boot, "completed", event);
      mark(state, PIPELINE_IDS.user, "completed", event, { title: payload.title });
      mark(state, PIPELINE_IDS.task, "running", event, { taskId: payload.taskId, title: payload.title });
      mark(state, PIPELINE_IDS.hook, "running", event);
      break;
    case "task-completed":
      mark(state, PIPELINE_IDS.task, payload.status === "completed" ? "completed" : "failed", event);
      break;
    case "hook-denied":
      mark(state, PIPELINE_IDS.hook, "failed", event, { message: payload.message, hook: payload.event });
      mark(state, PIPELINE_IDS.result, "failed", event, { message: payload.message });
      state.run.status = "failed";
      state.run.error = payload.message;
      break;
    case "hook-fired":
      if (payload.event === "user_prompt_submit") {
        mark(state, PIPELINE_IDS.hook, payload.result === "block" ? "failed" : "completed", event, { hook: payload.hook, result: payload.result });
      }
      if (payload.event === "before_tool") {
        mark(state, PIPELINE_IDS.toolHook, payload.result === "block" ? "failed" : "completed", event, { hook: payload.hook, result: payload.result });
      }
      break;
    case "workflow-started":
      mark(state, PIPELINE_IDS.loop, "running", event, { workflowId: payload.workflowId, goalKind: payload.goalKind });
      state.driver = "engine";
      if (payload.skipProcess) markSkipped(state, PIPELINE_IDS.skillCheck);
      lightFiletGoal(state, payload.goalKind, event);
      break;
    case "orchestration-started":
      mark(state, PIPELINE_IDS.orchestrator, "running", event, { goal: payload.goal, agentIds: payload.agentIds });
      mark(state, PIPELINE_IDS.loop, "running", event);
      state.driver = "orchestrator";
      break;
    case "agent-started":
      markSpecialistLoop(state, payload.agentId, "running", event, { agentId: payload.agentId, name: payload.name });
      mark(state, PIPELINE_IDS.orchestrator, "running", event);
      mark(state, PIPELINE_IDS.loop, "running", event);
      lightSubagentSkill(state, payload.agentId, event, { agentId: payload.agentId, name: payload.name });
      break;
    case "agent-completed":
      markSpecialistLoop(state, payload.agentId, "completed", event, { report: payload.report });
      break;
    case "orchestration-completed":
      completeIfActive(state, PIPELINE_IDS.orchestrator, event);
      for (const node of state.nodes.values()) {
        if (node.metadata?.kind === "specialist" && node.status === "idle") skipBranch(state, node.id);
        else if (node.metadata?.kind === "specialist" && node.status === "running") mark(state, node.id, "completed", event);
      }
      break;
    case "compacted":
      mark(state, PIPELINE_IDS.compact, "completed", event, { kept: payload.kept, dropped: payload.dropped, summary: payload.summary });
      mark(state, PIPELINE_IDS.context, "running", event);
      break;
    case "context-assembled":
      mark(state, PIPELINE_IDS.context, "completed", event, { tokensUsed: payload.tokensUsed, slices: payload.slices });
      mark(state, PIPELINE_IDS.loop, "running", event);
      for (const id of PIPELINE_CONTEXT_STAGES) mark(state, id, "completed", event);
      if (state.nodes.get(PIPELINE_IDS.compact)?.status === "idle") markSkipped(state, PIPELINE_IDS.compact);
      applyContextSlices(state, event, payload);
      break;
    case "skill-check":
      mark(state, PIPELINE_IDS.skillCheck, "completed", event, { considered: payload.considered, noneApply: payload.noneApply });
      mark(state, PIPELINE_IDS.loop, "running", event);
      break;
    case "skill-selected":
    case "skill-loaded": {
      mark(state, PIPELINE_IDS.skill, "completed", event, { skillId: payload.skillId, name: payload.name });
      mark(state, PIPELINE_IDS.skillCheck, "completed", event);
      lightProcessSkill(state, payload.skillId, event, { skillId: payload.skillId, name: payload.name });
      break;
    }
    case "design-gate":
      if (payload.reason === "approved") {
        ensureFiletForSkill(state, "brainstorming", event);
        mark(state, PIPELINE_IDS.brainstorming, "completed", event, {
          skillId: "brainstorming",
          gate: payload.reason,
          tool: payload.tool,
          designApproved: true,
        });
        mark(state, PIPELINE_IDS.designGate, "completed", event, {
          gate: payload.reason,
          tool: payload.tool,
          designApproved: true,
        });
        if (state.activeProcessSkill && state.activeProcessSkill !== PIPELINE_IDS.designGate) {
          completeIfActive(state, state.activeProcessSkill, event);
        }
        state.activeProcessSkill = PIPELINE_IDS.designGate;
        mark(state, PIPELINE_IDS.loop, "running", event);
      } else {
        lightProcessSkill(state, "brainstorming", event, { gate: payload.reason, tool: payload.tool });
      }
      break;
    case "user-question":
      lightProcessSkill(state, "brainstorming", event, { prompt: payload.prompt, questionId: payload.id });
      break;
    case "plan-written":
      lightProcessSkill(state, "writing-plans", event, { path: payload.path });
      mark(state, PIPELINE_IDS.writingPlans, "completed", event, { path: payload.path });
      break;
    case "plan-created":
      lightProcessSkill(state, "writing-plans", event, { path: payload.path, name: payload.name });
      mark(state, PIPELINE_IDS.writingPlans, "completed", event, { path: payload.path, name: payload.name });
      break;
    case "plan-todo-updated":
      lightProcessSkill(state, "executing-plans", event, { todoId: payload.todoId, status: payload.status });
      break;
    case "plan-build-started":
      lightProcessSkill(state, "executing-plans", event, { planId: payload.planId });
      mark(state, PIPELINE_IDS.executingPlans, "running", event, { planId: payload.planId });
      break;
    case "plan-completed":
      mark(state, PIPELINE_IDS.executingPlans, "completed", event, { planId: payload.planId });
      break;
    case "plan-mode":
      lightProcessSkill(state, "writing-plans", event, { planMode: payload.enabled });
      break;
    case "agent-mode":
      if (payload.mode === "plan") {
        lightProcessSkill(state, "writing-plans", event, { mode: payload.mode });
      } else if (payload.mode === "debug") {
        lightProcessSkill(state, "systematic-debugging", event, { mode: payload.mode });
      }
      break;
    case "branch-created":
      lightProcessSkill(state, "using-git-worktrees", event, { branch: payload.branch, base: payload.base });
      mark(state, PIPELINE_IDS.worktree, "completed", event, { branch: payload.branch, base: payload.base });
      break;
    case "merge-conflicts":
      lightProcessSkill(state, "finishing-a-development-branch", event, { files: payload.files });
      mark(state, PIPELINE_IDS.finishing, "running", event, { conflicts: payload.files });
      break;
    case "finish-branch":
      lightProcessSkill(state, "finishing-a-development-branch", event, { choice: payload.choice });
      mark(state, PIPELINE_IDS.finishing, "completed", event, { choice: payload.choice });
      break;
    case "permission-classifier":
      mark(state, PIPELINE_IDS.permissions, "completed", event, { tool: payload.tool, decision: payload.decision });
      break;
    case "compact_boundary":
      mark(state, PIPELINE_IDS.compact, payload.thrashing ? "failed" : "running", event, { trigger: payload.trigger, thrashing: payload.thrashing });
      mark(state, PIPELINE_IDS.context, "running", event);
      break;
    case "subagent-task-started":
    case "sdd-task-started":
      mark(state, PIPELINE_IDS.orchestrator, "running", event, { agentId: payload.agentId, title: payload.title });
      markSpecialistLoop(state, payload.agentId, "running", event, { title: payload.title });
      lightSubagentSkill(state, payload.agentId, event, { agentId: payload.agentId, title: payload.title });
      break;
    case "subagent-task-completed":
    case "sdd-task-completed":
      markSpecialistLoop(state, payload.agentId, "completed", event);
      break;
    case "llm-started":
      mark(state, PIPELINE_IDS.model, "running", event, { kind: payload.kind, model: payload.model });
      mark(state, PIPELINE_IDS.loop, "running", event);
      if (payload.kind === "perm") mark(state, PIPELINE_IDS.permissions, "running", event);
      if (payload.kind === "cmp") mark(state, PIPELINE_IDS.compact, "running", event);
      if (payload.kind === "vrp") mark(state, PIPELINE_IDS.recovery, "running", event);
      if (payload.kind === "sub") {
        for (const id of ["implement", "review", "explore"] as const) {
          const specialist = state.nodes.get(PIPELINE_IDS.specialist(id));
          if (!specialist || specialist.status === "idle" || specialist.status === "skipped") continue;
          mark(state, PIPELINE_IDS.specialistPart(id, "model"), "running", event, { model: payload.model });
        }
      }
      break;
    case "started":
      mark(state, PIPELINE_IDS.boot, "completed", event);
      mark(state, PIPELINE_IDS.user, "completed", event, { messageId: payload.userMessage.id, content: payload.userMessage.content.slice(0, 80) });
      completeIfActive(state, PIPELINE_IDS.hook, event);
      mark(state, PIPELINE_IDS.router, "completed", event, { model: payload.model });
      mark(state, PIPELINE_IDS.model, "running", event, { model: payload.model });
      mark(state, PIPELINE_IDS.loop, "running", event);
      state.run.model = payload.model;
      state.run.title = state.run.title ?? payload.userMessage.content.slice(0, 80);
      state.run.status = "running";
      break;
    case "fallback":
      mark(state, PIPELINE_IDS.router, "completed", event, { fromModel: payload.fromModel, toModel: payload.toModel, reason: payload.reason });
      mark(state, PIPELINE_IDS.model, "running", event, { model: payload.toModel, fromModel: payload.fromModel, reason: payload.reason });
      state.run.model = payload.toModel;
      state.run.fallbackCount = (state.run.fallbackCount ?? 0) + 1;
      addFallbackEdge(state, event);
      break;
    case "tool-started":
      state.run.totalToolCalls += 1;
      mark(state, PIPELINE_IDS.toolChoice, "completed", event, { tool: payload.tool });
      completeIfActive(state, PIPELINE_IDS.toolHook, event);
      mark(state, PIPELINE_IDS.tools, "running", event, { toolCount: state.run.totalToolCalls, lastTool: payload.tool });
      mark(state, PIPELINE_IDS.loop, "running", event);
      addToolChild(state, event, payload);
      lightToolPhase(state, payload.tool, event);
      break;
    case "tool-completed": {
      const failed = isFailedTool(payload.output);
      const child = state.nodes.get(PIPELINE_IDS.tool(payload.id));
      if (child) mark(state, child.id, failed ? "failed" : "completed", event, { output: payload.output });
      mark(state, PIPELINE_IDS.tools, failed ? "failed" : "running", event, { lastTool: payload.tool });
      mark(state, PIPELINE_IDS.toolResults, "completed", event, { tool: payload.tool });
      completeMcpServer(state, child?.parentId, event);
      break;
    }
    case "permission-required":
      mark(state, PIPELINE_IDS.permissions, "running", event, {
        approvalId: payload.id,
        kind: "permission",
        tool: payload.tool,
        reason: payload.reason,
        chatItemId: `approval:${payload.id}`,
      });
      break;
    case "approval-resolved":
      mark(state, PIPELINE_IDS.permissions, payload.decision === "deny" ? "cancelled" : "completed", event, { decision: payload.decision });
      if (payload.kind === "workflow") {
        mark(state, PIPELINE_IDS.brainstorming, payload.decision === "deny" ? "cancelled" : "completed", event, { decision: payload.decision });
      }
      break;
    case "verification-started":
      mark(state, PIPELINE_IDS.verification, "running", event, {
        requestId: payload.requestId,
        chatItemId: `verification:${payload.requestId}`,
      });
      completeIfActive(state, PIPELINE_IDS.tools, event);
      break;
    case "verification-completed":
      mark(state, PIPELINE_IDS.verification, payload.ok ? "completed" : "failed", event, {
        ok: payload.ok,
        blockers: payload.blockers,
        commands: payload.commands,
        attempt: payload.attempt,
        requestId: payload.requestId,
        chatItemId: `verification:${payload.requestId}`,
      });
      if (!payload.ok) {
        mark(state, PIPELINE_IDS.recovery, payload.attempt >= 3 ? "failed" : "running", event, { blockers: payload.blockers, attempt: payload.attempt });
        if (payload.attempt < 3) mark(state, PIPELINE_IDS.model, "running", event, { repair: true, attempt: payload.attempt });
      } else {
        completeIfActive(state, PIPELINE_IDS.recovery, event);
        completeIfActive(state, PIPELINE_IDS.model, event);
      }
      break;
    case "run-resumed":
      mark(state, PIPELINE_IDS.task, "running", event, { resumed: true });
      mark(state, PIPELINE_IDS.loop, "running", event, { resumed: true });
      break;
    case "completed":
      completeSpine(state, event);
      mark(state, PIPELINE_IDS.result, "completed", event, { model: payload.model });
      state.run.status = "completed";
      state.run.finishedAt = event.timestamp;
      state.run.model = payload.model || state.run.model;
      break;
    case "error":
      mark(state, PIPELINE_IDS.result, "failed", event, { message: payload.message });
      mark(state, PIPELINE_IDS.loop, "failed", event);
      state.run.status = "failed";
      state.run.error = payload.message;
      state.run.finishedAt = event.timestamp;
      break;
    case "cancelled":
      mark(state, PIPELINE_IDS.result, "cancelled", event);
      state.run.status = "cancelled";
      state.run.finishedAt = event.timestamp;
      break;
    case "knowledge-reflect-started":
      mark(state, PIPELINE_IDS.knowledgeReflect, "running", event);
      break;
    case "knowledge-reflect-skipped":
      mark(state, PIPELINE_IDS.knowledgeReflect, "skipped", event, { skipped: true, reason: payload.reason });
      break;
    case "knowledge-reflect-completed":
      mark(state, PIPELINE_IDS.knowledgeReflect, "completed", event, {
        summary: payload.summary,
        skillCount: payload.skillCount,
        specCount: payload.specCount,
        proposalId: payload.proposalId,
        chatItemId: payload.proposalId ? `knowledge:${payload.proposalId}` : undefined,
      });
      break;
    default:
      break;
  }
}

function markSpecialistLoop(
  state: BinderState,
  agentId: string,
  status: AgentGraphNodeStatus,
  event: AgentRunEvent,
  extra?: Record<string, unknown>,
) {
  mark(state, PIPELINE_IDS.specialist(agentId), status, event, extra);
  mark(state, PIPELINE_IDS.specialistPart(agentId, "model"), status, event);
  mark(state, PIPELINE_IDS.specialistPart(agentId, "perm"), status === "running" ? "running" : status, event);
  mark(state, PIPELINE_IDS.specialistPart(agentId, "tools"), status, event);
  if (status !== "running") mark(state, PIPELINE_IDS.specialistPart(agentId, "verify"), status, event);
}

function applyContextSlices(state: BinderState, event: AgentRunEvent, payload: Extract<AgentEvent, { type: "context-assembled" }>) {
  const included = new Set([
    ...(payload.slices ?? []).filter((slice) => slice.included !== false).map((slice) => slice.source),
    ...payload.trace.filter((entry) => entry.included).map((entry) => entry.source),
  ]);
  for (const source of PIPELINE_CONTEXT_SOURCES) {
    const id = PIPELINE_IDS.slice(source.id);
    if (included.has(source.id)) {
      ensureContextSlice(state, source.id, event);
      mark(state, id, "completed", event, { source: source.id });
    } else if (state.nodes.get(id)?.status === "idle") {
      markSkipped(state, id);
    }
  }
  if (included.has("tool")) mark(state, PIPELINE_IDS.toolResults, "completed", event, { source: "tool" });
  else if (state.nodes.get(PIPELINE_IDS.toolResults)?.status === "idle") markSkipped(state, PIPELINE_IDS.toolResults);
}

function ensureContextSlice(state: BinderState, sourceId: ContextSourceId, event: AgentRunEvent) {
  const id = PIPELINE_IDS.slice(sourceId);
  if (state.nodes.has(id)) return;
  const source = contextSourceById(sourceId);
  if (!source) return;
  state.nodes.set(id, {
    id,
    runId: event.runId,
    type: source.type,
    label: source.label,
    status: "idle",
    timestamp: event.timestamp,
    parentId: PIPELINE_IDS.context,
    sequence: event.sequence,
    metadata: {
      role: source.role,
      kind: "context-slice",
      pipeline: true,
      source: source.id,
      position: { x: 0, y: 0 },
    },
  });
  const edgeId = `sequence:${id}->${PIPELINE_IDS.ctxRank}`;
  if (!state.edges.some((item) => item.id === edgeId)) {
    state.edges.push({
      id: edgeId,
      runId: event.runId,
      source: id,
      target: PIPELINE_IDS.ctxRank,
      type: "sequence",
      evidenceLevel: "derived",
    });
  }
}

function addToolChild(state: BinderState, event: AgentRunEvent, payload: Extract<AgentEvent, { type: "tool-started" }>) {
  const id = PIPELINE_IDS.tool(payload.id);
  if (state.nodes.has(id)) return;
  state.toolOrder.push(id);
  const parsed = parseRuntimeToolName(payload.tool);
  const parentId = parsed ? ensureMcpServer(state, event, parsed.serverId) : PIPELINE_IDS.tools;
  const siblingCount = [...state.nodes.values()].filter((node) => node.parentId === parentId).length;
  const index = Math.min(siblingCount, MAX_TOOL_CHILDREN - 1);
  state.nodes.set(id, {
    id,
    runId: event.runId,
    type: nodeTypeForTool(payload.tool),
    label: parsed ? parsed.toolName : payload.tool,
    status: "running",
    timestamp: event.timestamp,
    startedAt: event.timestamp,
    parentId,
    sequence: event.sequence,
    metadata: {
      kind: "tool-instance",
      pipeline: true,
      tool: payload.tool,
      toolCallId: payload.id,
      filePath: toolFilePath(payload.input),
      line: toolFileLine(payload.input),
      chatItemId: `tool:${payload.id}`,
      mcpServerId: parsed?.serverId,
      mcpToolName: parsed?.toolName,
      capabilityId: parsed ? `mcp.${parsed.serverId}.tool.${parsed.toolName}` : undefined,
      usageInstanceId: id,
      position: { x: index, y: 0 },
    },
  });
}

function mcpParentId(state: BinderState) {
  return state.nodes.has(PIPELINE_IDS.mcp) ? PIPELINE_IDS.mcp : PIPELINE_IDS.tools;
}

function ensureMcpServer(state: BinderState, event: AgentRunEvent, serverId: string) {
  const id = PIPELINE_IDS.mcpServer(serverId);
  const existing = state.nodes.get(id);
  if (existing) {
    mark(state, id, "running", event, { mcpServerId: serverId });
    mark(state, PIPELINE_IDS.mcp, "running", event);
    return id;
  }
  const parentId = mcpParentId(state);
  const siblingCount = [...state.nodes.values()].filter((node) => node.parentId === parentId).length;
  state.nodes.set(id, {
    id,
    runId: event.runId,
    type: "mcp_server",
    label: serverId,
    status: "running",
    timestamp: event.timestamp,
    startedAt: event.timestamp,
    parentId,
    sequence: event.sequence,
    metadata: {
      kind: "parent",
      isParent: true,
      pipeline: true,
      mcpServerId: serverId,
      capabilityId: `mcp.${serverId}`,
      usageInstanceId: id,
      role: `MCP server ${serverId}. Tools invoked on this run nest here.`,
      position: { x: siblingCount, y: 0 },
    },
  });
  mark(state, PIPELINE_IDS.mcp, "running", event);
  return id;
}

function completeMcpServer(state: BinderState, parentId: string | undefined, event: AgentRunEvent) {
  if (!parentId?.startsWith("pipeline:mcp:")) return;
  const children = [...state.nodes.values()].filter((node) => node.parentId === parentId);
  if (children.some((node) => node.status === "running")) {
    mark(state, parentId, "running", event);
    return;
  }
  mark(state, parentId, children.some((node) => node.status === "failed") ? "failed" : "completed", event);
}

function placeToolChildren(state: BinderState) {
  const extras = state.toolOrder.length - MAX_TOOL_CHILDREN;
  if (extras > 0) {
    const tools = state.nodes.get(PIPELINE_IDS.tools);
    if (tools) {
      tools.metadata = { ...tools.metadata, extraTools: extras, toolCount: state.toolOrder.length };
    }
  }
}

function lightFiletGoal(
  state: BinderState,
  goalKind: string | undefined,
  event: AgentRunEvent,
) {
  const kind = goalKind === "explain" || goalKind === "bug" || goalKind === "build" || goalKind === "other"
    ? goalKind
    : "other";
  const active = filetBranchIdForGoal(kind);
  for (const key of ["explain", "bug", "build"] as const) {
    if (key === active) {
      mark(state, PIPELINE_IDS[key], "running", event, { goalKind: kind });
      continue;
    }
    if (!active) continue;
    for (const id of FILET_TREE_IDS[key]) markSkipped(state, id);
  }
}

function ensureFiletForSkill(state: BinderState, skillId: string, event: AgentRunEvent) {
  if (skillId === "systematic-debugging") {
    if (state.nodes.get(PIPELINE_IDS.bug)?.status === "skipped") return;
    mark(state, PIPELINE_IDS.bug, "running", event);
    for (const id of FILET_TREE_IDS.explain) markSkipped(state, id);
    if (state.nodes.get(PIPELINE_IDS.build)?.status === "idle") {
      for (const id of FILET_TREE_IDS.build) markSkipped(state, id);
    }
    return;
  }
  const buildSkills = new Set([
    "brainstorming",
    "subagent-driven-brainstorming",
    "using-git-worktrees",
    "writing-plans",
    "subagent-driven-planning",
    "executing-plans",
    "test-driven-development",
    "requesting-code-review",
    "receiving-code-review",
    "verification-before-completion",
    "finishing-a-development-branch",
  ]);
  if (!buildSkills.has(skillId)) return;
  if (state.nodes.get(PIPELINE_IDS.build)?.status === "skipped") return;
  mark(state, PIPELINE_IDS.build, "running", event);
  for (const id of FILET_TREE_IDS.explain) markSkipped(state, id);
  if (state.nodes.get(PIPELINE_IDS.bug)?.status === "idle") {
    for (const id of FILET_TREE_IDS.bug) markSkipped(state, id);
  }
}

function lightProcessSkill(state: BinderState, skillId: string, event: AgentRunEvent, extra?: Record<string, unknown>) {
  const id = PROCESS_SKILL_PHASE[skillId];
  if (!id) return;
  ensureFiletForSkill(state, skillId, event);
  if (state.nodes.get(id)?.status === "skipped") return;
  if (state.activeProcessSkill && state.activeProcessSkill !== id) {
    completeIfActive(state, state.activeProcessSkill, event);
  }
  state.activeProcessSkill = id;
  mark(state, id, "running", event, extra);
  mark(state, PIPELINE_IDS.loop, "running", event);
}

function lightToolPhase(state: BinderState, tool: string, event: AgentRunEvent) {
  if (tool === "agent") {
    const type = subagentTypeFromEvent(event);
    lightSubagentSkill(state, type || "explore", event, { lastTool: tool });
    return;
  }
  const id = TOOL_PHASE[tool];
  if (!id) {
    if (state.activeProcessSkill) {
      mark(state, state.activeProcessSkill, "running", event, { lastTool: tool });
    }
    return;
  }
  if (tool === "ask_user_question") ensureFiletForSkill(state, "brainstorming", event);
  else if (tool === "git_branch") ensureFiletForSkill(state, "using-git-worktrees", event);
  else if (tool === "enter_plan_mode" || tool === "create_plan") ensureFiletForSkill(state, "writing-plans", event);
  else if (tool === "update_plan_todo") ensureFiletForSkill(state, "executing-plans", event);
  else if (tool === "run_command") ensureFiletForSkill(state, "test-driven-development", event);
  else if (tool === "finish_development_branch") ensureFiletForSkill(state, "finishing-a-development-branch", event);
  if (state.nodes.get(id)?.status === "skipped") return;
  if (state.activeProcessSkill && state.activeProcessSkill !== id) {
    completeIfActive(state, state.activeProcessSkill, event);
  }
  state.activeProcessSkill = id;
  mark(state, id, "running", event, { lastTool: tool });
  mark(state, PIPELINE_IDS.loop, "running", event);
}

function preferPlanResearch(state: BinderState): boolean {
  const writing = state.nodes.get(PIPELINE_IDS.writingPlans)?.status;
  const design = state.nodes.get(PIPELINE_IDS.designGate)?.status;
  return writing === "running" || writing === "completed" || design === "completed";
}

function lightSubagentSkill(
  state: BinderState,
  agentId: string,
  event: AgentRunEvent,
  extra?: Record<string, unknown>,
) {
  lightProcessSkill(state, processSkillForSubagent(agentId, preferPlanResearch(state)), event, extra);
}

function subagentTypeFromEvent(event: AgentRunEvent): string {
  const payload = event.payload;
  if (payload.type !== "tool-started" && payload.type !== "tool-completed") return "";
  const input = payload.input;
  if (!input || typeof input !== "object") return "";
  const type = (input as { subagent_type?: unknown }).subagent_type;
  return typeof type === "string" ? type.trim() : "";
}

function addFallbackEdge(state: BinderState, event: AgentRunEvent) {
  const id = `fallback:${PIPELINE_IDS.router}->${PIPELINE_IDS.model}`;
  if (state.edges.some((item) => item.id === id)) return;
  state.edges.push({
    id,
    runId: event.runId,
    source: PIPELINE_IDS.router,
    target: PIPELINE_IDS.model,
    type: "fallback",
    evidenceLevel: "observed",
  });
}

function completeSpine(state: BinderState, event: AgentRunEvent) {
  const ids = [
    PIPELINE_IDS.boot, PIPELINE_IDS.user, PIPELINE_IDS.task, PIPELINE_IDS.hook, PIPELINE_IDS.skillCheck,
    PIPELINE_IDS.loop, PIPELINE_IDS.compact, PIPELINE_IDS.context,
    PIPELINE_IDS.router, PIPELINE_IDS.model, PIPELINE_IDS.toolChoice, PIPELINE_IDS.toolHook, PIPELINE_IDS.tools,
    PIPELINE_IDS.mcp, PIPELINE_IDS.toolResults, PIPELINE_IDS.permissions, PIPELINE_IDS.verification,
  ];
  for (const id of ids) completeIfActive(state, id, event);
  completeIfActive(state, PIPELINE_IDS.orchestrator, event);
  if (state.nodes.get(PIPELINE_IDS.orchestrator)?.status === "idle") skipBranch(state, PIPELINE_IDS.orchestrator);
  for (const node of state.nodes.values()) {
    if (node.metadata?.kind === "context-slice" && node.status === "idle") markSkipped(state, node.id);
    if (node.metadata?.kind === "context-stage" && node.status === "idle") markSkipped(state, node.id);
    if (node.id === PIPELINE_IDS.mcp && node.status === "idle") markSkipped(state, node.id);
    if (node.type === "mcp_server" && node.status === "idle") markSkipped(state, node.id);
    if (node.id === PIPELINE_IDS.compact && node.status === "idle") markSkipped(state, node.id);
    if (node.id === PIPELINE_IDS.recovery && node.status === "idle") markSkipped(state, node.id);
    if (node.id === PIPELINE_IDS.permissions && node.status === "idle") markSkipped(state, node.id);
    if (node.id === PIPELINE_IDS.toolResults && node.status === "idle") markSkipped(state, node.id);
    if (node.id === PIPELINE_IDS.toolChoice && node.status === "idle") markSkipped(state, node.id);
    if (node.id === PIPELINE_IDS.toolHook && node.status === "idle") markSkipped(state, node.id);
    if (node.id === PIPELINE_IDS.skillCheck && node.status === "idle") markSkipped(state, node.id);
  }
  for (const id of PIPELINE_FILET_BRANCH_IDS) {
    completeIfActive(state, id, event);
    if (state.nodes.get(id)?.status === "idle") markSkipped(state, id);
  }
  for (const id of PIPELINE_PROCESS_PHASE_IDS) {
    completeIfActive(state, id, event);
    if (state.nodes.get(id)?.status === "idle") markSkipped(state, id);
  }
}

function isFailedTool(output: unknown) {
  if (!output || typeof output !== "object") return false;
  const record = output as { ok?: unknown; success?: unknown; error?: unknown };
  if (record.ok === false || record.success === false) return true;
  if (typeof record.error === "string" && record.error) return true;
  if (record.error && typeof record.error === "object") return true;
  return false;
}
