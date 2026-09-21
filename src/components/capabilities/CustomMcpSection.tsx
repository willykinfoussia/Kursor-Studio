import { useEffect, useState } from "react";
import { mcpHealthService } from "../../lib/mcp/MCPHealthService";
import { mcpConfigurationManager } from "../../lib/mcp/MCPConfigurationManager";
import { mcpRegistry } from "../../lib/mcp/MCPRegistry";
import { mcpServerManager } from "../../lib/mcp/MCPServerManager";
import type { MCPHealthReport, MCPServerSnapshot } from "../../lib/mcp/types";
import { mcpServerCapabilityId } from "../../lib/capabilities/ids";
import { openCapability } from "../../lib/workflow/navigation";
import { useCapabilityStore } from "../../stores/capabilityStore";
import { useProjectStore } from "../../stores/projectStore";

function isCustomServer(server: MCPServerSnapshot) {
  return server.origin === "user" || server.origin === "imported" || server.origin === "project";
}

export function CustomMcpSection({ reloadToken = 0 }: { reloadToken?: number }) {
  const refreshCaps = useCapabilityStore((state) => state.refresh);
  const projectId = useProjectStore((state) => state.currentProject?.id ?? null);
  const [servers, setServers] = useState<MCPServerSnapshot[]>([]);
  const [health, setHealth] = useState<Record<string, MCPHealthReport>>({});

  const refresh = async () => {
    const list = await mcpServerManager.list(projectId).catch(() => []);
    setServers(list.filter(isCustomServer));
    await mcpRegistry.sync(projectId).catch(() => undefined);
    void refreshCaps();
  };

  useEffect(() => {
    void refresh();
  }, [projectId, reloadToken]);

  return (
    <section className="mcp-custom">
      <header className="mcp-section-head">
        <div>
          <h3>Custom MCP</h3>
          <p>Install from a Claude-style mcpServers JSON file. Servers stay untrusted until you enable them.</p>
        </div>
      </header>
      {servers.length === 0 && <div className="setting-description">No custom MCP servers yet.</div>}
      <div className="mcp-builtin-grid">
        {servers.map((server) => {
          const report = health[server.id];
          const line = report ? mcpHealthService.line(report) : `${server.trust} · ${server.status} · ${server.toolCount} tools`;
          return (
            <article key={server.id} className="mcp-builtin-card">
              <div className="mcp-builtin-top">
                <strong>{server.displayName ?? server.name}</strong>
                <span className={`cap-status status-${server.trust === "trusted" && (server.status === "ready" || server.status === "connected") ? "enabled" : server.status === "error" ? "error" : "disabled"}`}>
                  {server.trust === "untrusted" ? "Untrusted" : server.trust === "blocked" ? "Blocked" : server.status}
                </span>
              </div>
              <p>{line}{server.lastError ? ` · ${server.lastError}` : ""}</p>
              <div className="mcp-builtin-actions">
                {server.trust !== "trusted" ? (
                  <button
                    type="button"
                    className="settings-action"
                    onClick={() => {
                      void mcpConfigurationManager.approveTrust(server.id).then(() => refresh());
                    }}
                  >
                    Enable
                  </button>
                ) : (
                  <button
                    type="button"
                    className="settings-action"
                    onClick={() => {
                      void (server.enabled ? mcpConfigurationManager.disable(server.id) : mcpConfigurationManager.enable(server.id)).then(() => refresh());
                    }}
                  >
                    {server.enabled ? "Disable" : "Enable"}
                  </button>
                )}
                <button
                  type="button"
                  className="settings-action"
                  onClick={() => {
                    void mcpHealthService.check(server.id).then((value) => setHealth((current) => ({ ...current, [server.id]: value })));
                  }}
                >
                  Health
                </button>
                <button type="button" className="settings-action" onClick={() => openCapability(mcpServerCapabilityId(server.id))}>Details</button>
                <button
                  type="button"
                  className="settings-action"
                  onClick={() => {
                    void mcpServerManager.remove(server.id).then(() => refresh());
                  }}
                >
                  Remove
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
