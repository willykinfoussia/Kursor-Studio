import { useEffect, useState } from "react";
import { Toggle } from "../ui/Controls";
import { validateServerConfig } from "../../lib/mcp/MCPConfig";
import { mcpHealthService } from "../../lib/mcp/MCPHealthService";
import { mcpConfigurationManager } from "../../lib/mcp/MCPConfigurationManager";
import { mcpRegistry } from "../../lib/mcp/MCPRegistry";
import { mcpServerManager } from "../../lib/mcp/MCPServerManager";
import type { MCPHealthReport, MCPServerSnapshot } from "../../lib/mcp/types";
import { useProjectStore } from "../../stores/projectStore";

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return <div className="setting-row"><div className="setting-copy"><div className="setting-label">{label}</div><div className="setting-description">{description}</div></div>{children}</div>;
}

export function McpSettings() {
  const projectId = useProjectStore((state) => state.currentProject?.id);
  const [servers, setServers] = useState<MCPServerSnapshot[]>([]);
  const [health, setHealth] = useState<Record<string, MCPHealthReport>>({});
  const [command, setCommand] = useState("node");
  const [args, setArgs] = useState("");
  const [name, setName] = useState("mock");
  const [importText, setImportText] = useState("");
  const [status, setStatus] = useState("");

  const refresh = async () => {
    const list = await mcpServerManager.list(projectId).catch(() => []);
    setServers(list);
    await mcpRegistry.sync(projectId).catch(() => undefined);
  };

  useEffect(() => {
    void refresh();
  }, [projectId]);

  const addStdio = async () => {
    await mcpServerManager.upsert({
      id: name,
      name,
      displayName: name,
      enabled: true,
      transport: "stdio",
      command: command.trim(),
      args: args.split(/\s+/).filter(Boolean),
      scope: "global",
      origin: "user",
      trust: "trusted",
    });
    setStatus("Server saved.");
    await refresh();
  };

  const importJson = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setStatus("Invalid JSON.");
      return;
    }
    const result = await mcpConfigurationManager.importCustom(parsed, { scope: "global" });
    const missing = result.missingSecrets.length;
    const invalid = result.errors.length;
    if (!result.servers.length && invalid) {
      setStatus(result.errors.map((item) => item.message).join(" "));
    } else {
      setStatus(
        [
          `Imported ${result.servers.length} server(s).`,
          invalid ? `${invalid} warning(s).` : "",
          missing ? `${missing} secret(s) to fill.` : "Enable in Capabilities to start.",
        ].filter(Boolean).join(" "),
      );
    }
    await refresh();
  };

  return (
    <>
      <SettingRow label="MCP servers" description="stdio servers expose tools to the agent after discovery. Disabled or disconnected servers are hidden from the model.">
        <button type="button" className="settings-action" onClick={() => void refresh()}>Refresh</button>
      </SettingRow>
      {servers.length === 0 && <div className="setting-description">No MCP servers configured.</div>}
      {servers.map((server) => {
        const report = health[server.id];
        const line = report ? mcpHealthService.line(report) : `${server.status} · ${server.toolCount} tools`;
        return (
          <div className="setting-stack" key={server.id}>
            <div className="setting-label">{server.displayName ?? server.name}</div>
            <div className="setting-description">{line}{server.lastError ? ` · ${server.lastError}` : ""}</div>
            <div className="permission-whitelist-row">
              <Toggle
                checked={server.enabled}
                label={`Enable ${server.name}`}
                onChange={(enabled) => {
                  void (enabled ? mcpServerManager.enable(server.id) : mcpServerManager.disable(server.id)).then(() => refresh());
                }}
              />
              <button type="button" className="settings-action" onClick={() => void mcpHealthService.check(server.id).then((value) => setHealth((current) => ({ ...current, [server.id]: value })))}>Health</button>
              <button type="button" className="settings-action" onClick={() => void mcpServerManager.remove(server.id).then(() => refresh())}>Remove</button>
            </div>
          </div>
        );
      })}
      <div className="setting-stack">
        <div className="setting-label">Add stdio server</div>
        <div className="setting-description">Command and arguments. Secrets must use secretRef, not plaintext.</div>
        <input className="secret-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="server-id" />
        <div className="secret-input-row">
          <input className="secret-input" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="node" />
          <input className="secret-input" value={args} onChange={(event) => setArgs(event.target.value)} placeholder="examples/mcp/mock-server.mjs" />
          <button
            type="button"
            className="settings-action"
            disabled={!validateServerConfig({ id: name, name, command, transport: "stdio" }).valid}
            onClick={() => void addStdio()}
          >
            Add
          </button>
        </div>
      </div>
      <div className="setting-stack">
        <div className="setting-label">Import JSON</div>
        <div className="setting-description">Claude-style mcpServers object. Plaintext secrets are rejected.</div>
        <textarea className="secret-input" rows={6} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='{ "mcpServers": { } }' />
        <button type="button" className="settings-action" disabled={!importText.trim()} onClick={() => void importJson()}>Import</button>
      </div>
      {status && <div className="setting-success">{status}</div>}
    </>
  );
}
