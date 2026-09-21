import { useMemo, useState } from "react";
import { customMcpInstallService, type CustomMcpPreview, type MissingMcpSecret } from "../../lib/mcp/setup/CustomMcpInstallService";
import { mcpConfigurationManager } from "../../lib/mcp/MCPConfigurationManager";
import type { MCPScope } from "../../lib/mcp/types";
import { useCapabilityStore } from "../../stores/capabilityStore";

export function CustomMcpInstallModal({
  projectId,
  onClose,
  onInstalled,
}: {
  projectId?: string | null;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const refreshCaps = useCapabilityStore((state) => state.refresh);
  const [jsonText, setJsonText] = useState("");
  const [projectScope, setProjectScope] = useState(false);
  const [preview, setPreview] = useState<CustomMcpPreview | null>(null);
  const [parseError, setParseError] = useState("");
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<MissingMcpSecret[]>([]);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");

  const scope: MCPScope = projectScope && projectId ? "project" : "global";
  const options = useMemo(
    () => ({ scope, projectId: scope === "project" ? projectId ?? null : null }),
    [scope, projectId],
  );

  const parseRaw = (): unknown | null => {
    try {
      return JSON.parse(jsonText);
    } catch {
      setParseError("Invalid JSON.");
      setPreview(null);
      return null;
    }
  };

  const runPreview = () => {
    setStatus("");
    const raw = parseRaw();
    if (raw == null) return;
    setParseError("");
    setPreview(customMcpInstallService.preview(raw, options));
  };

  const install = async () => {
    setBusy(true);
    setStatus("");
    try {
      const raw = parseRaw();
      if (raw == null) return;
      setParseError("");
      const nextPreview = customMcpInstallService.preview(raw, options);
      setPreview(nextPreview);
      const result = await mcpConfigurationManager.importCustom(raw, options);
      setMissing(result.missingSecrets);
      setSecretValues({});
      const imported = result.servers.length;
      const warnings = result.errors.length;
      setStatus(
        warnings
          ? `Imported ${imported} server(s) with ${warnings} warning(s). Review and enable them.`
          : imported
            ? `Imported ${imported} server(s). Review secrets, then Enable.`
            : "Nothing was imported.",
      );
      void refreshCaps();
      onInstalled();
      if (imported && result.missingSecrets.length === 0 && warnings === 0) {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const saveSecrets = async () => {
    setBusy(true);
    try {
      for (const item of missing) {
        const value = secretValues[item.key] ?? "";
        if (!value.trim()) continue;
        await customMcpInstallService.storeSecret(item.serverId, item.envName, value);
      }
      const still: MissingMcpSecret[] = [];
      for (const item of missing) {
        const stored = secretValues[item.key]?.trim();
        if (!stored) still.push(item);
      }
      setMissing(still);
      setStatus(still.length ? "Saved. Fill the remaining secrets." : "Secrets saved. Enable the server to start it.");
      void refreshCaps();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="custom-mcp-title">
      <div className="modal-card mcp-wizard">
        <header className="mcp-wizard-head">
          <div>
            <div className="cap-kicker">Custom MCP</div>
            <h3 id="custom-mcp-title">Import JSON</h3>
            <p>Claude-style mcpServers object. Plaintext secrets are rejected. Servers stay untrusted until you Enable them.</p>
          </div>
          <button type="button" className="modal-btn" onClick={onClose}>Close</button>
        </header>
        <textarea
          className="secret-input"
          rows={8}
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
          placeholder='{ "mcpServers": { "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "."] } } }'
        />
        {Boolean(projectId) && (
          <div className="mcp-wizard-form">
            <label>
              <input type="checkbox" checked={projectScope} onChange={(event) => setProjectScope(event.target.checked)} />
              Limit to this project
            </label>
          </div>
        )}
        {parseError && <p className="cap-error">{parseError}</p>}
        {preview && (
          <div className="mcp-custom-preview">
            {preview.servers.length === 0 && <p>No servers in this JSON.</p>}
            {preview.servers.map((server) => (
              <div key={server.id} className={`mcp-check status-${server.valid ? "valid" : "error"}`}>
                <strong>{server.name}</strong>
                <span>
                  {server.transport}
                  {server.command ? ` · ${server.command} ${(server.args ?? []).join(" ")}`.trim() : ""}
                  {server.url ? ` · ${server.url}` : ""}
                  {server.envNames.length ? ` · env ${server.envNames.join(", ")}` : ""}
                </span>
                {server.errors.map((error) => (
                  <em key={`${error.path}-${error.message}`}>{error.path}: {error.message}</em>
                ))}
              </div>
            ))}
            {preview.errors.map((error) => (
              <p key={`${error.path}-${error.message}`} className="cap-error">{error.path ? `${error.path}: ` : ""}{error.message}</p>
            ))}
          </div>
        )}
        {missing.length > 0 && (
          <div className="mcp-wizard-form">
            <p>Store required secrets in SecretStore before enabling.</p>
            {missing.map((item) => (
              <label key={item.key}>
                {item.serverId} / {item.envName}
                <input
                  className="modal-input"
                  type="password"
                  value={secretValues[item.key] ?? ""}
                  onChange={(event) => setSecretValues((current) => ({ ...current, [item.key]: event.target.value }))}
                />
              </label>
            ))}
            <button type="button" className="settings-action" disabled={busy} onClick={() => void saveSecrets()}>Save secrets</button>
          </div>
        )}
        {status && <div className="setting-success">{status}</div>}
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="modal-btn" disabled={!jsonText.trim() || busy} onClick={runPreview}>Preview</button>
          <button type="button" className="modal-btn primary" disabled={!jsonText.trim() || busy} onClick={() => void install()}>
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
