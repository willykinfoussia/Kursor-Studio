import { agentRuntime } from "../agent/AgentRuntime";
import { chatItemIdForNode, fileLineFromNode, filePathFromNode } from "./GraphSelection";
import type { AgentGraphNode } from "./types";
import { useAgentUiStore } from "../../stores/agentUiStore";
import { useCapabilityStore } from "../../stores/capabilityStore";
import { useVerificationStore } from "../../stores/verificationStore";
import { useEditorStore } from "../../stores/editorStore";
import { useRunStore } from "../../stores/runStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { useUiStore } from "../../stores/uiStore";
import { useWorkflowStore } from "../../stores/workflowStore";

export function openWorkflowNode(nodeId: string) {
  useUiStore.getState().setView("run");
  useWorkflowStore.getState().selectNode(nodeId);
  useWorkflowStore.getState().setDetailsOpen(true);
  useWorkflowStore.getState().setFollowAgent(false);
  useWorkflowStore.getState().setPendingChatItem(nodeId);
}

export function openNodeInChat(node: AgentGraphNode) {
  const itemId = chatItemIdForNode(node);
  useUiStore.setState({ agentVisible: true });
  if (itemId) useAgentUiStore.getState().highlight(itemId);
}

export async function openNodeInEditor(node: AgentGraphNode) {
  const path = filePathFromNode(node);
  if (!path) return;
  useUiStore.getState().setView("project");
  await useEditorStore.getState().openFile(path, false, fileLineFromNode(node));
}

export function openNodeInTerminal(node: AgentGraphNode) {
  useUiStore.getState().setView("project");
  const terminal = useTerminalStore.getState();
  if (!terminal.visible) {
    if (terminal.sessions.length === 0) void terminal.ensureSessionForCurrentProject();
    else terminal.toggle();
  }
  if (node.type === "command" && terminal.sessions[0]) terminal.setActive(terminal.sessions[0].id);
}

export function openCapabilities() {
  useUiStore.getState().setView("capabilities");
  void useCapabilityStore.getState().refresh();
}

export function openTests() {
  useUiStore.getState().setView("tests");
  void useVerificationStore.getState().refresh();
}

export function openCapability(capabilityId: string) {
  useUiStore.getState().setView("capabilities");
  useCapabilityStore.getState().select(capabilityId);
  void useCapabilityStore.getState().refresh();
}

export function openCapabilityUsage(runId: string, usageInstanceId: string, capabilityId?: string) {
  useUiStore.getState().setView("run");
  void useRunStore.getState().loadRun(runId);
  useWorkflowStore.getState().selectNode(usageInstanceId);
  useWorkflowStore.getState().setDetailsOpen(true);
  useWorkflowStore.getState().setFollowAgent(false);
  if (capabilityId) useWorkflowStore.getState().setHighlightedCapabilityId(capabilityId);
}

export function openCapabilitySource(path: string) {
  useUiStore.getState().setView("project");
  void useEditorStore.getState().openFile(path, false);
}

export function resolveApprovalFromGraph(node: AgentGraphNode, decision: "allow-task" | "deny" | "allow") {
  const id = typeof node.metadata?.approvalId === "string" ? node.metadata.approvalId : node.id.replace(/^approval:/, "");
  const kind = node.metadata?.kind;
  if (kind === "workflow") {
    agentRuntime.resolveWorkflowApproval(id, decision === "deny" ? "deny" : "allow");
    return;
  }
  agentRuntime.resolvePermission(id, decision === "deny" ? "deny" : "allow-task");
}
