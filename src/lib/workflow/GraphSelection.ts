import type { AgentGraphNode } from "./types";

export function nodeIdForPrompt(messageId: string) {
  return `user_prompt:${messageId}`;
}

export function nodeIdForAgent(agentId: string) {
  return `agent:${agentId}`;
}

export function nodeIdForTask(taskId: string) {
  return `task:${taskId}`;
}

export function nodeIdForWorkflow(stepId: string) {
  return `workflow:${stepId}`;
}

export function nodeIdForPhase(phase: string) {
  return `phase:${phase}`;
}

export function nodeIdForContext(sequence: number) {
  return `context:${sequence}`;
}

export function nodeIdForSlice(kind: string, sliceId: string) {
  return `${kind}:${sliceId}`;
}

export function nodeIdForTool(toolCallId: string) {
  return `tool:${toolCallId}`;
}

export function nodeIdForMcpServer(serverId: string) {
  return `mcp-server:${serverId}`;
}

export function nodeIdForToolGroup(id: string) {
  return `tool_group:${id}`;
}

export function nodeIdForVerification(requestId: string, attempt = 0) {
  return `verification:${requestId}:${attempt}`;
}

export function nodeIdForError(id: string) {
  return `error:${id}`;
}

export function nodeIdForApproval(id: string) {
  return `approval:${id}`;
}

export function nodeIdForFallback(from: string, to: string, sequence: number) {
  return `fallback:${from}:${to}:${sequence}`;
}

export function nodeIdForResult(runId: string) {
  return `result:${runId}`;
}

export function nodeIdForSubagent(agentId: string) {
  return `subagent:${agentId}`;
}

export function nodeIdForSubagentRun(agentId: string, taskId?: string) {
  return taskId ? nodeIdForTask(taskId) : nodeIdForSubagent(agentId);
}

export function nodeIdForCheckpoint(id: string) {
  return `checkpoint:${id}`;
}

export function nodeIdForReview(changeSetId: string) {
  return `review:${changeSetId}`;
}

export function chatItemIdForNode(node: AgentGraphNode): string | null {
  const meta = node.metadata ?? {};
  if (typeof meta.chatItemId === "string") return meta.chatItemId;
  if (node.type === "user_prompt" && typeof meta.messageId === "string") return `user:${meta.messageId}`;
  if (node.type === "tool" || node.type === "file" || node.type === "git" || node.type === "command" || node.type === "web_search" || node.type === "web_page" || node.type === "mcp_tool") {
    if (typeof meta.toolCallId === "string") return `tool:${meta.toolCallId}`;
  }
  if (node.type === "approval" && typeof meta.approvalId === "string") return `approval:${meta.approvalId}`;
  if (node.type === "verification" && typeof meta.requestId === "string") {
    return `verification:${meta.requestId}`;
  }
  if (node.type === "task" && typeof meta.taskId === "string") return `task:${meta.taskId}`;
  if (node.type === "fallback") {
    const from = typeof meta.fromModel === "string" ? meta.fromModel : "";
    const to = typeof meta.toModel === "string" ? meta.toModel : "";
    return from && to ? `fallback:${from}:${to}` : node.id;
  }
  if (node.type === "review" && typeof meta.changeSetId === "string") return `review:${meta.changeSetId}`;
  return null;
}

export function nodeMatchesChatItem(node: AgentGraphNode, pending: string) {
  if (node.id === pending || node.id.startsWith(pending)) return true;
  const chatId = chatItemIdForNode(node);
  if (chatId && (chatId === pending || pending.startsWith(`${chatId}:`) || chatId.startsWith(`${pending}:`))) return true;
  if (typeof node.metadata?.toolCallId === "string" && `tool:${node.metadata.toolCallId}` === pending) return true;
  if (typeof node.metadata?.approvalId === "string" && `approval:${node.metadata.approvalId}` === pending) return true;
  return false;
}

export function filePathFromNode(node: AgentGraphNode): string | null {
  const meta = node.metadata ?? {};
  if (typeof meta.filePath === "string" && meta.filePath) return meta.filePath;
  if (typeof meta.path === "string" && meta.path) return meta.path;
  return null;
}

export function fileLineFromNode(node: AgentGraphNode): number | undefined {
  const meta = node.metadata ?? {};
  if (typeof meta.line === "number" && Number.isFinite(meta.line)) return meta.line;
  return undefined;
}

export function shortRunId(id: string) {
  const compact = id.replace(/-/g, "");
  return compact.slice(0, 4).toUpperCase();
}
