import { PIPELINE_AGENT_IDS } from "../agent/agents/types";
import type { ContextSourceId } from "../agent/context/types";
import type { GoalKind } from "../agent/workflow/sessionState";
import { builtInMcpRegistry } from "../mcp/builtin/registry";
import { mcpServerCapabilityId } from "../capabilities/ids";
import type { AgentGraphEdge, AgentGraphNode, AgentGraphNodeType } from "./types";

export const PIPELINE_IDS = {
  boot: "pipeline:boot",
  user: "pipeline:user",
  task: "pipeline:task",
  hook: "pipeline:hook",
  skillCheck: "pipeline:skill-check",
  orchestrator: "pipeline:orchestrator",
  loop: "pipeline:loop",
  compact: "pipeline:compact",
  context: "pipeline:context",
  ctxRank: "pipeline:ctx:rank",
  ctxCaps: "pipeline:ctx:caps",
  ctxBudget: "pipeline:ctx:budget",
  ctxAssemble: "pipeline:ctx:assemble",
  router: "pipeline:router",
  model: "pipeline:model",
  toolChoice: "pipeline:tool-choice",
  toolHook: "pipeline:tool-hook",
  permissions: "pipeline:permissions",
  tools: "pipeline:tools",
  mcp: "pipeline:mcp",
  toolResults: "pipeline:tool-results",
  verification: "pipeline:verification",
  recovery: "pipeline:recovery",
  result: "pipeline:result",
  knowledgeReflect: "pipeline:knowledge-reflect",
  memory: "pipeline:ctx:memory",
  rag: "pipeline:ctx:rag",
  skill: "pipeline:ctx:skill",
  explain: "pipeline:branch:explain",
  bug: "pipeline:branch:bug",
  build: "pipeline:branch:build",
  designGate: "pipeline:gate:design",
  debugging: "pipeline:phase:debugging",
  brainstorming: "pipeline:phase:brainstorming",
  worktree: "pipeline:phase:worktree",
  writingPlans: "pipeline:phase:writing-plans",
  brainstormResearch: "pipeline:phase:brainstorm-research",
  planResearch: "pipeline:phase:plan-research",
  executingPlans: "pipeline:phase:executing-plans",
  tdd: "pipeline:phase:tdd",
  review: "pipeline:phase:review",
  verificationBeforeCompletion: "pipeline:phase:verification-before-completion",
  finishing: "pipeline:phase:finishing",
  step: (id: string) => `pipeline:step:${id}`,
  phase: (id: string) => `pipeline:phase:${id}`,
  specialist: (id: string) => `pipeline:agent:${id}`,
  specialistPart: (id: string, part: string) => `pipeline:agent:${id}:${part}`,
  tool: (id: string) => `pipeline:tool:${id}`,
  mcpServer: (id: string) => `pipeline:mcp:${id}`,
  slice: (id: string) => `pipeline:ctx:${id}`,
} as const;

export type PipelineNodeKind =
  | "core"
  | "parent"
  | "process-phase"
  | "filet-branch"
  | "workflow-step"
  | "specialist"
  | "context-slice"
  | "context-stage";

export type PipelineLayer = "engine" | "box";

export const PIPELINE_CONTEXT_SOURCES: { id: ContextSourceId; label: string; type: AgentGraphNodeType; role: string }[] = [
  {
    id: "conversation",
    label: "Conversation",
    type: "user_prompt",
    role: "Last user message is userRequest (never dropped). Last 6 messages are recent. Compact [session-compact] stays. Cap 30.",
  },
  {
    id: "project",
    label: "Project",
    type: "file",
    role: "Name, root, GitHub, account line, and the running task. Skip if no project.",
  },
  {
    id: "editor",
    label: "Editor",
    type: "file",
    role: "Open tab list plus current file content, clipped to maxFileChars.",
  },
  {
    id: "memory",
    label: "Memory",
    type: "memory",
    role: "retrieveMemories(projectId, request, 6). Prefixed as historical data, not instructions.",
  },
  {
    id: "rag",
    label: "RAG",
    type: "rag",
    role: "Query = last user request. Embed if available + FTS (EMB-001). mergeResults (score + path + recency). Drop chunks of the current file. relevantCode if path is mentioned or open. Clip 1200. Cap 6.",
  },
  {
    id: "git",
    label: "Git",
    type: "git",
    role: "Status always. Diff only if git words in the query or changed files overlap open/mentioned paths. Clip 4000.",
  },
  {
    id: "skill",
    label: "Skills",
    type: "skill",
    role: "SkillRegistry.listForPrompt: builtins + skills/ + .kursor/skills. Full descriptions when catalog ≤ 48, else top-8 detail. Body via /id or load_skill. skill-selected / skill-loaded on invoke. Pin model if exactly one invoked skill has modelPreference. allowedTools become task grants, not AgentLoop filters.",
  },
  {
    id: "rule",
    label: "Rules",
    type: "planning",
    role: "KURSOR.md, AGENTS.md, .kursor/rules, agent overlay, user rules. 8000 char budget. Order in prompt: agent, then project, then user.",
  },
  {
    id: "web",
    label: "Web",
    type: "web_search",
    role: "Documents already fetched this session. No search here. Cap 6.",
  },
  {
    id: "graph",
    label: "Graph",
    type: "file",
    role: "Seeds = mentioned paths + open tabs + current file. graphService.resolveContext. Cap 8.",
  },
];

export const PIPELINE_IDLE_CONTEXT_SOURCES = PIPELINE_CONTEXT_SOURCES;

export const PIPELINE_CONTEXT_STAGES = [
  PIPELINE_IDS.ctxRank,
  PIPELINE_IDS.ctxCaps,
  PIPELINE_IDS.ctxBudget,
  PIPELINE_IDS.ctxAssemble,
] as const;

export function contextSourceById(id: ContextSourceId) {
  return PIPELINE_CONTEXT_SOURCES.find((source) => source.id === id);
}

export interface PipelineTemplateNode {
  id: string;
  type: AgentGraphNodeType;
  label: string;
  role: string;
  position: { x: number; y: number };
  kind: PipelineNodeKind;
  parentId?: string;
  capabilityId?: string;
  mcpServerId?: string;
  drillTarget?: string;
  skillId?: string;
  typicalTools?: string[];
  layer?: PipelineLayer;
}

function core(
  id: string,
  type: AgentGraphNodeType,
  label: string,
  role: string,
  x: number,
  y: number,
  extra?: Partial<PipelineTemplateNode>,
): PipelineTemplateNode {
  return { id, type, label, role, position: { x, y }, kind: extra?.kind ?? "core", ...extra };
}

const CHILD_PAD = 20;
const HEADER_Y = 48;

function processPhase(
  id: string,
  type: AgentGraphNodeType,
  label: string,
  role: string,
  x: number,
  extra: { skillId?: string; typicalTools?: string[] },
  y = HEADER_Y,
): PipelineTemplateNode {
  return {
    id,
    type,
    label,
    role,
    position: { x, y },
    kind: "process-phase",
    parentId: PIPELINE_IDS.loop,
    skillId: extra.skillId,
    typicalTools: extra.typicalTools,
  };
}

function filetBranch(
  id: string,
  type: AgentGraphNodeType,
  label: string,
  role: string,
  x: number,
  y = HEADER_Y,
): PipelineTemplateNode {
  return {
    id,
    type,
    label,
    role,
    position: { x, y },
    kind: "filet-branch",
    parentId: PIPELINE_IDS.loop,
  };
}
const CHILD_GAP_X = 28;
const SPEC_SLOT = 240 + CHILD_GAP_X;
const SLICE_SLOT = 168 + CHILD_GAP_X;
const CTX_STAGE_X = CHILD_PAD + 200;
const CTX_STAGE_SLOT = 210 + CHILD_GAP_X;
const MCP_SLOT = 210 + CHILD_GAP_X;

export const PIPELINE_MCP_SERVERS = builtInMcpRegistry.list().map((definition) => ({
  serverId: definition.serverId,
  label: definition.displayName,
  role: definition.description,
  capabilityId: mcpServerCapabilityId(definition.serverId),
}));

function specialistLoop(id: string): PipelineTemplateNode[] {
  const parentId = PIPELINE_IDS.specialist(id);
  const label = id === "implement" ? "LLM-001-SUB" : id === "review" ? "LLM-001-SUB review" : "LLM-001-SUB explore";
  return [
    core(PIPELINE_IDS.specialistPart(id, "model"), "agent", "streamText", `${label}. Isolated AgentInstance loop after ContextEngine 1×.`, CHILD_PAD, HEADER_Y, { parentId }),
    core(PIPELINE_IDS.specialistPart(id, "perm"), "approval", "LLM-PERM", "Auto-mode classifier inside the subagent loop.", CHILD_PAD + 230, HEADER_Y, { parentId }),
    core(PIPELINE_IDS.specialistPart(id, "tools"), "tool_group", "Tools", id === "implement" ? "write_file / run_command (TDD). Nested under this specialist." : "Read-only tools for this specialist.", CHILD_PAD + 460, HEADER_Y, { kind: "parent", parentId }),
    core(PIPELINE_IDS.specialistPart(id, "verify"), "verification", "Verification", "Post-mutation checks inside the subagent loop when writes succeeded.", CHILD_PAD + 700, HEADER_Y, { parentId }),
  ];
}

export const PIPELINE_TEMPLATE_NODES: PipelineTemplateNode[] = [
  core(PIPELINE_IDS.boot, "skill", "using-superpowers", "Session injects the 1% skill body on the parent. Subagents skip it (SUBAGENT-STOP).", 24, 48),
  core(PIPELINE_IDS.user, "user_prompt", "Prompt", "AgentPanel.send — the user message that starts a run.", 244, 48),
  core(PIPELINE_IDS.task, "task", "Session + Task", "Allocates session, runId, and TaskManager.create before AgentLoop.", 464, 48),
  core(PIPELINE_IDS.hook, "checkpoint", "user_prompt_submit", "Project hook. Deny fails the run immediately.", 684, 48),
  core(PIPELINE_IDS.compact, "checkpoint", "Compact", "Extractive first, then LLM-CMP if still over budget. Runs in runTurn before ContextEngine. Reinject using-superpowers. Skipped when the window fits.", 904, 48),
  core(PIPELINE_IDS.context, "context", "Context Builder", "1× per user message, before AgentLoop. Parallel sources feed Rank, then caps, token budget, assemble. Does not pick tools.", 1124, 48, { kind: "parent" }),
  core(PIPELINE_IDS.loop, "agent", "AgentLoop", "One streamText tool loop per user turn. Filets Superpowers live in this box. Double-click the frame for the runtime (streamText, tools, verify).", 1344, 48, { kind: "parent" }),
  core(PIPELINE_IDS.result, "result", "Result", "completed, failed, or cancelled after the parent loop returns.", 1564, 48),
  core(PIPELINE_IDS.knowledgeReflect, "planning", "Knowledge reflect", "After a successful run, analyze the transcript and auto-apply skill/spec create, update, delete, or reorganize. The chat shows the outcome, including empty or failed reflects.", 1784, 48),

  core(PIPELINE_IDS.skillCheck, "planning", "1% skill check", "First parent-turn tool must be load_skill, check_skills, slash, or ask_user_question. Skipped for subagents, Ask mode, and skipProcess.", CHILD_PAD, HEADER_Y, { parentId: PIPELINE_IDS.loop }),
  filetBranch(PIPELINE_IDS.explain, "checkpoint", "Explain", "goalKind explain / Ask: mutations are denied. Not a Superpowers process skill.", 260, HEADER_Y),
  filetBranch(PIPELINE_IDS.bug, "planning", "Bug", "goalKind bug / Debug mode: load systematic-debugging before patching.", 260, HEADER_Y + 80),
  filetBranch(PIPELINE_IDS.build, "brainstorm", "Build", "goalKind build: HARD-GATE blocks mutations until designApproved.", 260, HEADER_Y + 160),
  processPhase(PIPELINE_IDS.debugging, "planning", "Debugging", "systematic-debugging before any patch. Does not go through the agent branch or plans.", 500, {
    skillId: "systematic-debugging",
    typicalTools: ["load_skill", "read_file", "search_files"],
  }, HEADER_Y + 80),
  processPhase(PIPELINE_IDS.brainstorming, "brainstorm", "Brainstorming", "brainstorming skill on the build path. Mutations stay denied until the human says yes.", 500, {
    skillId: "brainstorming",
    typicalTools: ["load_skill", "ask_user_question"],
  }, HEADER_Y + 160),
  processPhase(PIPELINE_IDS.brainstormResearch, "subagent", "Brainstorm research", "subagent-driven-brainstorming: explore subagents before a design question.", 620, {
    skillId: "subagent-driven-brainstorming",
    typicalTools: ["agent"],
  }, HEADER_Y + 160),
  processPhase(PIPELINE_IDS.designGate, "approval", "HARD-GATE yes", "design-gate approved records designApproved. Then writing-plans may run. The agent branch starts after Build.", 740, {
    typicalTools: ["ask_user_question"],
  }, HEADER_Y + 160),
  processPhase(PIPELINE_IDS.worktree, "git", "Branch", "using-git-worktrees after Build. In-place checkout -b in the open editor; not a .worktrees copy.", 1220, {
    skillId: "using-git-worktrees",
    typicalTools: ["git_branch"],
  }, HEADER_Y + 160),
  processPhase(PIPELINE_IDS.writingPlans, "planning", "Writing plans", "writing-plans after design approval. enter_plan_mode is read-only until the plan is written. implement needs planApproved.", 980, {
    skillId: "writing-plans",
    typicalTools: ["enter_plan_mode", "write_file"],
  }, HEADER_Y + 160),
  processPhase(PIPELINE_IDS.planResearch, "subagent", "Plan research", "subagent-driven-planning: explore subagents before create_plan.", 1100, {
    skillId: "subagent-driven-planning",
    typicalTools: ["agent"],
  }, HEADER_Y + 160),
  processPhase(PIPELINE_IDS.executingPlans, "planning", "Executing plans", "executing-plans: the parent implements after Build. Optional implement subagents; no per-task review orchestration.", 1460, {
    skillId: "executing-plans",
    typicalTools: ["read_file", "write_file", "run_command", "agent"],
  }, HEADER_Y + 160),
  processPhase(PIPELINE_IDS.tdd, "verification", "TDD", "test-driven-development during implementation. The harness engine does not run while a todo is in_progress.", 1700, {
    skillId: "test-driven-development",
    typicalTools: ["run_command"],
  }, HEADER_Y + 80),
  processPhase(PIPELINE_IDS.review, "review", "Review", "requesting-code-review / receiving-code-review. Optional; not a per-task subagent loop.", 1700, {
    skillId: "requesting-code-review",
    typicalTools: ["agent"],
  }, HEADER_Y + 240),
  processPhase(PIPELINE_IDS.verificationBeforeCompletion, "verification", "VBC", "verification-before-completion after every plan todo. Then the harness runs the full check suite.", 1820, {
    skillId: "verification-before-completion",
    typicalTools: ["run_command"],
  }, HEADER_Y + 160),
  processPhase(PIPELINE_IDS.finishing, "result", "Finishing", "finishing-a-development-branch after VBC: verify, then merge (checkout base, list conflicts, continue/abort) / PR / keep / discard.", 1940, {
    skillId: "finishing-a-development-branch",
    typicalTools: ["finish_development_branch"],
  }, HEADER_Y + 160),

  core(PIPELINE_IDS.router, "fallback", "Fallback", "FallbackManager: ordered models, retries, then next provider.", CHILD_PAD, HEADER_Y, { parentId: PIPELINE_IDS.loop, layer: "engine" }),
  core(PIPELINE_IDS.model, "agent", "streamText LLM-001", "Model stream until stopWhen (24 steps / 32 tools). The model sees ToolRegistry.listEnabled() and may emit tool calls.", CHILD_PAD + 250, HEADER_Y, { parentId: PIPELINE_IDS.loop, layer: "engine" }),
  core(PIPELINE_IDS.toolChoice, "planning", "Model tool call", "The model picks a tool name + args from the enabled catalog. Skip if the model replies with text only.", CHILD_PAD + 500, HEADER_Y, { parentId: PIPELINE_IDS.loop, layer: "engine" }),
  core(PIPELINE_IDS.toolHook, "checkpoint", "before_tool", "Hook before each tool. Deny → hook_denied. Then evaluateWorkflowGate (1% / HARD-GATE / executing-plans / TDD / VBC).", CHILD_PAD + 750, HEADER_Y, { parentId: PIPELINE_IDS.loop, layer: "engine" }),
  core(PIPELINE_IDS.permissions, "approval", "LLM-PERM", "After deny/allow rules, auto-mode classifier. Fail-closed to ask_human. YOLO skips it.", CHILD_PAD + 1000, HEADER_Y, { parentId: PIPELINE_IDS.loop, layer: "engine" }),
  core(PIPELINE_IDS.tools, "tool_group", "Tool Executor", "validate → execute after hook and permission. Observed calls nest here.", CHILD_PAD + 1250, HEADER_Y, { kind: "parent", parentId: PIPELINE_IDS.loop, layer: "engine" }),
  core(PIPELINE_IDS.toolResults, "planning", "Tool results", "Completed calls return to streamText and may feed Rank on the next assemble.", CHILD_PAD + 1500, HEADER_Y, { parentId: PIPELINE_IDS.loop, layer: "engine" }),
  core(PIPELINE_IDS.verification, "verification", "VerificationEngine", "At plan-task and plan-done boundaries: typecheck+test once per turn after a completed todo while the plan is open; full suite after VBC when the plan is done. Skip outside a plan, during a task, and for subagents.", CHILD_PAD + 1750, HEADER_Y, { parentId: PIPELINE_IDS.loop, layer: "engine" }),
  core(PIPELINE_IDS.recovery, "error", "Repair LLM-001-VRP", "FAIL injects the report and consumeAttempt. Third FAIL fails the run.", CHILD_PAD + 2000, HEADER_Y, { parentId: PIPELINE_IDS.loop, layer: "engine" }),
  core(PIPELINE_IDS.orchestrator, "agent", "Subagents", "Tool agent on demand. explore during brainstorm/plan research. implement after planApproved + TDD. Not a classifyTask driver.", CHILD_PAD + 2250, HEADER_Y, { kind: "parent", parentId: PIPELINE_IDS.loop, layer: "engine" }),

  ...PIPELINE_IDLE_CONTEXT_SOURCES.map((source, index) => ({
    id: PIPELINE_IDS.slice(source.id),
    type: source.type,
    label: source.label,
    role: source.role,
    position: { x: CHILD_PAD + index * SLICE_SLOT, y: HEADER_Y },
    kind: "context-slice" as const,
    parentId: PIPELINE_IDS.context,
  })),
  core(PIPELINE_IDS.ctxRank, "planning", "Rank", "Sort slices by priority ascending, then score descending. userRequest never drops.", CTX_STAGE_X, HEADER_Y, { kind: "context-stage", parentId: PIPELINE_IDS.context }),
  core(PIPELINE_IDS.ctxCaps, "planning", "Caps", "maxHistoryMessages 30, maxRagChunks 6, maxFiles 8, maxWebDocs 6, maxGraphFiles 8.", CTX_STAGE_X + CTX_STAGE_SLOT, HEADER_Y, { kind: "context-stage", parentId: PIPELINE_IDS.context }),
  core(PIPELINE_IDS.ctxBudget, "planning", "Token budget", "Reserve identity + toolGuidance. Drop priority > userRequest until maxTokens (maxContextChars / 4).", CTX_STAGE_X + CTX_STAGE_SLOT * 2, HEADER_Y, { kind: "context-stage", parentId: PIPELINE_IDS.context }),
  core(PIPELINE_IDS.ctxAssemble, "context", "Assemble prompt", "systemPrompt = Kursor rules → skills → memory → graph → RAG → project → editor → git → web → rules → toolGuidance. messages = conversation slices only.", CTX_STAGE_X + CTX_STAGE_SLOT * 3, HEADER_Y, { kind: "context-stage", parentId: PIPELINE_IDS.context }),

  core(PIPELINE_IDS.mcp, "tool_group", "MCP", "Built-in MCP servers. Always on the map, idle until configured and used. Invoked tools nest under the server that ran.", CHILD_PAD, HEADER_Y, { kind: "parent", parentId: PIPELINE_IDS.tools }),
  ...PIPELINE_MCP_SERVERS.map((server, index) => ({
    id: PIPELINE_IDS.mcpServer(server.serverId),
    type: "mcp_server" as const,
    label: server.label,
    role: server.role,
    position: { x: CHILD_PAD + index * MCP_SLOT, y: HEADER_Y },
    kind: "parent" as const,
    parentId: PIPELINE_IDS.mcp,
    capabilityId: server.capabilityId,
    mcpServerId: server.serverId,
  })),

  ...PIPELINE_AGENT_IDS.map((id, index) => ({
    id: PIPELINE_IDS.specialist(id),
    type: "subagent" as const,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    role: id === "explore"
      ? "Read-only research. Own ContextEngine 1× + AgentLoop. Parallel ok. Handoff summary only."
      : id === "implement"
        ? "Workspace-write + TDD in the implementer prompt. Own ContextEngine 1× + LLM-001-SUB loop. Blocked while criticalReviewOpen."
        : "Read-only review. Own loop. Critical findings block the next implement task.",
    position: { x: CHILD_PAD + index * SPEC_SLOT, y: HEADER_Y },
    kind: "specialist" as const,
    parentId: PIPELINE_IDS.orchestrator,
  })),
  ...PIPELINE_AGENT_IDS.flatMap((id) => specialistLoop(id)),
];

function edge(source: string, target: string, type: AgentGraphEdge["type"]): AgentGraphEdge {
  return {
    id: `${type}:${source}->${target}`,
    runId: "",
    source,
    target,
    type,
    evidenceLevel: "derived",
  };
}

export const PIPELINE_SPINE_EDGES: AgentGraphEdge[] = [
  edge(PIPELINE_IDS.boot, PIPELINE_IDS.user, "sequence"),
  edge(PIPELINE_IDS.user, PIPELINE_IDS.task, "sequence"),
  edge(PIPELINE_IDS.task, PIPELINE_IDS.hook, "sequence"),
  edge(PIPELINE_IDS.hook, PIPELINE_IDS.compact, "sequence"),
  edge(PIPELINE_IDS.compact, PIPELINE_IDS.context, "sequence"),
  edge(PIPELINE_IDS.context, PIPELINE_IDS.loop, "sequence"),
  edge(PIPELINE_IDS.loop, PIPELINE_IDS.result, "sequence"),
  edge(PIPELINE_IDS.result, PIPELINE_IDS.knowledgeReflect, "sequence"),
  edge(PIPELINE_IDS.ctxRank, PIPELINE_IDS.ctxCaps, "sequence"),
  edge(PIPELINE_IDS.ctxCaps, PIPELINE_IDS.ctxBudget, "sequence"),
  edge(PIPELINE_IDS.ctxBudget, PIPELINE_IDS.ctxAssemble, "sequence"),
  ...PIPELINE_IDLE_CONTEXT_SOURCES.map((source) => edge(PIPELINE_IDS.slice(source.id), PIPELINE_IDS.ctxRank, "sequence")),
  edge(PIPELINE_IDS.router, PIPELINE_IDS.model, "sequence"),
  edge(PIPELINE_IDS.model, PIPELINE_IDS.toolChoice, "sequence"),
  edge(PIPELINE_IDS.toolChoice, PIPELINE_IDS.toolHook, "sequence"),
  edge(PIPELINE_IDS.toolHook, PIPELINE_IDS.permissions, "sequence"),
  edge(PIPELINE_IDS.permissions, PIPELINE_IDS.tools, "sequence"),
  ...PIPELINE_MCP_SERVERS.slice(0, -1).map((server, index) => {
    const next = PIPELINE_MCP_SERVERS[index + 1]?.serverId ?? server.serverId;
    return edge(PIPELINE_IDS.mcpServer(server.serverId), PIPELINE_IDS.mcpServer(next), "sequence");
  }),
  edge(PIPELINE_IDS.tools, PIPELINE_IDS.toolResults, "sequence"),
  edge(PIPELINE_IDS.toolResults, PIPELINE_IDS.verification, "sequence"),
  edge(PIPELINE_IDS.toolResults, PIPELINE_IDS.ctxRank, "context"),
  edge(PIPELINE_IDS.toolResults, PIPELINE_IDS.model, "loop"),
  edge(PIPELINE_IDS.verification, PIPELINE_IDS.model, "loop"),
  edge(PIPELINE_IDS.verification, PIPELINE_IDS.recovery, "recovery"),
  edge(PIPELINE_IDS.skillCheck, PIPELINE_IDS.explain, "sequence"),
  edge(PIPELINE_IDS.skillCheck, PIPELINE_IDS.bug, "sequence"),
  edge(PIPELINE_IDS.skillCheck, PIPELINE_IDS.build, "sequence"),
  edge(PIPELINE_IDS.bug, PIPELINE_IDS.debugging, "sequence"),
  edge(PIPELINE_IDS.build, PIPELINE_IDS.brainstorming, "sequence"),
  edge(PIPELINE_IDS.brainstorming, PIPELINE_IDS.brainstormResearch, "sequence"),
  edge(PIPELINE_IDS.brainstormResearch, PIPELINE_IDS.designGate, "sequence"),
  edge(PIPELINE_IDS.designGate, PIPELINE_IDS.writingPlans, "sequence"),
  edge(PIPELINE_IDS.writingPlans, PIPELINE_IDS.planResearch, "sequence"),
  edge(PIPELINE_IDS.planResearch, PIPELINE_IDS.worktree, "sequence"),
  edge(PIPELINE_IDS.worktree, PIPELINE_IDS.executingPlans, "sequence"),
  edge(PIPELINE_IDS.executingPlans, PIPELINE_IDS.tdd, "sequence"),
  edge(PIPELINE_IDS.tdd, PIPELINE_IDS.verificationBeforeCompletion, "sequence"),
  edge(PIPELINE_IDS.verificationBeforeCompletion, PIPELINE_IDS.finishing, "sequence"),
  edge(PIPELINE_IDS.executingPlans, PIPELINE_IDS.review, "sequence"),
  ...PIPELINE_AGENT_IDS.flatMap((id) => [
    edge(PIPELINE_IDS.specialistPart(id, "model"), PIPELINE_IDS.specialistPart(id, "perm"), "sequence"),
    edge(PIPELINE_IDS.specialistPart(id, "perm"), PIPELINE_IDS.specialistPart(id, "tools"), "sequence"),
    edge(PIPELINE_IDS.specialistPart(id, "tools"), PIPELINE_IDS.specialistPart(id, "verify"), "sequence"),
    edge(PIPELINE_IDS.specialistPart(id, "tools"), PIPELINE_IDS.specialistPart(id, "model"), "loop"),
  ]),
];

export function templateNodeToGraph(node: PipelineTemplateNode, runId = ""): AgentGraphNode {
  const isParent = node.kind === "parent" || node.kind === "specialist";
  return {
    id: node.id,
    runId,
    type: node.type,
    label: node.label,
    status: "idle",
    timestamp: 0,
    parentId: node.parentId,
    metadata: {
      role: node.role,
      kind: node.kind,
      position: node.position,
      pipeline: true,
      isParent,
      canDrill: isParent || Boolean(node.drillTarget),
      ...(node.layer ? { layer: node.layer } : {}),
      ...(node.drillTarget ? { drillTarget: node.drillTarget } : {}),
      ...(node.skillId ? { skillId: node.skillId } : {}),
      ...(node.typicalTools ? { typicalTools: node.typicalTools } : {}),
      ...(node.capabilityId ? { capabilityId: node.capabilityId } : {}),
      ...(node.mcpServerId ? { mcpServerId: node.mcpServerId } : {}),
    },
  };
}

export function visibleTemplateNodes(): PipelineTemplateNode[] {
  return PIPELINE_TEMPLATE_NODES;
}

export function idlePipelineGraph(): { nodes: AgentGraphNode[]; edges: AgentGraphEdge[] } {
  const visible = visibleTemplateNodes();
  const ids = new Set(visible.map((node) => node.id));
  return {
    nodes: visible.map((node) => templateNodeToGraph(node)),
    edges: PIPELINE_SPINE_EDGES.filter((item) => ids.has(item.source) && ids.has(item.target)),
  };
}

export function defaultPipelineCollapsedGroups(): Record<string, boolean> {
  const collapsed: Record<string, boolean> = {};
  for (const node of PIPELINE_TEMPLATE_NODES) {
    if (node.kind === "parent" || node.kind === "specialist") collapsed[node.id] = true;
  }
  return collapsed;
}

export function isPipelineNodeId(id: string) {
  return id.startsWith("pipeline:");
}

export function isPipelineParent(node: Pick<AgentGraphNode, "metadata" | "id">) {
  return node.metadata?.isParent === true || node.metadata?.kind === "parent" || node.metadata?.kind === "specialist";
}

export function isProcessPhase(node: Pick<AgentGraphNode, "metadata">) {
  return node.metadata?.kind === "process-phase";
}

export function isFiletBranch(node: Pick<AgentGraphNode, "metadata">) {
  return node.metadata?.kind === "filet-branch";
}

export function isEngineLayer(node: Pick<AgentGraphNode, "metadata">) {
  return node.metadata?.layer === "engine";
}

export function isPackedLoopChild(node: Pick<AgentGraphNode, "parentId" | "metadata">) {
  return node.parentId === PIPELINE_IDS.loop && !isEngineLayer(node);
}

export const PIPELINE_PROCESS_PHASE_IDS = [
  PIPELINE_IDS.debugging,
  PIPELINE_IDS.brainstorming,
  PIPELINE_IDS.brainstormResearch,
  PIPELINE_IDS.designGate,
  PIPELINE_IDS.worktree,
  PIPELINE_IDS.writingPlans,
  PIPELINE_IDS.planResearch,
  PIPELINE_IDS.executingPlans,
  PIPELINE_IDS.tdd,
  PIPELINE_IDS.review,
  PIPELINE_IDS.verificationBeforeCompletion,
  PIPELINE_IDS.finishing,
] as const;

export const PIPELINE_FILET_BRANCH_IDS = [
  PIPELINE_IDS.explain,
  PIPELINE_IDS.bug,
  PIPELINE_IDS.build,
] as const;

export const FILET_TREE_IDS: Record<"explain" | "bug" | "build", readonly string[]> = {
  explain: [PIPELINE_IDS.explain],
  bug: [PIPELINE_IDS.bug, PIPELINE_IDS.debugging],
  build: [
    PIPELINE_IDS.build,
    PIPELINE_IDS.brainstorming,
    PIPELINE_IDS.brainstormResearch,
    PIPELINE_IDS.designGate,
    PIPELINE_IDS.writingPlans,
    PIPELINE_IDS.planResearch,
    PIPELINE_IDS.worktree,
    PIPELINE_IDS.executingPlans,
    PIPELINE_IDS.tdd,
    PIPELINE_IDS.review,
    PIPELINE_IDS.verificationBeforeCompletion,
    PIPELINE_IDS.finishing,
  ],
};

export function filetBranchIdForGoal(goalKind: GoalKind): "explain" | "bug" | "build" | null {
  if (goalKind === "explain" || goalKind === "bug" || goalKind === "build") return goalKind;
  return null;
}

export const PIPELINE_OVERVIEW_IDS = [
  PIPELINE_IDS.boot,
  PIPELINE_IDS.user,
  PIPELINE_IDS.task,
  PIPELINE_IDS.hook,
  PIPELINE_IDS.compact,
  PIPELINE_IDS.context,
  PIPELINE_IDS.loop,
  PIPELINE_IDS.result,
  PIPELINE_IDS.knowledgeReflect,
] as const;

export const PROCESS_SKILL_PHASE: Record<string, string> = {
  "systematic-debugging": PIPELINE_IDS.debugging,
  brainstorming: PIPELINE_IDS.brainstorming,
  "subagent-driven-brainstorming": PIPELINE_IDS.brainstormResearch,
  "using-git-worktrees": PIPELINE_IDS.worktree,
  "writing-plans": PIPELINE_IDS.writingPlans,
  "subagent-driven-planning": PIPELINE_IDS.planResearch,
  "executing-plans": PIPELINE_IDS.executingPlans,
  "test-driven-development": PIPELINE_IDS.tdd,
  "requesting-code-review": PIPELINE_IDS.review,
  "receiving-code-review": PIPELINE_IDS.review,
  "verification-before-completion": PIPELINE_IDS.verificationBeforeCompletion,
  "finishing-a-development-branch": PIPELINE_IDS.finishing,
};

export const TOOL_PHASE: Record<string, string> = {
  git_branch: PIPELINE_IDS.worktree,
  enter_plan_mode: PIPELINE_IDS.writingPlans,
  create_plan: PIPELINE_IDS.writingPlans,
  update_plan_todo: PIPELINE_IDS.executingPlans,
  ask_user_question: PIPELINE_IDS.brainstorming,
  run_command: PIPELINE_IDS.tdd,
  finish_development_branch: PIPELINE_IDS.finishing,
};

export function processSkillForSubagent(agentId: string, preferPlanResearch = false): string {
  if (agentId === "implement") return "executing-plans";
  if (agentId === "review") return "requesting-code-review";
  if (preferPlanResearch) return "subagent-driven-planning";
  return "subagent-driven-brainstorming";
}
