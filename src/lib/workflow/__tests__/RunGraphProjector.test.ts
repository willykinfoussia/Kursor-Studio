import { describe, expect, it } from "vitest";
import { applyGraphFilters } from "../GraphFilters";
import { nodeIdForPrompt, nodeIdForTask, nodeIdForTool, nodeMatchesChatItem, shortRunId } from "../GraphSelection";
import { projectRun, projectRunIncremental, RunGraphProjector } from "../RunGraphProjector";
import { searchGraphNodes } from "../GraphSearch";
import type { AgentRunEvent } from "../events";
import type { AgentEvent } from "../../agent/types";
import { DEFAULT_GRAPH_FILTERS } from "../types";

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

const prompt: AgentEvent = {
  type: "started",
  requestId: "run-1",
  messageId: "m1",
  model: "laguna",
  userMessage: { id: "u1", role: "user", content: "Add auth", timestamp: 1 },
};

describe("RunGraphProjector", () => {
  it("creates a user prompt node from run-started", () => {
    const graph = projectRun([event(1, prompt)]);
    expect(graph.nodes.some((node) => node.id === nodeIdForPrompt("u1"))).toBe(true);
    expect(graph.nodes.some((node) => node.type === "agent")).toBe(true);
    expect(graph.edges.some((edge) => edge.type === "sequence")).toBe(true);
    expect(graph.run.model).toBe("laguna");
  });

  it("marks a tool running then completed", () => {
    const graph = projectRun([
      event(1, prompt),
      event(2, { type: "tool-started", id: "t1", tool: "read_file", input: { path: "src/App.tsx" } }),
      event(3, { type: "tool-completed", id: "t1", tool: "read_file", output: { ok: true, data: "hi" } }),
    ]);
    const tool = graph.nodes.find((node) => node.id === nodeIdForTool("t1"));
    expect(tool?.status).toBe("completed");
    expect(tool?.type).toBe("file");
    expect(tool?.metadata?.filePath).toBe("src/App.tsx");
    expect(tool?.metadata?.capabilityId).toBe("builtin.tool.read_file");
    expect(tool?.metadata?.capabilityType).toBe("tool");
    expect(graph.run.totalToolCalls).toBe(1);
  });

  it("creates an error node from error events", () => {
    const graph = projectRun([
      event(1, prompt),
      event(2, { type: "error", requestId: "run-1", message: "provider down" }),
    ]);
    expect(graph.nodes.some((node) => node.type === "error" && node.label.includes("provider"))).toBe(true);
    expect(graph.run.status).toBe("failed");
  });

  it("adds a fallback edge between models", () => {
    const graph = projectRun([
      event(1, prompt),
      event(2, { type: "fallback", fromModel: "Laguna", toModel: "Ling", reason: "timeout" }),
    ]);
    expect(graph.edges.some((edge) => edge.type === "fallback")).toBe(true);
    expect(graph.nodes.some((node) => node.type === "fallback")).toBe(true);
    expect(graph.run.model).toBe("Ling");
  });

  it("projects verification and a recovery path after failure", () => {
    const graph = projectRun([
      event(1, prompt),
      event(2, { type: "verification-started", requestId: "run-1" }),
      event(3, {
        type: "verification-completed",
        requestId: "run-1",
        ok: false,
        blockers: ["TypeScript TS2307"],
        commands: ["pnpm test"],
        attempt: 1,
      }),
      event(4, { type: "tool-started", id: "fix-1", tool: "write_file", input: { path: "src/a.ts" } }),
    ]);
    expect(graph.nodes.some((node) => node.type === "verification")).toBe(true);
    expect(graph.nodes.some((node) => node.type === "error")).toBe(true);
    expect(graph.edges.some((edge) => edge.type === "recovery")).toBe(true);
  });

  it("uses observed input edges for included context slices", () => {
    const graph = projectRun([
      event(1, prompt),
      event(2, {
        type: "context-assembled",
        tokensUsed: 120,
        trace: [{ source: "memory", included: true, reason: "match", tokens: 20 }],
        slices: [{ id: "memory:0:m1", source: "memory", tokens: 20, included: true, meta: { memoryType: "architecture" } }],
      }),
    ]);
    expect(graph.nodes.some((node) => node.type === "context")).toBe(true);
    expect(graph.nodes.some((node) => node.type === "memory")).toBe(true);
    expect(graph.edges.some((edge) => edge.type === "input" && edge.evidenceLevel === "observed")).toBe(true);
  });

  it("projects parallel subagents onto distinct task nodes", () => {
    const graph = projectRun([
      event(1, prompt),
      event(2, { type: "agent-started", runId: "run-1", agentId: "explore", name: "KEEP map", taskId: "task-a" }),
      event(3, { type: "agent-started", runId: "run-1", agentId: "explore", name: "EXTEND map", taskId: "task-b" }),
    ]);
    expect(graph.nodes.some((node) => node.id === nodeIdForTask("task-a"))).toBe(true);
    expect(graph.nodes.some((node) => node.id === nodeIdForTask("task-b"))).toBe(true);
  });

  it("projects delegation to a subagent", () => {
    const graph = projectRun([
      event(1, prompt),
      event(2, { type: "orchestration-started", runId: "run-1", goal: "auth", complexity: "medium", agentIds: ["coding"] }),
      event(3, { type: "agent-started", runId: "run-1", agentId: "coding", name: "Coding" }),
    ]);
    expect(graph.nodes.some((node) => node.type === "subagent")).toBe(true);
    expect(graph.edges.some((edge) => edge.type === "delegation")).toBe(true);
  });

  it("ignores text-delta for layout", () => {
    const projector = new RunGraphProjector("run-1", 0);
    projector.ingest(event(1, prompt));
    const structural = projector.ingest(event(2, { type: "text-delta", messageId: "m1", text: "secret chain" }));
    expect(structural).toBe(false);
    expect(projector.snapshot().nodes.some((node) => String(node.label).includes("secret"))).toBe(false);
  });

  it("attaches capabilityId on skill and mcp tool nodes", () => {
    const graph = projectRun([
      event(1, prompt),
      event(2, { type: "skill-selected", skillId: "prefer-const", name: "prefer-const", version: "1.0" }),
      event(3, { type: "tool-started", id: "t2", tool: "mcp__github__search_issues", input: { query: "auth" } }),
    ]);
    const skill = graph.nodes.find((node) => node.type === "skill");
    const mcpTool = graph.nodes.find((node) => node.type === "mcp_tool");
    const mcpServer = graph.nodes.find((node) => node.type === "mcp_server");
    expect(skill?.metadata?.capabilityId).toBe("builtin.skill.prefer-const");
    expect(mcpTool?.metadata?.capabilityId).toBe("mcp.github.tool.search_issues");
    expect(mcpServer?.metadata?.capabilityId).toBe("mcp.github");
  });
});

describe("GraphFilters", () => {
  it("hides tools and shortcuts A to B without mutating the source graph", () => {
    const graph = projectRun([
      event(1, prompt),
      event(2, { type: "tool-started", id: "t1", tool: "read_file", input: { path: "a.ts" } }),
      event(3, { type: "tool-completed", id: "t1", tool: "read_file", output: { ok: true } }),
      event(4, { type: "completed", requestId: "run-1", messageId: "m1", model: "laguna" }),
    ]);
    const originalEdgeCount = graph.edges.length;
    const originalNodeCount = graph.nodes.length;
    const filtered = applyGraphFilters(graph, { ...DEFAULT_GRAPH_FILTERS, tools: false, files: false });
    expect(filtered.nodes.some((node) => node.type === "file" || node.type === "tool")).toBe(false);
    expect(graph.nodes).toHaveLength(originalNodeCount);
    expect(graph.edges).toHaveLength(originalEdgeCount);
    const promptNode = graph.nodes.find((node) => node.type === "user_prompt");
    const resultNode = graph.nodes.find((node) => node.type === "result");
    expect(promptNode && resultNode).toBeTruthy();
    expect(filtered.edges.some((edge) => edge.source === promptNode?.id && edge.target === resultNode?.id) || filtered.edges.some((edge) => (
      edge.source.includes("agent") || edge.source.includes("user_prompt")
    ))).toBe(true);
  });
});

describe("GraphSelection", () => {
  it("keeps stable ids for chat and editor bridges", () => {
    expect(nodeIdForTool("abc")).toBe("tool:abc");
    expect(shortRunId("a821xxxx")).toBe("A821");
    const graph = projectRun([
      event(1, prompt),
      event(2, { type: "tool-started", id: "t1", tool: "read_file", input: { path: "src/App.tsx" } }),
      event(3, { type: "verification-started", requestId: "run-1" }),
      event(4, { type: "fallback", fromModel: "Laguna", toModel: "Ling", reason: "timeout" }),
    ]);
    const tool = graph.nodes.find((node) => node.id === nodeIdForTool("t1"));
    const verification = graph.nodes.find((node) => node.type === "verification");
    const fallback = graph.nodes.find((node) => node.type === "fallback");
    expect(tool && nodeMatchesChatItem(tool, "tool:t1")).toBe(true);
    expect(verification && nodeMatchesChatItem(verification, "verification:run-1:done")).toBe(true);
    expect(fallback && nodeMatchesChatItem(fallback, "fallback:Laguna:Ling")).toBe(true);
  });
});

describe("GraphSearch", () => {
  it("matches label, tool path, skill and error", () => {
    const graph = projectRun([
      event(1, prompt),
      event(2, {
        type: "context-assembled",
        tokensUsed: 40,
        trace: [{ source: "skill", included: true, reason: "auth", tokens: 12 }],
        slices: [{ id: "skill:auth", source: "skill", tokens: 12, included: true, meta: { name: "auth-flow" } }],
      }),
      event(3, { type: "tool-started", id: "t1", tool: "read_file", input: { path: "src/App.tsx" } }),
      event(4, { type: "error", requestId: "run-1", message: "provider down" }),
    ]);
    expect(searchGraphNodes(graph.nodes, "App.tsx").some((hit) => hit.nodeId === nodeIdForTool("t1"))).toBe(true);
    expect(searchGraphNodes(graph.nodes, "auth-flow").some((hit) => hit.type === "skill")).toBe(true);
    expect(searchGraphNodes(graph.nodes, "error").some((hit) => hit.type === "error")).toBe(true);
    expect(searchGraphNodes(graph.nodes, "laguna").some((hit) => hit.type === "agent" || hit.type === "user_prompt")).toBe(true);
  });
});

describe("RunGraphProjector incremental", () => {
  it("appends without rebuilding earlier nodes", () => {
    const projector = new RunGraphProjector("run-1", 0);
    projector.ingest(event(1, prompt));
    const next = projectRunIncremental([
      event(1, prompt),
      event(2, { type: "tool-started", id: "t1", tool: "read_file", input: { path: "a.ts" } }),
    ], { projector, sequence: 1, runId: "run-1" });
    expect(next.graph.nodes.some((node) => node.id === nodeIdForPrompt("u1"))).toBe(true);
    expect(next.graph.nodes.some((node) => node.id === nodeIdForTool("t1"))).toBe(true);
  });
});

describe("RunGraphProjector MCP", () => {
  it("nests mcp_tool under mcp_server", () => {
    const graph = projectRun([
      event(1, prompt),
      event(2, { type: "tool-started", id: "t1", tool: "mcp__github__search_issues", input: { query: "auth" } }),
      event(3, { type: "tool-completed", id: "t1", tool: "mcp__github__search_issues", output: { success: true } }),
    ]);
    expect(graph.nodes.some((node) => node.type === "mcp_server")).toBe(true);
    expect(graph.nodes.some((node) => node.type === "mcp_tool" && node.parentId === "mcp-server:github")).toBe(true);
  });
});
