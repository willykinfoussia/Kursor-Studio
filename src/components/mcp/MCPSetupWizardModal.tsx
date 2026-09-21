import { useEffect, useState } from "react";
import { MCPSetupWizard } from "../../lib/mcp/setup/MCPSetupWizard";
import { blenderSetupService } from "../../lib/mcp/setup/BlenderSetupService";
import { githubSetupService } from "../../lib/mcp/setup/GitHubSetupService";
import { composioSetupService } from "../../lib/mcp/setup/ComposioSetupService";
import { playwrightSetupService } from "../../lib/mcp/setup/PlaywrightSetupService";
import { githubSettings, type GitHubAccess } from "../../lib/mcp/builtin/github";
import { composioSettings } from "../../lib/mcp/builtin/composio";
import { playwrightSettings, type PlaywrightBrowser } from "../../lib/mcp/builtin/playwright";
import { openExternalUrl } from "../../lib/tauri/openUrl";
import { useAccountStore } from "../../stores/accountStore";
import { useMcpSetupStore } from "../../stores/mcpSetupStore";
import { useCapabilityStore } from "../../stores/capabilityStore";
import { useProjectStore } from "../../stores/projectStore";
import { mcpHealthService } from "../../lib/mcp/MCPHealthService";

export function MCPSetupWizardModal() {
  const catalogId = useMcpSetupStore((state) => state.catalogId);
  const jumpStep = useMcpSetupStore((state) => state.jumpStep);
  const close = useMcpSetupStore((state) => state.close);
  const refreshCaps = useCapabilityStore((state) => state.refresh);
  const projectId = useProjectStore((state) => state.currentProject?.id ?? null);
  const [wizard, setWizard] = useState<MCPSetupWizard | null>(null);
  const [tick, setTick] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const [dryRun, setDryRun] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const githubConnected = useAccountStore((state) => state.githubConnected);
  const githubUsername = useAccountStore((state) => state.githubUsername);

  useEffect(() => {
    if (!catalogId) {
      setWizard(null);
      return;
    }
    const next = new MCPSetupWizard(catalogId);
    if (jumpStep) next.jumpTo(jumpStep);
    setWizard(next);
    setDryRun("");
    void next.refresh().then(() => setTick((value) => value + 1));
  }, [catalogId, jumpStep]);

  useEffect(() => {
    if (catalogId !== "builtin.mcp.github") return;
    void githubSetupService.account().then((account) => setGithubUser(account.username ?? githubUsername ?? null));
  }, [catalogId, githubConnected, githubUsername]);

  if (!catalogId || !wizard) return null;
  const definition = wizard.definition();
  const step = wizard.currentStep();
  const steps = wizard.steps();
  const last = wizard.state.stepIndex >= steps.length - 1;
  void tick;

  const rerender = () => setTick((value) => value + 1);

  const patch = (values: Record<string, unknown>) => {
    wizard.patchSettings(values);
    void wizard.refresh().then(rerender);
    rerender();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="mcp-wizard-title">
      <div className="modal-card mcp-wizard">
        <header className="mcp-wizard-head">
          <div>
            <div className="cap-kicker">MCP setup</div>
            <h3 id="mcp-wizard-title">{definition.displayName}</h3>
            <p>{step.description}</p>
          </div>
          <button type="button" className="modal-btn" onClick={close}>Close</button>
        </header>
        <ol className="mcp-wizard-steps">
          {steps.map((item, index) => (
            <li key={item.id} className={index === wizard.state.stepIndex ? "active" : index < wizard.state.stepIndex ? "done" : ""}>
              <button type="button" onClick={() => { wizard.jumpTo(item.id); rerender(); }}>{item.title}</button>
            </li>
          ))}
        </ol>
        <div className="mcp-wizard-body">
          <WizardStep
            wizard={wizard}
            apiKey={apiKey}
            setApiKey={setApiKey}
            githubUser={githubUser}
            patch={patch}
            rerender={rerender}
          />
          {wizard.state.error && <p className="cap-error">{wizard.state.error}</p>}
          {dryRun && <pre className="cap-schema">{dryRun}</pre>}
        </div>
        <div className="mcp-wizard-logs">
          <button type="button" className="cap-link" onClick={() => setShowLogs((value) => !value)}>
            {showLogs ? "Hide logs" : "Show logs"}
          </button>
          {showLogs && (
            <ul>
              {wizard.state.logs.map((event, index) => (
                <li key={`${event.at}-${index}`}>{event.message}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={() => { wizard.back(); rerender(); }} disabled={wizard.state.stepIndex === 0}>Back</button>
          <button
            type="button"
            className="modal-btn"
            onClick={() => {
              void wizard.dryRun().then(async (result) => {
                let health = "";
                try {
                  const report = await mcpHealthService.check(definition.serverId);
                  health = mcpHealthService.line(report);
                } catch {
                  health = "Not started yet";
                }
                setDryRun(JSON.stringify({ ...result, health }, null, 2));
                rerender();
              });
            }}
          >
            Test configuration
          </button>
          {!last ? (
            <button
              type="button"
              className="modal-btn primary"
              disabled={!wizard.state.canContinue || wizard.state.busy}
              onClick={() => { void wizard.next().then(rerender); }}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="modal-btn primary"
              disabled={wizard.state.busy}
              onClick={() => {
                void wizard.connect(projectId).then(() => {
                  void refreshCaps();
                  close();
                }).catch(rerender);
              }}
            >
              {wizard.state.busy ? "Connecting…" : "Connect"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WizardStep({
  wizard,
  apiKey,
  setApiKey,
  githubUser,
  patch,
  rerender,
}: {
  wizard: MCPSetupWizard;
  apiKey: string;
  setApiKey: (value: string) => void;
  githubUser: string | null;
  patch: (values: Record<string, unknown>) => void;
  rerender: () => void;
}) {
  const step = wizard.currentStep().id;
  const settings = wizard.state.settings;
  const validations = wizard.state.validations;
  const definition = wizard.definition();

  if (step === "blender" || step === "uv" || step === "node" || step === "account" || step === "addon" || step === "server") {
    return (
      <div className="mcp-wizard-checks">
        {Object.entries(validations).map(([name, item]) => (
          <div key={name} className={`mcp-check status-${item.status}`}>
            <strong>{name}</strong>
            <span>{item.message}</span>
            {item.repair?.map((action) => (
              <button
                key={action.id}
                type="button"
                className="settings-action"
                onClick={() => {
                  void runRepair(wizard, action.id).then(rerender);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (step === "permissions") {
    return (
      <div>
        {definition.serverId === "blender" && (
          <p className="cap-error">Blender MCP can execute LLM-generated Python inside Blender. This is never hidden.</p>
        )}
        <ul className="cap-perms">
          {definition.permissions.map((permission) => (
            <li key={permission.id}>
              <strong>{permission.group}</strong>
              <span>{permission.action} · {permission.risk}</span>
              <em>{permission.explanation}</em>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (step === "access") {
    const current = githubSettings(settings);
    return (
      <div className="mcp-wizard-form">
        <p>{githubUser ? `Signed in as @${githubUser}` : "Connect GitHub in Settings first."}</p>
        {(["read-only", "standard", "advanced"] as GitHubAccess[]).map((access) => (
          <label key={access}>
            <input
              type="radio"
              name="github-access"
              checked={current.access === access}
              onChange={() => patch(githubSetupService.accessFromMode(access))}
            />
            {access}
          </label>
        ))}
      </div>
    );
  }

  if (step === "toolsets") {
    const current = githubSettings(settings);
    const groups = githubSetupService.toolsetsFor(current);
    return (
      <div className="mcp-wizard-form">
        {[...groups.context, ...groups.advanced].map((toolset) => (
          <label key={toolset}>
            <input
              type="checkbox"
              checked={current.toolsets.includes(toolset)}
              onChange={(event) => {
                const toolsets = event.target.checked
                  ? [...current.toolsets, toolset]
                  : current.toolsets.filter((item) => item !== toolset);
                patch({ toolsets });
              }}
            />
            {toolset}{groups.advanced.includes(toolset) ? " (advanced)" : ""}
          </label>
        ))}
      </div>
    );
  }

  if (step === "credential") {
    return (
      <div className="mcp-wizard-form">
        <p>{validations["api-key"]?.message ?? "Store the Composio API key in SecretStore."}</p>
        <input
          className="modal-input"
          type="password"
          value={apiKey}
          placeholder="Composio API key"
          onChange={(event) => setApiKey(event.target.value)}
        />
        <button
          type="button"
          className="settings-action"
          onClick={() => {
            void composioSetupService.storeKey(apiKey).then(() => wizard.refresh()).then(rerender);
          }}
        >
          Save key
        </button>
      </div>
    );
  }

  if (step === "toolkits" || step === "tools") {
    const current = composioSettings(settings);
    const items = step === "toolkits" ? current.enabledToolkits : current.enabledTools;
    return (
      <div className="mcp-wizard-form">
        <p>Nothing is enabled automatically. Add identifiers after the first connection, or leave empty.</p>
        <p>{items.length ? items.join(", ") : "None selected"}</p>
      </div>
    );
  }

  if (step === "browser" || step === "mode" || step === "advanced") {
    const current = playwrightSettings(settings);
    const browsers: PlaywrightBrowser[] = ["chrome", "firefox", "webkit", "msedge"];
    return (
      <div className="mcp-wizard-form">
        {step === "browser" && browsers.map((browser) => (
          <label key={browser}>
            <input type="radio" name="pw-browser" checked={current.browser === browser} onChange={() => patch({ browser })} />
            {browser}
          </label>
        ))}
        {step === "mode" && (
          <label>
            <input type="checkbox" checked={!current.headless} onChange={(event) => patch({ headless: !event.target.checked })} />
            Headed (watch the browser)
          </label>
        )}
        {step === "advanced" && (
          <>
            <label>Width <input className="modal-input" type="number" value={current.viewportWidth} onChange={(event) => patch({ viewportWidth: Number(event.target.value) })} /></label>
            <label>Height <input className="modal-input" type="number" value={current.viewportHeight} onChange={(event) => patch({ viewportHeight: Number(event.target.value) })} /></label>
            <label>Proxy <input className="modal-input" value={current.proxy ?? ""} onChange={(event) => patch({ proxy: event.target.value || undefined })} /></label>
            <button
              type="button"
              className="settings-action"
              onClick={() => {
                void playwrightSetupService.chooseSecretsFile().then((path) => {
                  if (path) patch({ secretsFile: path });
                });
              }}
            >
              Choose secrets file
            </button>
          </>
        )}
      </div>
    );
  }

  if (step === "connect" || step === "verify") {
    return (
      <div>
        <p>Review the checks, then connect. Secrets stay in SecretStore.</p>
        <ul>
          {wizard.summaryLines().map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
    );
  }

  return <p>{wizard.currentStep().description}</p>;
}

async function runRepair(wizard: MCPSetupWizard, actionId: string) {
  const definition = wizard.definition();
  if (actionId.startsWith("docs:")) {
    await openExternalUrl(definition.docsUrl);
    return;
  }
  if (actionId === "locate:blender") {
    const path = await blenderSetupService.chooseBlender();
    if (path) wizard.patchSettings({ blenderPath: path });
  } else if (actionId === "locate:repo" || actionId === "detect:repo") {
    const path = await blenderSetupService.chooseRepo();
    if (path) wizard.patchSettings({ repoPath: path });
  } else if (actionId === "retry:addon") {
    await blenderSetupService.verifyAddon(wizard.state.settings);
  } else if (actionId === "connect:github") {
    await useAccountStore.getState().signInGitHub().catch(() => undefined);
  } else if (actionId.startsWith("locate:")) {
    const name = actionId.slice("locate:".length);
    if (name === "uv") {
      const located = await blenderSetupService.detectUv();
      if (located.path) wizard.patchSettings({ uvPath: located.path });
    }
  }
  await wizard.refresh();
}
