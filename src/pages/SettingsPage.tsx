import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { SelectControl, Toggle } from "../components/ui/Controls";
import { getModelName, isBuiltinModelId, listAvailableModels } from "../lib/agent/config";
import { MODEL_TASK_TYPES, type ModelTaskType } from "../lib/agent/routing";
import { describeAllowRule } from "../lib/agent/permissions/policy";
import type { PermissionMode } from "../lib/agent/permissions/types";
import { AI_GATEWAY_KEY, secretStore } from "../lib/agent/SecretStore";
import { availableShells } from "../lib/terminal/shellUtils";
import { useSettingsStore } from "../stores/settingsStore";
import { useAccountStore } from "../stores/accountStore";
import { useUiStore } from "../stores/uiStore";
import { useGraphStore } from "../stores/graphStore";
import { useDialogStore } from "../stores/dialogStore";
import { settingsRepository } from "../lib/storage/settingsRepository";
import { resetApplicationData } from "../lib/storage/applicationData";
import { McpSettings } from "../components/settings/McpSettings";
import { SETTINGS_SECTIONS } from "../types/ui";

const TASK_TYPE_LABELS: Record<ModelTaskType, string> = {
  coding: "Coding",
  planning: "Planning",
  research: "Research",
  review: "Review",
  summarization: "Summarization",
  "simple-edit": "Simple edit",
};

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return <div className="setting-row"><div className="setting-copy"><div className="setting-label">{label}</div><div className="setting-description">{description}</div></div>{children}</div>;
}

function YoloAndWhitelistControls() {
  const yoloMode = useSettingsStore((state) => state.yoloMode);
  const whitelist = useSettingsStore((state) => state.permissionWhitelist);
  const update = useSettingsStore((state) => state.update);
  return (
    <>
      <SettingRow label="Yolo mode" description="Allow all agent tool calls without asking. Protected files and blocked commands stay denied.">
        <Toggle checked={yoloMode} label="Yolo mode" onChange={(value) => update("yoloMode", value)} />
      </SettingRow>
      <div className="setting-stack">
        <div className="setting-label">Permanent allows</div>
        <div className="setting-description">Commands, paths and domains allowed without asking. Added from Allow permanently.</div>
        {whitelist.length === 0
          ? <div className="setting-description">None yet.</div>
          : (
            <div className="permission-whitelist">
              {whitelist.map((rule, index) => (
                <div className="permission-whitelist-row" key={`${index}-${describeAllowRule(rule)}`}>
                  <span className="permission-whitelist-label">{describeAllowRule(rule)}</span>
                  <button
                    type="button"
                    className="settings-action"
                    onClick={() => update("permissionWhitelist", whitelist.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        <button
          type="button"
          className="settings-action"
          disabled={whitelist.length === 0}
          onClick={() => update("permissionWhitelist", [])}
        >
          Clear
        </button>
      </div>
    </>
  );
}

function GitHubConnectControls() {
  const githubConnected = useAccountStore((state) => state.githubConnected);
  const signInGitHub = useAccountStore((state) => state.signInGitHub);
  const signOutGitHub = useAccountStore((state) => state.signOutGitHub);
  const isLoading = useAccountStore((state) => state.isLoading);
  const statusMessage = useAccountStore((state) => state.statusMessage);
  const error = useAccountStore((state) => state.error);
  return (
    <>
      {error && <div className="setting-error">{error}</div>}
      {statusMessage && <div className="setting-success">{statusMessage}</div>}
      {githubConnected
        ? <button type="button" className="settings-action" onClick={() => void signOutGitHub()}>Disconnect</button>
        : (
          <button type="button" className="settings-action" disabled={isLoading} onClick={() => void signInGitHub().catch(() => undefined)}>
            {isLoading ? (statusMessage ?? "Opening GitHub…") : "Continue with GitHub"}
          </button>
        )}
    </>
  );
}

function AccountSettings() {
  const account = useAccountStore((state) => state.currentAccount);
  const githubConnected = useAccountStore((state) => state.githubConnected);
  const githubUsername = useAccountStore((state) => state.githubUsername);
  return (
    <>
      <SettingRow label="Account" description={account?.provider === "github" ? "Signed in with GitHub." : "Local account. GitHub is optional."}>
        <div>{account?.displayName || account?.username || "Local Account"}</div>
      </SettingRow>
      <SettingRow label="GitHub" description={githubConnected ? `Connected as @${githubUsername ?? account?.username}` : "Not connected"}>
        <GitHubConnectControls />
      </SettingRow>
    </>
  );
}

function GitHubSettings() {
  const account = useAccountStore((state) => state.currentAccount);
  const githubConnected = useAccountStore((state) => state.githubConnected);
  const githubUsername = useAccountStore((state) => state.githubUsername);
  const [clientId, setClientId] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!account?.id) return;
    void settingsRepository.listForAccount(account.id).then((rows) => {
      const row = rows.find((item) => item.key === "github_oauth_client_id");
      if (row) setClientId(row.value);
    }).catch(() => undefined);
  }, [account?.id]);

  const saveClientId = async () => {
    if (!account?.id) return;
    await settingsRepository.setForAccount(account.id, "github_oauth_client_id", clientId.trim());
    setSaved("Saved. Use Connect GitHub to sign in.");
  };

  return (
    <>
      <SettingRow label="Connection" description="GitHub is used for repositories only. Tokens stay in the OS credential store.">
        <div>{githubConnected ? `@${githubUsername}` : "Not connected"}</div>
      </SettingRow>
      <GitHubConnectControls />
      <div className="setting-stack">
        <div className="setting-label">OAuth client ID</div>
        <div className="setting-description">Used when KURSOR_GITHUB_CLIENT_ID is not set. Create a GitHub OAuth App, enable Device Flow, and register http://127.0.0.1:8742/callback.</div>
        <div className="secret-input-row">
          <input className="secret-input" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Ov23…" />
          <button type="button" className="settings-action" disabled={!clientId.trim() || !account} onClick={() => void saveClientId()}>Save</button>
        </div>
        {saved && <div className="setting-success">{saved}</div>}
      </div>
    </>
  );
}

export function SettingsPage() {
  const section = useUiStore((state) => state.settingsSection);
  const setSection = useUiStore((state) => state.setSettingsSection);
  const [apiKey, setApiKey] = useState("");
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [keyStatus, setKeyStatus] = useState("");
  const [customModelId, setCustomModelId] = useState("");
  const [customModelError, setCustomModelError] = useState("");
  const settings = useSettingsStore();
  const availableModels = listAvailableModels(settings.customModels);

  useEffect(() => {
    void secretStore.get(AI_GATEWAY_KEY).then((value) => setKeyConfigured(Boolean(value)));
  }, []);

  const saveApiKey = async () => {
    if (!apiKey.trim()) return;
    await secretStore.set(AI_GATEWAY_KEY, apiKey.trim());
    setApiKey("");
    setKeyConfigured(true);
    setKeyStatus("Saved in secure storage");
  };

  const toggleSimulatedFailure = (modelId: string) => {
    const next = settings.simulateFailureFor.includes(modelId)
      ? settings.simulateFailureFor.filter((id) => id !== modelId)
      : [...settings.simulateFailureFor, modelId];
    settings.update("simulateFailureFor", next);
  };

  const addCustomModel = () => {
    const result = settings.addCustomModel(customModelId);
    if (!result.ok) {
      setCustomModelError(result.error);
      return;
    }
    setCustomModelId("");
    setCustomModelError("");
  };

  return (
    <main className="page">
      <header className="page-heading"><div><h1 className="page-title">Settings</h1><div className="page-subtitle">Configure your Kursor workspace.</div></div></header>
      <div className="settings-layout">
        <nav className="settings-nav">
          {SETTINGS_SECTIONS.map((item) => <button type="button" className={`settings-nav-btn ${section === item ? "active" : ""}`} key={item} onClick={() => setSection(item)}>{item}</button>)}
        </nav>
        <section className="settings-panel">
          <h2>{section}</h2>
          {section === "Account" && <AccountSettings />}
          {section === "GitHub" && <GitHubSettings />}
          {section === "MCP" && <McpSettings />}
          {section === "AI" && <>
            <SettingRow label="Scope" description="These are account-wide defaults. Open Project Settings to override the model for the current project.">
              <button type="button" className="settings-action" onClick={() => useUiStore.getState().setView("project-settings")}>Project Settings</button>
            </SettingRow>
            <SettingRow label="Default model" description="First model attempted for new requests.">
              <SelectControl value={settings.defaultModel} onChange={(event) => settings.update("defaultModel", event.target.value)}>
                {availableModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
              </SelectControl>
            </SettingRow>
            <SettingRow label="Automatic fallback" description="Try the next configured model when a provider fails.">
              <Toggle checked={settings.fallbackEnabled} label="Automatic fallback" onChange={(value) => settings.update("fallbackEnabled", value)} />
            </SettingRow>
            <div className="setting-stack">
              <div className="setting-label">Task routing</div>
              <div className="setting-description">Preferred model per task type. Capabilities come from the explicit catalog, not the model name. Fallback still uses compatible models first.</div>
              {MODEL_TASK_TYPES.map((taskType) => (
                <SettingRow
                  key={taskType}
                  label={TASK_TYPE_LABELS[taskType]}
                  description={`Preferred model for ${TASK_TYPE_LABELS[taskType].toLowerCase()} tasks.`}
                >
                  <SelectControl
                    value={settings.modelPolicy.routes[taskType]?.preferredModelId ?? ""}
                    onChange={(event) => {
                      const preferredModelId = event.target.value || undefined;
                      settings.update("modelPolicy", {
                        ...settings.modelPolicy,
                        routes: {
                          ...settings.modelPolicy.routes,
                          [taskType]: {
                            ...settings.modelPolicy.routes[taskType],
                            preferredModelId,
                          },
                        },
                      });
                    }}
                  >
                    <option value="">Auto</option>
                    {availableModels.map((model) => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </SelectControl>
                </SettingRow>
              ))}
            </div>
            <div className="setting-stack">
              <div className="setting-label">Fallback order</div>
              <div className="model-order">
                {settings.modelOrder.map((modelId, index) => (
                  <div className="model-order-row" key={modelId}>
                    <span>{index + 1}</span>
                    <span className="model-order-name" title={modelId}>{getModelName(modelId, settings.customModels)}</span>
                    <div className="model-order-actions">
                      <button type="button" aria-label={`Move ${getModelName(modelId, settings.customModels)} up`} disabled={index === 0} onClick={() => settings.moveModel(modelId, "up")}><ChevronUp size={13} /></button>
                      <button type="button" aria-label={`Move ${getModelName(modelId, settings.customModels)} down`} disabled={index === settings.modelOrder.length - 1} onClick={() => settings.moveModel(modelId, "down")}><ChevronDown size={13} /></button>
                      {!isBuiltinModelId(modelId) && (
                        <button type="button" aria-label={`Remove ${getModelName(modelId, settings.customModels)}`} onClick={() => settings.removeCustomModel(modelId)}><X size={13} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="setting-stack">
              <div className="setting-label">Custom models</div>
              <div className="setting-description">Paste a Vercel AI Gateway model id. It is used as-is for requests and fallback.</div>
              <div className="secret-input-row">
                <input
                  className="secret-input"
                  value={customModelId}
                  onChange={(event) => {
                    setCustomModelId(event.target.value);
                    if (customModelError) setCustomModelError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomModel();
                    }
                  }}
                  placeholder="moonshotai/kimi-k2.5"
                />
                <button type="button" className="settings-action" disabled={!customModelId.trim()} onClick={addCustomModel}>Add</button>
              </div>
              {customModelError && <div className="setting-error">{customModelError}</div>}
            </div>
            <div className="setting-stack">
              <div className="setting-label">AI Gateway API key</div>
              <div className="setting-description">Loaded securely through the Tauri backend. The value is never displayed or logged.</div>
              <div className="secret-input-row">
                <input type="password" className="secret-input" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={keyConfigured ? "Configured ••••••••" : "vck_…"} />
                <button type="button" className="settings-action" disabled={!apiKey.trim()} onClick={() => void saveApiKey()}>Save</button>
              </div>
              {keyStatus && <div className="setting-success">{keyStatus}</div>}
            </div>
            <SettingRow label="Agent permission mode" description="Limits what the agent can do without asking. Full access still cannot leave the project or run blocked commands.">
              <SelectControl
                value={settings.permissionMode}
                onChange={(event) => settings.update("permissionMode", event.target.value as PermissionMode)}
              >
                <option value="read-only">Read-only</option>
                <option value="workspace-write">Workspace write</option>
                <option value="full-access">Full access (high risk)</option>
              </SelectControl>
            </SettingRow>
            <SettingRow label="Confirm destructive actions" description="Always request approval before destructive operations."><Toggle checked={settings.confirmDestructive} label="Confirm destructive actions" onChange={(value) => settings.update("confirmDestructive", value)} /></SettingRow>
            <YoloAndWhitelistControls />
            {import.meta.env.DEV && <div className="setting-stack">
              <div className="setting-label">Fallback diagnostics</div>
              <div className="setting-description">Simulate provider outages to verify the routing chain.</div>
              <div className="diagnostic-models">
                {availableModels.map((model) => <button type="button" className={settings.simulateFailureFor.includes(model.id) ? "active" : ""} key={model.id} onClick={() => toggleSimulatedFailure(model.id)}>{model.name}</button>)}
              </div>
            </div>}
          </>}
          {section === "Appearance" && <SettingRow label="Theme" description="Color theme used throughout Kursor."><SelectControl value={settings.theme} onChange={(event) => settings.update("theme", event.target.value as "Kursor Dark" | "System")}><option>Kursor Dark</option><option>System</option></SelectControl></SettingRow>}
          {section === "Editor" && <>
            <SettingRow label="Font size" description="Editor font size in pixels."><SelectControl value={settings.fontSize} onChange={(event) => settings.update("fontSize", Number(event.target.value))}><option>12</option><option>13</option><option>14</option><option>16</option></SelectControl></SettingRow>
            <SettingRow label="Auto-save" description="Prepared for a future delay or focus-change save. Currently off.">
              <Toggle checked={settings.autoSave} label="Auto-save" onChange={(value) => {
                settings.update("autoSave", value);
                settings.update("autoSaveMode", value ? "afterDelay" : "off");
              }} />
            </SettingRow>
          </>}
          {section === "Terminal" && <SettingRow label="Default shell" description="Shell used when creating a native terminal session."><SelectControl value={settings.terminalShell} onChange={(event) => settings.update("terminalShell", event.target.value)}>{Array.from(new Set([...availableShells(), settings.terminalShell])).map((shell) => <option key={shell} value={shell}>{shell}</option>)}</SelectControl></SettingRow>}
          {section === "Security" && <>
            <SettingRow label="Agent permission mode" description="Read-only, workspace write, or full access (high risk). Protected files and blocked commands stay denied.">
              <SelectControl
                value={settings.permissionMode}
                onChange={(event) => settings.update("permissionMode", event.target.value as PermissionMode)}
              >
                <option value="read-only">Read-only</option>
                <option value="workspace-write">Workspace write</option>
                <option value="full-access">Full access (high risk)</option>
              </SelectControl>
            </SettingRow>
            <SettingRow label="Confirm destructive actions" description="Required for deletes and unrestricted commands."><Toggle checked={settings.confirmDestructive} label="Confirm destructive actions" onChange={(value) => settings.update("confirmDestructive", value)} /></SettingRow>
            <YoloAndWhitelistControls />
          </>}
          {section === "AI" && <>
            <h3 className="task-section-title">Agent</h3>
            <SettingRow label="Max agent steps" description="Stop a turn after this many model steps. Leave empty for no limit.">
              <input
                className="composer-input"
                type="number"
                min={1}
                step={1}
                placeholder="Unlimited"
                value={settings.maxAgentSteps ?? ""}
                onChange={(event) => settings.update("maxAgentSteps", event.target.value === "" ? null : Number(event.target.value))}
              />
            </SettingRow>
            <SettingRow label="Max tool calls" description="Stop a turn after this many tool calls. Leave empty for no limit.">
              <input
                className="composer-input"
                type="number"
                min={1}
                step={1}
                placeholder="Unlimited"
                value={settings.maxToolCalls ?? ""}
                onChange={(event) => settings.update("maxToolCalls", event.target.value === "" ? null : Number(event.target.value))}
              />
            </SettingRow>
            <SettingRow label="Compact tool calls" description="Show a short summary for completed tools until you expand them.">
              <Toggle checked={settings.compactTools} label="Compact tool calls" onChange={(value) => settings.update("compactTools", value)} />
            </SettingRow>
            <SettingRow label="Auto-collapse completed tools" description="Keep the latest active operation expanded and compact finished work.">
              <Toggle checked={settings.autoCollapseCompletedTools} label="Auto-collapse completed tools" onChange={(value) => settings.update("autoCollapseCompletedTools", value)} />
            </SettingRow>
            <SettingRow label="Show tool details" description="Always show tool input and output.">
              <Toggle checked={settings.showToolDetails} label="Show tool details" onChange={(value) => settings.update("showToolDetails", value)} />
            </SettingRow>
            <SettingRow label="Sticky current task" description="Pin a compact current-task bar during long runs.">
              <Toggle checked={settings.stickyCurrentTask} label="Sticky current task" onChange={(value) => settings.update("stickyCurrentTask", value)} />
            </SettingRow>
            <SettingRow label="Suggest skills & specs after runs" description="After a successful run, analyze the conversation and propose skill or spec updates for review.">
              <Toggle checked={settings.knowledgeReflectEnabled} label="Suggest skills and specs" onChange={(value) => settings.update("knowledgeReflectEnabled", value)} />
            </SettingRow>
            <h3 className="task-section-title">AI change review</h3>
            <SettingRow label="Diff layout" description="Inline or side-by-side comparison in the Review workspace.">
              <SelectControl value={settings.reviewDiffLayout} onChange={(event) => settings.update("reviewDiffLayout", event.target.value as "split" | "unified")}>
                <option value="split">Side-by-side</option>
                <option value="unified">Inline</option>
              </SelectControl>
            </SettingRow>
            <SettingRow label="Advance after a decision" description="Move to the next pending file after accepting or rejecting one.">
              <Toggle checked={settings.reviewAdvanceOnDecision} label="Advance on decision" onChange={(value) => settings.update("reviewAdvanceOnDecision", value)} />
            </SettingRow>
          </>}
          {section === "Projects" && <>
            <SettingRow label="Show excluded directories" description="Temporarily show .git, node_modules, dist, build, target, .vscode and .idea."><Toggle checked={settings.showExcludedDirectories} label="Show excluded directories" onChange={(value) => settings.update("showExcludedDirectories", value)} /></SettingRow>
            <SettingRow label="Open last project on startup" description="Restore the most recently opened project when Kursor launches.">
              <Toggle checked={settings.openLastProjectOnStartup} label="Open last project on startup" onChange={(value) => settings.update("openLastProjectOnStartup", value)} />
            </SettingRow>
            <SettingRow label="Project settings" description="Name, path, GitHub and project AI overrides.">
              <button type="button" className="settings-action" onClick={() => useUiStore.getState().setView("project-settings")}>Open project settings</button>
            </SettingRow>
            <SettingRow label="Knowledge Center" description="Rebuild the deterministic specs graph used for navigation and agent context. Cache lives in .kursor/graph/.">
              <button type="button" className="settings-action" onClick={() => { useUiStore.getState().setView("graph"); void useGraphStore.getState().rebuild(); }}>Rebuild specs graph</button>
            </SettingRow>
          </>}
          {section === "Advanced" && (
            <SettingRow label="Clear application data" description="Deletes Kursor settings, conversations, memory and RAG index. Project files on disk are never removed.">
              <button
                type="button"
                className="settings-action danger"
                onClick={() => {
                  void (async () => {
                    const ok = await useDialogStore.getState().askConfirm(
                      "Clear application data?",
                      "This removes local Kursor data (SQLite, vectors, cache). Your project folders on disk are not deleted.",
                      "Clear data",
                      true,
                    );
                    if (!ok) return;
                    await resetApplicationData();
                    window.location.reload();
                  })();
                }}
              >
                Clear application data
              </button>
            </SettingRow>
          )}
        </section>
      </div>
    </main>
  );
}
