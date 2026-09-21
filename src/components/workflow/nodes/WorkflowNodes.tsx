import {
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileCode2,
  FileText,
  Folder,
  GitBranch,
  ListTodo,
  RotateCcw,
  RotateCw,
  Search,
  Server,
  Shield,
  Terminal,
  User,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { ReactNode } from "react";
import { isPipelineParent } from "../../../lib/workflow/pipelineSchema";
import type { AgentGraphNode, AgentGraphNodeType } from "../../../lib/workflow/types";
import { nodeSize } from "../../../lib/workflow/GraphLayout";
import { useWorkflowStore } from "../../../stores/workflowStore";

export type WorkflowRfNode = Node<{ node: AgentGraphNode }, string>;

function statusLabel(status: AgentGraphNode["status"]) {
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "skipped") return "Skipped";
  if (status === "idle") return "Idle";
  return "Pending";
}

function handlePositions() {
  return { target: Position.Left, source: Position.Right };
}

function NodeHandles({ target, source }: { target: Position; source: Position }) {
  return (
    <>
      <Handle type="target" position={target} />
      <Handle type="source" position={source} />
      <Handle type="source" id="loop" position={Position.Bottom} className="wf-handle-loop" />
      <Handle type="target" id="loop" position={Position.Bottom} className="wf-handle-loop" />
      <Handle type="source" id="context" position={Position.Top} className="wf-handle-loop" />
      <Handle type="target" id="context" position={Position.Top} className="wf-handle-loop" />
    </>
  );
}

function nodeAriaLabel(node: AgentGraphNode) {
  const role = typeof node.metadata?.role === "string" ? node.metadata.role : "";
  return [node.label, role, statusLabel(node.status)].filter(Boolean).join(". ");
}

function nodeIcon(node: AgentGraphNode): LucideIcon {
  if (node.id === "pipeline:skill-check" || node.id === "pipeline:boot" || node.id === "pipeline:load-skill") return BookOpen;
  if (node.id === "pipeline:branch:explain") return BookOpen;
  if (node.id === "pipeline:branch:bug" || node.id === "pipeline:phase:debugging") return Search;
  if (node.id === "pipeline:branch:build") return ListTodo;
  if (node.id === "pipeline:gate:design") return Shield;
  if (node.id === "pipeline:mcp") return Server;
  if (node.id === "pipeline:tool-choice" || node.id === "pipeline:tool-results") return Wrench;
  if (node.id === "pipeline:hook" || node.id === "pipeline:tool-hook") return Shield;
  if (node.id === "pipeline:loop") return Bot;
  if (node.id === "pipeline:phase:tdd") return CheckCircle2;
  if (node.id === "pipeline:phase:worktree" || node.id === "pipeline:phase:finishing") return GitBranch;
  if (node.id === "pipeline:phase:writing-plans") return FileText;
  if (node.id === "pipeline:phase:brainstorming") return ListTodo;
  if (node.id === "pipeline:phase:debugging") return Search;
  if (node.id === "pipeline:phase:review") return CheckCircle2;
  if (node.id === "pipeline:phase:brainstorm-research" || node.id === "pipeline:phase:plan-research" || node.id === "pipeline:orchestrator") return Bot;
  if (node.id === "pipeline:phase:executing-plans") return ListTodo;
  if (node.id === "pipeline:phase:verification-before-completion") return CheckCircle2;
  switch (node.type) {
    case "user_prompt":
      return User;
    case "task":
    case "planning":
    case "brainstorm":
      return ListTodo;
    case "agent":
    case "subagent":
      return Bot;
    case "context":
      return Folder;
    case "memory":
      return BookOpen;
    case "rag":
      return Search;
    case "skill":
      return FileText;
    case "file":
      return FileCode2;
    case "git":
      return GitBranch;
    case "web_search":
    case "web_page":
      return Search;
    case "mcp_server":
      return Server;
    case "mcp_resource":
    case "mcp_prompt":
    case "mcp_tool":
      return Workflow;
    case "tool":
    case "tool_group":
      return Wrench;
    case "command":
      return Terminal;
    case "approval":
      return Shield;
    case "verification":
      return CheckCircle2;
    case "error":
      return RotateCcw;
    case "result":
      return CheckCircle2;
    case "fallback":
      return RotateCw;
    case "checkpoint":
      return FileText;
    case "review":
      return CheckCircle2;
    default:
      return Workflow;
  }
}

function stageClass(node: AgentGraphNode) {
  if (node.id === "pipeline:loop") return " stage-loop";
  if (node.id === "pipeline:orchestrator") return " stage-orch";
  if (node.id === "pipeline:context") return " stage-context";
  if (node.id === "pipeline:tools") return " stage-tools";
  if (node.id === "pipeline:skill-check") return " stage-fork";
  if (node.id === "pipeline:boot") return " stage-skill";
  if (node.id === "pipeline:branch:explain" || node.id === "pipeline:branch:bug" || node.id === "pipeline:branch:build") return " stage-fork";
  if (node.id === "pipeline:gate:design") return " stage-phase";
  if (node.metadata?.kind === "process-phase") return " stage-phase";
  if (node.id === "pipeline:mcp" || node.type === "mcp_server" || node.id.startsWith("pipeline:mcp:")) return " stage-mcp";
  return "";
}

function DrillHint({ node }: { node: AgentGraphNode }) {
  if (node.metadata?.canDrill !== true) return null;
  return <ChevronRight size={11} className="wf-drill" aria-hidden />;
}

function useCapabilityHighlight(node: AgentGraphNode) {
  const highlightedId = useWorkflowStore((state) => state.highlightedCapabilityId);
  return Boolean(highlightedId && node.metadata?.capabilityId === highlightedId);
}

export function WorkflowNodeFrame({ node, selected }: { node: AgentGraphNode; selected?: boolean }) {
  const size = nodeSize(node.type);
  const handles = handlePositions();
  const parent = isPipelineParent(node);
  const Icon = nodeIcon(node);
  const highlighted = useCapabilityHighlight(node);
  const collapsed = useWorkflowStore((state) => Boolean(state.collapsedGroups[node.id]));
  const hint = node.id === "pipeline:loop"
    ? "Double-click for runtime"
    : parent && collapsed ? "Double-click to expand" : "";
  return (
    <div
      className={`wf-node type-${node.type} status-${node.status}${parent ? " is-parent" : ""}${collapsed ? " collapsed" : ""}${stageClass(node)}${selected ? " selected" : ""}${highlighted ? " highlighted" : ""}`}
      style={parent ? { width: "100%", height: "100%", minWidth: size.width, minHeight: size.height } : { width: size.width, minHeight: size.height }}
      aria-label={nodeAriaLabel(node)}
    >
      <NodeHandles target={handles.target} source={handles.source} />
      <div className="wf-node-kicker">
        <Icon size={11} strokeWidth={1.8} />
        <span>{node.type.replace(/_/g, " ")}</span>
        <DrillHint node={node} />
      </div>
      <div className="wf-node-label">{node.label}</div>
      {hint ? <div className="wf-node-hint">{hint}</div> : null}
    </div>
  );
}

function wrap(Component: (props: { node: AgentGraphNode; selected?: boolean }) => ReactNode) {
  return function WorkflowTypedNode({ data, selected }: NodeProps<WorkflowRfNode>) {
    return <Component node={data.node} selected={selected} />;
  };
}

export function AgentNode({ node, selected }: { node: AgentGraphNode; selected?: boolean }) {
  return <WorkflowNodeFrame node={node} selected={selected} />;
}
export function TaskNode({ node, selected }: { node: AgentGraphNode; selected?: boolean }) {
  const highlighted = useCapabilityHighlight(node);
  if (node.type === "tool_group") {
    const count = typeof node.metadata?.toolCount === "number"
      ? node.metadata.toolCount
      : typeof node.metadata?.count === "number" ? node.metadata.count : "";
    const handles = handlePositions();
    const parent = isPipelineParent(node);
    const Icon = nodeIcon(node);
    return (
      <div
        className={`wf-node type-${node.type} status-${node.status}${parent ? " is-parent" : ""}${stageClass(node)}${selected ? " selected" : ""}${highlighted ? " highlighted" : ""}`}
        style={parent ? { width: "100%", height: "100%" } : undefined}
        aria-label={nodeAriaLabel(node)}
      >
        <NodeHandles target={handles.target} source={handles.source} />
        <div className="wf-node-kicker">
          <Icon size={11} strokeWidth={1.8} />
          <span>tools{count ? ` · ${count}` : ""}</span>
          <DrillHint node={node} />
        </div>
        <div className="wf-node-label">{node.label}</div>
      </div>
    );
  }
  return <WorkflowNodeFrame node={node} selected={selected} />;
}
export function ToolNode({ node, selected }: { node: AgentGraphNode; selected?: boolean }) {
  const path = typeof node.metadata?.filePath === "string" ? node.metadata.filePath : "";
  const mcpServer = typeof node.metadata?.mcpServerId === "string" ? node.metadata.mcpServerId : "";
  const mcpTool = typeof node.metadata?.mcpToolName === "string" ? node.metadata.mcpToolName : "";
  const handles = handlePositions();
  const Icon = nodeIcon(node);
  const highlighted = useCapabilityHighlight(node);
  const kicker = mcpServer ? `mcp · ${mcpServer}` : node.label;
  const label = path || mcpTool || node.label;
  return (
    <div className={`wf-node type-${node.type} status-${node.status}${selected ? " selected" : ""}${highlighted ? " highlighted" : ""}`} aria-label={nodeAriaLabel(node)}>
      <NodeHandles target={handles.target} source={handles.source} />
      <div className="wf-node-kicker">
        <Icon size={11} strokeWidth={1.8} />
        <span>{kicker}</span>
      </div>
      <div className="wf-node-label">{label}</div>
    </div>
  );
}
export function ContextNode({ node, selected }: { node: AgentGraphNode; selected?: boolean }) {
  return <WorkflowNodeFrame node={node} selected={selected} />;
}
export function MemoryNode({ node, selected }: { node: AgentGraphNode; selected?: boolean }) {
  return <WorkflowNodeFrame node={node} selected={selected} />;
}
export function RagNode({ node, selected }: { node: AgentGraphNode; selected?: boolean }) {
  return <WorkflowNodeFrame node={node} selected={selected} />;
}
export function SkillNode({ node, selected }: { node: AgentGraphNode; selected?: boolean }) {
  return <WorkflowNodeFrame node={node} selected={selected} />;
}
export function VerificationNode({ node, selected }: { node: AgentGraphNode; selected?: boolean }) {
  return <WorkflowNodeFrame node={node} selected={selected} />;
}
export function ErrorNode({ node, selected }: { node: AgentGraphNode; selected?: boolean }) {
  return <WorkflowNodeFrame node={node} selected={selected} />;
}
export function ResultNode({ node, selected }: { node: AgentGraphNode; selected?: boolean }) {
  return <WorkflowNodeFrame node={node} selected={selected} />;
}
export function ApprovalNode({ node, selected }: { node: AgentGraphNode; selected?: boolean }) {
  return <WorkflowNodeFrame node={node} selected={selected} />;
}

const DefaultNode = wrap(WorkflowNodeFrame);

export const workflowNodeTypes = {
  agent: wrap(AgentNode),
  task: wrap(TaskNode),
  tool: wrap(ToolNode),
  file: wrap(ToolNode),
  git: wrap(ToolNode),
  command: wrap(ToolNode),
  web_search: wrap(ToolNode),
  web_page: wrap(ToolNode),
  mcp_server: wrap(WorkflowNodeFrame),
  mcp_tool: wrap(ToolNode),
  mcp_resource: wrap(WorkflowNodeFrame),
  mcp_prompt: wrap(WorkflowNodeFrame),
  tool_group: wrap(TaskNode),
  context: wrap(ContextNode),
  memory: wrap(MemoryNode),
  rag: wrap(RagNode),
  skill: wrap(SkillNode),
  verification: wrap(VerificationNode),
  error: wrap(ErrorNode),
  result: wrap(ResultNode),
  approval: wrap(ApprovalNode),
  fallback: wrap(WorkflowNodeFrame),
  user_prompt: wrap(WorkflowNodeFrame),
  planning: wrap(TaskNode),
  subagent: wrap(AgentNode),
  checkpoint: wrap(WorkflowNodeFrame),
  brainstorm: wrap(TaskNode),
  reasoning_summary: wrap(WorkflowNodeFrame),
  workflow: DefaultNode,
};

export function rfNodeType(type: AgentGraphNodeType) {
  return type in workflowNodeTypes ? type : "workflow";
}
