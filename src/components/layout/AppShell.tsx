import { useEffect } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { agentRuntime } from "../../lib/agent/AgentRuntime";
import { hydrateConversations, hydrateTasks } from "../../lib/storage/session";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useVerificationEvents } from "../../hooks/useVerificationEvents";
import { useRunObservability } from "../../hooks/useRunObservability";
import { useProjectWatcher } from "../../hooks/useProjectWatcher";
import { useAccountSpecsWatcher } from "../../hooks/useAccountSpecsWatcher";
import { useWindowCloseGuard } from "../../hooks/useWindowCloseGuard";
import { useAgentStore } from "../../stores/agentStore";
import { useUiStore } from "../../stores/uiStore";
import { useProjectStore } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useProjectView } from "../../hooks/useProjectView";
import { AgentPanel } from "../agent/AgentPanel";
import { CommandPalette } from "../command/CommandPalette";
import { QuickOpen } from "../command/QuickOpen";
import { DialogHost } from "../ui/DialogHost";
import { CapabilitiesPage } from "../../pages/CapabilitiesPage";
import { AgentsPage } from "../../pages/AgentsPage";
import { CodeAnalysisPage } from "../../pages/CodeAnalysisPage";
import { SettingsPage } from "../../pages/SettingsPage";
import { TasksPage } from "../../pages/TasksPage";
import { TestsPage } from "../../pages/TestsPage";
import { GitWorkspace } from "../git/GitWorkspace";
import { ManageProjectsPage } from "../project/ManageProjectsPage";
import { ProjectSettingsPage } from "../project/ProjectSettingsPage";
import { GraphWorkspace } from "../graph/GraphWorkspace";
import { WorkflowWorkspace } from "../workflow/WorkflowWorkspace";
import { ReviewWorkspace } from "../review/ReviewWorkspace";
import { ActivityBar } from "./ActivityBar";
import { MissionWorkspace } from "./MissionWorkspace";
import { TopBar } from "./TopBar";

function ResizeHandle({ orientation }: { orientation: "horizontal" | "vertical" }) {
  return <Separator className={`resize-handle ${orientation}`} />;
}

function CurrentPage() {
  const view = useUiStore((state) => state.activeView);
  if (view === "graph") return <GraphWorkspace />;
  if (view === "run") return <WorkflowWorkspace />;
  if (view === "agents") return <AgentsPage />;
  if (view === "capabilities") return <CapabilitiesPage />;
  if (view === "tests") return <TestsPage />;
  if (view === "tasks") return <TasksPage />;
  if (view === "github") return <GitWorkspace />;
  if (view === "review") return <ReviewWorkspace />;
  if (view === "code-analysis") return <CodeAnalysisPage />;
  if (view === "settings") return <SettingsPage />;
  if (view === "projects") return <ManageProjectsPage />;
  if (view === "project-settings") return <ProjectSettingsPage />;
  return null;
}

export function AppShell({ onClone, onNew }: { onClone: () => void; onNew: () => void }) {
  useKeyboardShortcuts();
  useVerificationEvents();
  useRunObservability();
  useProjectWatcher();
  useProjectView();
  useAccountSpecsWatcher();
  useWindowCloseGuard();
  const view = useUiStore((state) => state.activeView);
  const agentVisible = useUiStore((state) => state.agentVisible);
  const loadRecents = useProjectStore((state) => state.loadRecents);
  const layoutKey = agentVisible ? "agent" : "solo";
  const centerSize = agentVisible ? "72%" : "100%";

  useEffect(() => {
    void loadRecents();
    if (!useSettingsStore.getState().hydrated) {
      void useSettingsStore.getState().hydrate();
    }
    void hydrateConversations().then(async () => {
      await hydrateTasks();
      agentRuntime.loadMessages(useAgentStore.getState().messages);
      await agentRuntime.recoverSession(useProjectStore.getState().currentProject?.id ?? null);
    });
  }, [loadRecents]);

  return (
    <div className="app-shell">
      <TopBar onClone={onClone} onNew={onNew} />
      <div className="workspace">
        <ActivityBar />
        {view === "project" ? <MissionWorkspace /> : (
        <Group key={layoutKey} className="panel-group" orientation="horizontal">
          <Panel id="center" defaultSize={centerSize} minSize="240px">
            <div className="panel">
              <CurrentPage />
            </div>
          </Panel>
          {agentVisible && (
            <>
              <ResizeHandle orientation="horizontal" />
              <Panel id="agent" defaultSize="28%" minSize="290px" maxSize="40%"><AgentPanel /></Panel>
            </>
          )}
        </Group>
        )}
      </div>
      <DialogHost />
      <QuickOpen />
      <CommandPalette />
    </div>
  );
}
