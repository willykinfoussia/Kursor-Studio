import { useEffect, useState } from "react";
import { useAccountStore } from "./stores/accountStore";
import { useProjectStore } from "./stores/projectStore";
import { useSettingsStore } from "./stores/settingsStore";
import { AppShell } from "./components/layout/AppShell";
import { WelcomeScreen } from "./components/onboarding/WelcomeScreen";
import { HomeScreen } from "./components/onboarding/HomeScreen";
import { GitHubDeviceCodeOverlay } from "./components/github/GitHubDeviceCodeOverlay";
import { CloneGitHubDialog } from "./components/project/CloneGitHubDialog";
import { NewProjectDialog } from "./components/project/NewProjectDialog";
import { openProjectAt } from "./lib/project/workspaceActions";
import { bootstrapMcp } from "./lib/mcp/bootstrap";
import { settingsApi } from "./lib/tauri/accountApi";

export default function App() {
  const [ready, setReady] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const account = useAccountStore((state) => state.currentAccount);
  const currentProject = useProjectStore((state) => state.currentProject);
  const unavailable = useProjectStore((state) => state.unavailable);

  useEffect(() => {
    void (async () => {
      await useAccountStore.getState().hydrate();
      await useSettingsStore.getState().hydrate();
      await useProjectStore.getState().loadRecents();
      const settings = useSettingsStore.getState();
      const recents = useProjectStore.getState().recentProjects;
      const accountId = useAccountStore.getState().currentAccount?.id;
      let lastId: string | undefined;
      if (accountId) {
        const records = await settingsApi.globalList(accountId).catch(() => []);
        lastId = records.find((record) => record.key === "last_opened_project_id")?.value;
      }
      const last = recents.find((project) => project.id === lastId) ?? recents[0];
      let opened = false;
      if (settings.openLastProjectOnStartup && last) {
        try {
          opened = await openProjectAt(last.rootPath);
        } catch {
          useProjectStore.getState().setUnavailable(last);
        }
      }
      if (!opened) void bootstrapMcp();
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return <div className="welcome-screen"><div className="welcome-card"><h1>Kursor</h1><p>Loading…</p></div></div>;
  }

  const onboarded = Boolean(account?.onboarded || account?.provider === "github");
  const showHome = onboarded && !currentProject;

  return (
    <>
      {!onboarded && <WelcomeScreen onReady={() => setReady(true)} />}
      {showHome && <HomeScreen onClone={() => setCloneOpen(true)} onNew={() => setNewOpen(true)} />}
      {onboarded && currentProject && !unavailable && (
        <AppShell onClone={() => setCloneOpen(true)} onNew={() => setNewOpen(true)} />
      )}
      {onboarded && unavailable && !currentProject && (
        <HomeScreen onClone={() => setCloneOpen(true)} onNew={() => setNewOpen(true)} />
      )}
      <CloneGitHubDialog open={cloneOpen} onClose={() => setCloneOpen(false)} />
      <NewProjectDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <GitHubDeviceCodeOverlay />
    </>
  );
}
