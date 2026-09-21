import { describe, expect, it } from "vitest";
import { bindPipeline } from "../PipelineBinder";
import { focusedGraph } from "../graphFocus";
import {
  idlePipelineGraph,
  PIPELINE_IDS,
  PIPELINE_MCP_SERVERS,
  isEngineLayer,
} from "../pipelineSchema";
import type { AgentRunEvent } from "../events";
import type { AgentEvent } from "../../agent/types";

function event(sequence: number, payload: AgentEvent, runId = "run-1"): AgentRunEvent {
  return {
    id: `e${sequence}`,
    runId,
    timestamp: sequence * 1000,
    sequence,
    type: payload.type,
    payload,
  };
}

const started: AgentEvent = {
  type: "started",
  requestId: "run-1",
  messageId: "m1",
  model: "laguna",
  userMessage: { id: "u1", role: "user", content: "Add auth", timestamp: 1 },
};

describe("PipelineBinder", () => {
  it("shows harness spine, box filets, and engine children when idle", () => {
    const idle = idlePipelineGraph();
    const bound = bindPipeline([]);
    expect(bound.nodes.length).toBe(idle.nodes.length);
    expect(bound.nodes.some((node) => node.id === PIPELINE_IDS.boot)).toBe(true);
    expect(bound.nodes.some((node) => node.id === PIPELINE_IDS.knowledgeReflect)).toBe(true);
    expect(bound.nodes.some((node) => node.id === PIPELINE_IDS.skillCheck)).toBe(true);
    expect(bound.nodes.some((node) => node.id === PIPELINE_IDS.explain)).toBe(true);
    expect(bound.nodes.some((node) => node.id === PIPELINE_IDS.bug)).toBe(true);
    expect(bound.nodes.some((node) => node.id === PIPELINE_IDS.build)).toBe(true);
    expect(bound.nodes.some((node) => node.id === PIPELINE_IDS.designGate)).toBe(true);
    expect(bound.nodes.find((node) => node.id === PIPELINE_IDS.skillCheck)?.parentId).toBe(PIPELINE_IDS.loop);
    expect(bound.nodes.find((node) => node.id === PIPELINE_IDS.model)?.parentId).toBe(PIPELINE_IDS.loop);
    expect(isEngineLayer(bound.nodes.find((node) => node.id === PIPELINE_IDS.model)!)).toBe(true);
    expect(isEngineLayer(bound.nodes.find((node) => node.id === PIPELINE_IDS.skillCheck)!)).toBe(false);
    expect(bound.nodes.find((node) => node.id === PIPELINE_IDS.brainstorming)?.metadata?.kind).toBe("process-phase");
    expect(bound.nodes.find((node) => node.id === PIPELINE_IDS.build)?.metadata?.kind).toBe("filet-branch");
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.skillCheck && edge.target === PIPELINE_IDS.router)).toBe(false);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.skillCheck && edge.target === PIPELINE_IDS.explain)).toBe(true);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.skillCheck && edge.target === PIPELINE_IDS.bug)).toBe(true);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.skillCheck && edge.target === PIPELINE_IDS.build)).toBe(true);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.debugging && edge.target === PIPELINE_IDS.worktree)).toBe(false);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.brainstorming && edge.target === PIPELINE_IDS.brainstormResearch)).toBe(true);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.brainstormResearch && edge.target === PIPELINE_IDS.designGate)).toBe(true);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.brainstorming && edge.target === PIPELINE_IDS.designGate)).toBe(false);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.designGate && edge.target === PIPELINE_IDS.writingPlans)).toBe(true);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.designGate && edge.target === PIPELINE_IDS.worktree)).toBe(false);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.writingPlans && edge.target === PIPELINE_IDS.planResearch)).toBe(true);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.planResearch && edge.target === PIPELINE_IDS.worktree)).toBe(true);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.writingPlans && edge.target === PIPELINE_IDS.worktree)).toBe(false);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.writingPlans && edge.target === PIPELINE_IDS.executingPlans)).toBe(false);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.worktree && edge.target === PIPELINE_IDS.executingPlans)).toBe(true);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.executingPlans && edge.target === PIPELINE_IDS.tdd)).toBe(true);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.tdd && edge.target === PIPELINE_IDS.verificationBeforeCompletion)).toBe(true);
    expect(bound.edges.some((edge) => edge.source === PIPELINE_IDS.verificationBeforeCompletion && edge.target === PIPELINE_IDS.finishing)).toBe(true);
    expect(bound.edges.some((edge) => edge.type === "loop" && edge.source === PIPELINE_IDS.review && edge.target === PIPELINE_IDS.executingPlans)).toBe(false);
    expect(bound.nodes.every((node) => node.status === "idle")).toBe(true);
  });

  it("packs filets on overview and keeps streamText for the AgentLoop drill", () => {
    const idle = idlePipelineGraph();
    const visible = focusedGraph(idle.nodes, idle.edges, []);
    expect(visible.nodes.some((node) => node.id === PIPELINE_IDS.skillCheck)).toBe(true);
    expect(visible.nodes.some((node) => node.id === PIPELINE_IDS.build)).toBe(true);
    expect(visible.nodes.some((node) => node.id === PIPELINE_IDS.brainstorming)).toBe(true);
    expect(visible.nodes.some((node) => node.id === PIPELINE_IDS.model)).toBe(false);
    expect(visible.nodes.some((node) => node.id === PIPELINE_IDS.loop)).toBe(true);
    expect(visible.nodes.some((node) => node.id === PIPELINE_IDS.knowledgeReflect)).toBe(true);
    const engine = focusedGraph(idle.nodes, idle.edges, [{ id: PIPELINE_IDS.loop, label: "AgentLoop" }]);
    expect(engine.nodes.some((node) => node.id === PIPELINE_IDS.model)).toBe(true);
    expect(engine.nodes.some((node) => node.id === PIPELINE_IDS.brainstorming)).toBe(false);
  });

  it("lights Build and skips the Bug tree on workflow-started with goalKind build", () => {
    const graph = bindPipeline([
      event(1, { type: "task-started", taskId: "t1", title: "todo" }),
      event(2, {
        type: "workflow-started",
        runId: "run-1",
        workflowId: "agent-loop",
        complexity: "medium",
        stepIds: ["act"],
        goalKind: "build",
      }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.build)?.status).toBe("running");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.bug)?.status).toBe("skipped");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.debugging)?.status).toBe("skipped");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.explain)?.status).toBe("skipped");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.brainstorming)?.status).toBe("idle");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.loop)?.status).toBe("running");
  });

  it("lights Bug and skips worktree / plans / executing-plans on goalKind bug", () => {
    const graph = bindPipeline([
      event(1, {
        type: "workflow-started",
        runId: "run-1",
        workflowId: "agent-loop",
        complexity: "simple",
        stepIds: ["act"],
        goalKind: "bug",
      }),
      event(2, { type: "skill-loaded", skillId: "systematic-debugging", name: "systematic-debugging" }),
      event(3, { type: "completed", requestId: "run-1", messageId: "m1", model: "laguna" }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.bug)?.status).not.toBe("idle");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.debugging)?.status).not.toBe("idle");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.build)?.status).toBe("skipped");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.worktree)?.status).toBe("skipped");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.writingPlans)?.status).toBe("skipped");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.planResearch)?.status).toBe("skipped");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.executingPlans)?.status).toBe("skipped");
  });

  it("does not skip the goalKind filet on noneApply", () => {
    const graph = bindPipeline([
      event(1, {
        type: "workflow-started",
        runId: "run-1",
        workflowId: "agent-loop",
        complexity: "simple",
        stepIds: ["act"],
        goalKind: "explain",
      }),
      event(2, { type: "skill-check", considered: ["brainstorming"], noneApply: true }),
      event(3, { type: "completed", requestId: "run-1", messageId: "m1", model: "laguna" }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.skillCheck)?.status).toBe("completed");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.explain)?.status).not.toBe("skipped");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.brainstorming)?.status).toBe("skipped");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.tdd)?.status).toBe("skipped");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.orchestrator)?.status).toBe("skipped");
  });

  it("does not complete skill-check on workflow-started alone", () => {
    const graph = bindPipeline([
      event(1, { type: "task-started", taskId: "t1", title: "rename" }),
      event(2, {
        type: "workflow-started",
        runId: "run-1",
        workflowId: "agent-loop",
        complexity: "simple",
        stepIds: ["act"],
        goalKind: "other",
      }),
      event(3, started),
      event(4, { type: "completed", requestId: "run-1", messageId: "m1", model: "laguna" }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.skillCheck)?.status).toBe("skipped");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.loop)?.status).not.toBe("idle");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.orchestrator)?.status).toBe("skipped");
  });

  it("completes design-gate on approval and lights the build path", () => {
    const graph = bindPipeline([
      event(1, {
        type: "workflow-started",
        runId: "run-1",
        workflowId: "agent-loop",
        complexity: "medium",
        stepIds: ["act"],
        goalKind: "build",
      }),
      event(2, { type: "skill-loaded", skillId: "brainstorming", name: "brainstorming" }),
      event(3, { type: "design-gate", reason: "approved", tool: "ask_user_question" }),
      event(4, { type: "plan-written", path: "docs/superpowers/plans/todo.md" }),
      event(5, { type: "branch-created", branch: "kursor-feat", base: "main" }),
      event(6, { type: "subagent-task-started", taskId: "t-impl", agentId: "implement", title: "Task 1" }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.brainstorming)?.status).toBe("completed");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.designGate)?.status).toBe("completed");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.designGate)?.metadata?.designApproved).toBe(true);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.worktree)?.status).toBe("completed");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.writingPlans)?.status).toBe("completed");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.executingPlans)?.status).toBe("running");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.bug)?.status).toBe("skipped");
  });

  it("lights executing-plans without lighting research phases", () => {
    const graph = bindPipeline([
      event(1, started),
      event(2, { type: "skill-loaded", skillId: "executing-plans", name: "executing-plans" }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.executingPlans)?.status).toBe("running");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.brainstormResearch)?.status).toBe("idle");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.build)?.status).toBe("running");
  });

  it("lights subagents on implement spawn without a classifyTask fork", () => {
    const graph = bindPipeline([
      event(1, { type: "task-started", taskId: "t1", title: "auth" }),
      event(2, { type: "subagent-task-started", taskId: "t-impl", agentId: "implement", title: "Task 1" }),
      event(3, { type: "agent-started", runId: "run-1", agentId: "implement", name: "Implement" }),
      event(4, {
        type: "agent-completed",
        runId: "run-1",
        agentId: "implement",
        name: "Implement",
        report: { agentId: "implement", summary: "ok", findings: [], filesChanged: [], tests: [], issues: [] },
      }),
      event(5, { type: "subagent-task-completed", taskId: "t-impl", agentId: "implement" }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.orchestrator)?.status).not.toBe("skipped");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.specialist("implement"))?.status).toBe("completed");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.loop)?.status).not.toBe("idle");
  });

  it("annotates the model node on fallback", () => {
    const graph = bindPipeline([
      event(1, started),
      event(2, { type: "fallback", fromModel: "Laguna", toModel: "Ling", reason: "timeout" }),
    ]);
    const model = graph.nodes.find((node) => node.id === PIPELINE_IDS.model);
    expect(model?.metadata?.model).toBe("Ling");
    expect(graph.edges.some((edge) => edge.type === "fallback")).toBe(true);
    expect(graph.run.fallbackCount).toBe(1);
  });

  it("keeps a verification repair loop back to the model", () => {
    const graph = bindPipeline([
      event(1, started),
      event(2, { type: "verification-started", requestId: "run-1" }),
      event(3, {
        type: "verification-completed",
        requestId: "run-1",
        ok: false,
        blockers: ["TS2307"],
        commands: ["pnpm test"],
        attempt: 1,
      }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.verification)?.status).toBe("failed");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.model)?.status).toBe("running");
    expect(graph.edges.some((edge) => (
      edge.type === "loop" && edge.source === PIPELINE_IDS.verification && edge.target === PIPELINE_IDS.model
    ))).toBe(true);
  });

  it("keeps stable pipeline ids across replays", () => {
    const events = [
      event(1, { type: "task-started", taskId: "t1", title: "auth" }),
      event(2, {
        type: "workflow-started",
        runId: "run-1",
        workflowId: "agent-loop",
        complexity: "medium",
        stepIds: ["act"],
        goalKind: "build",
      }),
      event(3, started),
    ];
    const first = bindPipeline(events);
    const second = bindPipeline(events);
    expect(first.nodes.map((node) => node.id).sort()).toEqual(second.nodes.map((node) => node.id).sort());
    expect(first.nodes.some((node) => node.id === PIPELINE_IDS.designGate)).toBe(true);
    expect(first.nodes.some((node) => node.id === PIPELINE_IDS.explain)).toBe(true);
  });

  it("lights context stages on context-assembled and skips unused compact", () => {
    const graph = bindPipeline([
      event(1, started),
      event(2, {
        type: "context-assembled",
        tokensUsed: 400,
        trace: [{ source: "conversation", included: true, reason: "selected", tokens: 80 }],
        slices: [{ id: "conversation:0", source: "conversation", tokens: 80, included: true }],
      }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.context)?.status).toBe("completed");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.ctxRank)?.status).toBe("completed");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.compact)?.status).toBe("skipped");
  });

  it("lights Tool results on the Tool Executor return, outside Context Builder", () => {
    const graph = bindPipeline([
      event(1, started),
      event(2, {
        type: "tool-started",
        id: "c1",
        tool: "read_file",
        input: { path: "src/a.ts" },
      }),
      event(3, {
        type: "tool-completed",
        id: "c1",
        tool: "read_file",
        output: { ok: true },
      }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.toolResults)?.status).toBe("completed");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.toolResults)?.parentId).toBe(PIPELINE_IDS.loop);
  });

  it("nests used MCP tools under the matching idle MCP server", () => {
    const graph = bindPipeline([
      event(1, started),
      event(2, {
        type: "tool-started",
        id: "c1",
        tool: "mcp__github__search_issues",
        input: { query: "auth" },
      }),
      event(3, {
        type: "tool-completed",
        id: "c1",
        tool: "mcp__github__search_issues",
        output: { success: true },
      }),
    ]);
    const server = graph.nodes.find((node) => node.id === PIPELINE_IDS.mcpServer("github"));
    const tool = graph.nodes.find((node) => node.type === "mcp_tool");
    expect(server?.parentId).toBe(PIPELINE_IDS.mcp);
    expect(tool?.parentId).toBe(server?.id);
  });

  it("keeps built-in MCP servers idle until a tool is used", () => {
    const graph = bindPipeline([event(1, started)]);
    expect(graph.nodes.filter((node) => node.type === "mcp_server").every((node) => node.status === "idle")).toBe(true);
  });

  it("marks compact completed when compacted fires", () => {
    const graph = bindPipeline([
      event(1, { type: "compacted", summary: "kept the goal", kept: 8, dropped: 12 }),
      event(2, {
        type: "context-assembled",
        tokensUsed: 200,
        trace: [{ source: "rag", included: true, reason: "selected", tokens: 40 }],
        slices: [{ id: "rag:0", source: "rag", tokens: 40, included: true }],
      }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.compact)?.status).toBe("completed");
  });

  it("lights the agent branch from git_branch after writing-plans", () => {
    const graph = bindPipeline([
      event(1, started),
      event(2, { type: "skill-loaded", skillId: "writing-plans", name: "Writing plans" }),
      event(3, { type: "tool-started", id: "c1", tool: "git_branch", input: { action: "create" } }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.worktree)?.status).toBe("running");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.writingPlans)?.status).toBe("completed");
  });

  it("lights finishing from merge-conflicts without deleting the branch node", () => {
    const graph = bindPipeline([
      event(1, started),
      event(2, { type: "skill-loaded", skillId: "finishing-a-development-branch", name: "Finishing" }),
      event(3, { type: "merge-conflicts", branch: "feat", base: "main", files: ["src/App.tsx"] }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.finishing)?.status).toBe("running");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.finishing)?.metadata?.conflicts).toEqual(["src/App.tsx"]);
  });

  it("attaches brainstorming input/output prompts on the phase node", () => {
    const graph = bindPipeline([
      event(1, started),
      event(2, { type: "skill-loaded", skillId: "brainstorming", name: "Brainstorming" }),
      event(3, {
        type: "assistant-message",
        messageId: "m1",
        text: "Design: JWT auth with refresh tokens.",
      }),
      event(4, {
        type: "user-question",
        id: "q1",
        prompt: "Approve this auth design?",
        options: ["yes"],
      }),
      event(5, { type: "design-gate", reason: "approved", tool: "ask_user_question" }),
    ]);
    const brainstorm = graph.nodes.find((node) => node.id === PIPELINE_IDS.brainstorming);
    expect(brainstorm?.metadata?.inputPrompt).toBe("Add auth");
    expect(brainstorm?.metadata?.inputRole).toBe("user");
    expect(brainstorm?.metadata?.outputPrompt).toBe("Approve this auth design?");
    expect(brainstorm?.metadata?.outputRole).toBe("agent");
    const user = graph.nodes.find((node) => node.id === PIPELINE_IDS.user);
    expect(user?.metadata?.outputPrompt).toBe("Add auth");
  });

  it("keeps Knowledge reflect idle after completed until a reflect event", () => {
    const graph = bindPipeline([
      event(1, started),
      event(2, { type: "completed", requestId: "run-1", messageId: "m1", model: "laguna" }),
    ]);
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.knowledgeReflect)?.status).toBe("idle");
    expect(graph.nodes.find((node) => node.id === PIPELINE_IDS.result)?.status).toBe("completed");
    expect(graph.edges.some((edge) => edge.source === PIPELINE_IDS.result && edge.target === PIPELINE_IDS.knowledgeReflect)).toBe(true);
  });

  it("skips Knowledge reflect with a reason", () => {
    const graph = bindPipeline([
      event(1, started),
      event(2, { type: "completed", requestId: "run-1", messageId: "m1", model: "laguna" }),
      event(3, { type: "knowledge-reflect-skipped", runId: "run-1", reason: "trivial" }),
    ]);
    const node = graph.nodes.find((item) => item.id === PIPELINE_IDS.knowledgeReflect);
    expect(node?.status).toBe("skipped");
    expect(node?.metadata?.reason).toBe("trivial");
    expect(node?.metadata?.skipped).toBe(true);
    expect(graph.nodes.find((item) => item.id === PIPELINE_IDS.result)?.status).toBe("completed");
  });

  it("completes Knowledge reflect with skill and spec counts", () => {
    const graph = bindPipeline([
      event(1, started),
      event(2, { type: "completed", requestId: "run-1", messageId: "m1", model: "laguna" }),
      event(3, { type: "knowledge-reflect-started", runId: "run-1" }),
      event(4, {
        type: "knowledge-reflect-completed",
        runId: "run-1",
        proposalId: "kp-1",
        summary: "Capture JWT procedure",
        skillCount: 1,
        specCount: 2,
      }),
    ]);
    const node = graph.nodes.find((item) => item.id === PIPELINE_IDS.knowledgeReflect);
    expect(node?.status).toBe("completed");
    expect(node?.metadata).toMatchObject({
      summary: "Capture JWT procedure",
      skillCount: 1,
      specCount: 2,
      proposalId: "kp-1",
      chatItemId: "knowledge:kp-1",
    });
  });
});
