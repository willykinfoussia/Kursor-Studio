import { useAgentStore } from "../../stores/agentStore";
import { useEditorStore } from "../../stores/editorStore";
import { useFileExplorerStore } from "../../stores/fileExplorerStore";
import { useProjectStore } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { ContextSnapshot } from "./context/types";
import { DEFAULT_MAX_CONTEXT_CHARS } from "./context/budget";
import { SESSION_COMPACT_PREFIX, sessionManager } from "./session";
import type { AgentMessage, ProjectContext } from "./types";

export interface AgentContext {
  messages: AgentMessage[];
  project: ProjectContext;
  memories?: import("../memory/types").Memory[];
  ragResults?: import("../rag/types").RagResult[];
}

export class ContextManager {
  snapshot(messages: readonly AgentMessage[]): ContextSnapshot {
    const project = useProjectStore.getState().currentProject;
    const explorer = useFileExplorerStore.getState();
    const editor = useEditorStore.getState();
    const agent = useAgentStore.getState();
    const settings = useSettingsStore.getState();
    const activeTab = editor.tabs.find((tab) => tab.path === editor.activePath);
    const currentPath = activeTab?.path ?? explorer.selectedFile;
    const request = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

    return {
      request,
      messages: messages.map((message) => ({ ...message })),
      project: project
        ? { id: project.id, name: project.name, rootPath: project.rootPath }
        : null,
      currentFile: currentPath
        ? { path: currentPath, content: activeTab && !activeTab.binary ? activeTab.content : "" }
        : null,
      openFiles: editor.tabs
        .map((tab) => ({ path: tab.path, isDirty: tab.isDirty }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      toolCalls: agent.toolCalls
        .filter((call) => call.status !== "running")
        .map((call) => ({ ...call })),
      webDocuments: agent.webDocuments.map((document) => ({ ...document })),
      activeTask: agent.tasks.find((task) => task.status === "running") ?? null,
      compactSummary: messages.find((message) => message.content.startsWith(SESSION_COMPACT_PREFIX))?.content
        ?? sessionManager.getActiveSnapshot()?.compactSummary,
      maxContextChars: settings.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS,
    };
  }

  build(messages: readonly AgentMessage[]): AgentContext {
    const snapshot = this.snapshot(messages);
    return {
      messages: snapshot.messages,
      project: {
        projectName: snapshot.project?.name ?? "",
        currentFile: snapshot.currentFile?.path ?? null,
        currentFileContent: snapshot.currentFile?.content || null,
      },
    };
  }
}
