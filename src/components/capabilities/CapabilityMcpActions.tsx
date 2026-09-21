import { useState } from "react";
import { parseMcpServerCapabilityId } from "../../lib/capabilities/ids";
import type { MCPServerCapability } from "../../lib/capabilities/types";
import { builtInMcpRegistry } from "../../lib/mcp/builtin/registry";
import { mcpConfigurationManager } from "../../lib/mcp/MCPConfigurationManager";
import { mcpHealthService } from "../../lib/mcp/MCPHealthService";
import { mcpRegistry } from "../../lib/mcp/MCPRegistry";
import { mcpServerManager } from "../../lib/mcp/MCPServerManager";
import { useDialogStore } from "../../stores/dialogStore";
import { useMcpSetupStore } from "../../stores/mcpSetupStore";
import { openExternalUrl } from "../../lib/tauri/openUrl";

function isCustomOrigin(origin: string | undefined) {
  return origin === "user" || origin === "imported" || origin === "project";
}

export function CapabilityMcpActions({
  detail,
  onChanged,
  onDeleted,
}: {
  detail: MCPServerCapability;
  onChanged: () => void;
  onDeleted?: () => void;
}) {
  const openWizard = useMcpSetupStore((state) => state.open);
  const serverId = parseMcpServerCapabilityId(detail.id);
  const builtin = serverId ? builtInMcpRegistry.get(serverId) : null;
  const snapshot = serverId ? mcpRegistry.listServers().find((item) => item.id === serverId) : null;
  const connected = detail.connectionStatus === "connected";
  const custom = isCustomOrigin(snapshot?.origin) || (!builtin && Boolean(snapshot));
  const [healthLine, setHealthLine] = useState<string | null>(null);

  return (
    <div className="mcp-detail-actions">
      {builtin && (
        <button type="button" className="settings-action" onClick={() => openWizard(builtin.id)}>
          {snapshot ? "Configure" : "Set up"}
        </button>
      )}
      {custom && snapshot && serverId && snapshot.trust !== "trusted" && (
        <button type="button" className="settings-action" onClick={() => void mcpConfigurationManager.approveTrust(serverId).then(() => onChanged())}>
          Enable
        </button>
      )}
      {snapshot && !snapshot.enabled && serverId && snapshot.trust === "trusted" && (
        <button type="button" className="settings-action" onClick={() => void mcpConfigurationManager.enable(serverId).then(() => onChanged())}>
          Enable
        </button>
      )}
      {snapshot?.enabled && serverId && (
        <button type="button" className="settings-action" onClick={() => void mcpConfigurationManager.disable(serverId).then(() => onChanged())}>
          Disable
        </button>
      )}
      {snapshot && !connected && snapshot.enabled && serverId && (
        <button type="button" className="settings-action" onClick={() => void mcpConfigurationManager.reconnect(serverId).then(() => onChanged())}>
          Reconnect
        </button>
      )}
      {connected && serverId && (
        <button type="button" className="settings-action" onClick={() => void mcpConfigurationManager.disconnect(serverId).then(() => onChanged())}>
          Disconnect
        </button>
      )}
      {custom && serverId && (
        <button
          type="button"
          className="settings-action"
          onClick={() => {
            void mcpHealthService.check(serverId).then((report) => setHealthLine(mcpHealthService.line(report)));
          }}
        >
          Health
        </button>
      )}
      {detail.documentationUrl && (
        <button type="button" className="settings-action" onClick={() => void openExternalUrl(detail.documentationUrl!)}>
          Open docs
        </button>
      )}
      {custom && serverId && (
        <button
          type="button"
          className="settings-action danger"
          onClick={() => {
            void useDialogStore.getState().askConfirm(
              "Remove MCP",
              `Remove "${detail.displayName}" from this workspace?`,
              "Remove",
              true,
            ).then((ok) => {
              if (!ok) return;
              void mcpServerManager.remove(serverId).then(() => mcpRegistry.sync()).then(() => (onDeleted ?? onChanged)());
            });
          }}
        >
          Remove
        </button>
      )}
      {healthLine && <p className="cap-health-line">{healthLine}</p>}
    </div>
  );
}
