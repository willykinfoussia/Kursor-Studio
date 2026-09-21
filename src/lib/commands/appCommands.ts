import { pickAndOpenProject } from "../project/workspaceActions";
import { useEditorStore } from "../../stores/editorStore";
import { useFileExplorerStore } from "../../stores/fileExplorerStore";
import { useGitStore } from "../../stores/gitStore";
import { useReviewStore } from "../../stores/reviewStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { useUiStore } from "../../stores/uiStore";

export { commandShortcuts, isNativeInput, matchesShortcut } from "./shortcuts";

export interface AppCommand {
  id: string;
  label: string;
  shortcut?: string;
  aliases?: string[];
  when?: "always" | "skip-native-input";
  showInPalette?: boolean;
  run: () => void;
}

function syncExplorerWithActiveTab() {
  const path = useEditorStore.getState().activePath;
  if (path) useFileExplorerStore.getState().selectFile(path);
}

function activateAdjacent(delta: number) {
  useEditorStore.getState().activateAdjacentTab(delta);
  syncExplorerWithActiveTab();
}

function focusExplorer() {
  const ui = useUiStore.getState();
  ui.setView("project");
  if (!ui.sidebarVisible) ui.toggleSidebar();
  const focus = () => document.querySelector<HTMLElement>("[data-project-tree]")?.focus();
  requestAnimationFrame(focus);
  setTimeout(focus, 0);
}

export const APP_COMMANDS: AppCommand[] = [
  { id: "save-all", label: "Save All", shortcut: "Ctrl+Shift+S", run: () => void useEditorStore.getState().saveAll() },
  { id: "save", label: "Save", shortcut: "Ctrl+S", run: () => void useEditorStore.getState().saveActive() },
  { id: "command-palette", label: "Command Palette", shortcut: "Ctrl+Shift+P", showInPalette: false, run: () => useUiStore.getState().setCommandPalette(true) },
  { id: "quick-open", label: "Go to File", shortcut: "Ctrl+P", run: () => useUiStore.getState().setQuickOpen(true) },
  { id: "toggle-agent", label: "Toggle Agent", shortcut: "Ctrl+Shift+A", run: () => useUiStore.getState().toggleAgent() },
  { id: "github", label: "Git", shortcut: "Ctrl+Shift+G", run: () => useUiStore.getState().setView("github") },
  { id: "focus-explorer", label: "Focus Explorer", shortcut: "Ctrl+Shift+E", run: () => focusExplorer() },
  { id: "reopen-tab", label: "Reopen Closed Editor", shortcut: "Ctrl+Shift+T", run: () => void useEditorStore.getState().reopenClosedTab() },
  {
    id: "close-tab",
    label: "Close Editor",
    shortcut: "Ctrl+W",
    when: "skip-native-input",
    run: () => {
      const editor = useEditorStore.getState();
      if (editor.activePath) void editor.closeTab(editor.activePath);
    },
  },
  { id: "next-editor", label: "Next Editor", shortcut: "Ctrl+Tab", aliases: ["Ctrl+PageDown"], run: () => activateAdjacent(1) },
  { id: "prev-editor", label: "Previous Editor", shortcut: "Ctrl+Shift+Tab", aliases: ["Ctrl+PageUp"], run: () => activateAdjacent(-1) },
  { id: "settings", label: "Settings", shortcut: "Ctrl+,", run: () => useUiStore.getState().openSettings("Editor") },
  { id: "toggle-sidebar", label: "Toggle Sidebar", shortcut: "Ctrl+B", run: () => useUiStore.getState().toggleSidebar() },
  { id: "toggle-terminal", label: "Toggle Terminal", shortcut: "Ctrl+J", run: () => useTerminalStore.getState().toggle() },
  { id: "open-project", label: "Open Project", run: () => void pickAndOpenProject() },
  { id: "close-all", label: "Close All Editors", run: () => void useEditorStore.getState().closeAll() },
  { id: "review", label: "Review AI Changes", run: () => useReviewStore.getState().openReview() },
  { id: "git-fetch", label: "Git: Fetch", run: () => void useGitStore.getState().fetch() },
  { id: "git-pull", label: "Git: Pull", run: () => void useGitStore.getState().pull() },
  { id: "git-push", label: "Git: Push", run: () => void useGitStore.getState().push() },
  { id: "graph", label: "Specs", run: () => useUiStore.getState().setView("graph") },
  { id: "run", label: "Run", run: () => useUiStore.getState().setView("run") },
  { id: "tests", label: "Tests", run: () => useUiStore.getState().setView("tests") },
  { id: "capabilities", label: "Capabilities", run: () => useUiStore.getState().setView("capabilities") },
];
