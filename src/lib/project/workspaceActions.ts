import { useEditorStore } from "../../stores/editorStore";
import { useFileExplorerStore } from "../../stores/fileExplorerStore";
import { useProjectStore } from "../../stores/projectStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { useAgentStore } from "../../stores/agentStore";
import { useAccountStore } from "../../stores/accountStore";
import { useDialogStore } from "../../stores/dialogStore";
import { usePlanStore } from "../../stores/planStore";
import { projectService } from "./ProjectService";
import { ragService } from "../rag/RagService";
import { graphService } from "../graph/GraphService";
import { hydrateConversations, hydrateTasks, persistActiveConversation } from "../storage/session";
import { agentRuntime } from "../agent/AgentRuntime";
import { ensureGitHubRepository, refreshGitStatus } from "../github/ensureRepository";
import { bootstrapMcp } from "../mcp/bootstrap";

async function bindRuntime(projectId: string) {
  const accountId = useAccountStore.getState().currentAccount?.id ?? "local-account";
  const conversationId = useAgentStore.getState().activeConversationId;
  agentRuntime.setContext({ accountId, projectId, conversationId });
  agentRuntime.loadMessages(useAgentStore.getState().messages);
}

export async function openProjectAt(path: string, options?: { ensureGitHub?: boolean }) {
  if (agentRuntime.isBusy()) {
    const ok = await useDialogStore.getState().askConfirm(
      "Agent task is still running.",
      "Switching projects will stop the current task.",
      "Stop & Switch",
      true,
    );
    if (!ok) return false;
    agentRuntime.cancel();
  }
  await persistActiveConversation().catch(() => undefined);
  const closed = await useEditorStore.getState().closeAll();
  if (!closed) return false;
  agentRuntime.clearContext();
  usePlanStore.getState().reset();
  const project = await useProjectStore.getState().openProject(path);
  await useFileExplorerStore.getState().loadRoot(project);
  await usePlanStore.getState().loadProjectPlans().catch(() => undefined);
  await useTerminalStore.getState().resetForNewProject();
  void ragService.indexProject(project.id);
  void graphService.rebuild(project.id);
  await hydrateConversations();
  await hydrateTasks();
  await bindRuntime(project.id);
  void import("../../stores/reviewStore").then(({ useReviewStore }) => useReviewStore.getState().hydrate(project.id));
  void bootstrapMcp(project.id, project.rootPath);
  if (options?.ensureGitHub === false) await refreshGitStatus();
  else await ensureGitHubRepository(project);
  return true;
}

export async function pickAndOpenProject() {
  const path = await projectService.pickDirectory();
  if (!path) return false;
  return openProjectAt(path);
}

export async function switchProjectById(id: string) {
  const project = useProjectStore.getState().projects.find((item) => item.id === id)
    ?? useProjectStore.getState().recentProjects.find((item) => item.id === id);
  if (!project) return false;
  return openProjectAt(project.rootPath);
}
