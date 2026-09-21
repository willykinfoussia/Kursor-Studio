export type AgentRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentGraphNodeStatus =
  | "idle"
  | "pending"
  | "skipped"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentGraphNodeType =
  | "user_prompt"
  | "task"
  | "agent"
  | "planning"
  | "brainstorm"
  | "reasoning_summary"
  | "context"
  | "memory"
  | "rag"
  | "skill"
  | "tool"
  | "tool_group"
  | "command"
  | "file"
  | "git"
  | "web_search"
  | "web_page"
  | "mcp_server"
  | "mcp_tool"
  | "mcp_resource"
  | "mcp_prompt"
  | "verification"
  | "error"
  | "fallback"
  | "approval"
  | "checkpoint"
  | "subagent"
  | "result"
  | "review";

export type AgentGraphEdgeType =
  | "sequence"
  | "dependency"
  | "input"
  | "output"
  | "context"
  | "causal"
  | "delegation"
  | "recovery"
  | "fallback"
  | "loop";

export type EvidenceLevel = "observed" | "derived" | "inferred";

export type RunPhase =
  | "understanding"
  | "planning"
  | "implementation"
  | "verification"
  | "recovery"
  | "completion";

export type GraphLayoutName = "dag" | "tree" | "radial";

export type GraphFilterCategory =
  | "agents"
  | "tasks"
  | "tools"
  | "files"
  | "context"
  | "memory"
  | "rag"
  | "skills"
  | "git"
  | "verification"
  | "errors"
  | "models"
  | "approvals"
  | "results"
  | "mcp";

export interface GraphEvidence {
  sourceType: "prompt" | "file" | "memory" | "rag" | "tool" | "skill" | "model";
  sourceId: string;
  description: string;
  confidence: number;
}

export interface AgentRun {
  id: string;
  accountId: string;
  projectId: string;
  conversationId?: string;
  agentId: string;
  status: AgentRunStatus;
  startedAt: number;
  finishedAt?: number;
  model?: string;
  totalSteps: number;
  totalToolCalls: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  title?: string;
  fallbackCount?: number;
}

export interface AgentGraphNode {
  id: string;
  runId: string;
  type: AgentGraphNodeType;
  label: string;
  status: AgentGraphNodeStatus;
  timestamp: number;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  sequence?: number;
  parentId?: string;
  phase?: RunPhase;
  metadata?: Record<string, unknown>;
}

export interface AgentGraphEdge {
  id: string;
  runId: string;
  source: string;
  target: string;
  type: AgentGraphEdgeType;
  label?: string;
  confidence?: number;
  evidenceLevel?: EvidenceLevel;
  evidence?: GraphEvidence[];
  metadata?: Record<string, unknown>;
}

export interface ProjectedGraph {
  run: AgentRun;
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  lastSequence: number;
  structural: boolean;
}

export interface RunDataSource {
  getRun(runId: string): Promise<AgentRun>;
  getNodes(runId: string): Promise<AgentGraphNode[]>;
  getEdges(runId: string): Promise<AgentGraphEdge[]>;
}

export const DEFAULT_GRAPH_FILTERS: Record<GraphFilterCategory, boolean> = {
  agents: true,
  tasks: true,
  tools: true,
  files: true,
  context: true,
  memory: true,
  rag: true,
  skills: true,
  git: true,
  verification: true,
  errors: true,
  models: true,
  approvals: true,
  results: true,
  mcp: true,
};

export const FILTER_NODE_TYPES: Record<GraphFilterCategory, readonly AgentGraphNodeType[]> = {
  agents: ["agent", "subagent"],
  tasks: ["task", "planning", "brainstorm"],
  tools: ["tool", "tool_group", "command", "web_search", "web_page"],
  files: ["file"],
  context: ["context"],
  memory: ["memory"],
  rag: ["rag"],
  skills: ["skill"],
  git: ["git"],
  verification: ["verification"],
  errors: ["error"],
  models: ["fallback"],
  approvals: ["approval"],
  results: ["result", "user_prompt", "checkpoint", "review"],
  mcp: ["mcp_server", "mcp_tool", "mcp_resource", "mcp_prompt"],
};
