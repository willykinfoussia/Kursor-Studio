import { mcpConfigurationManager } from "../../lib/mcp/MCPConfigurationManager";
import { useMcpTrustStore } from "../../stores/mcpTrustStore";
import { useCapabilityStore } from "../../stores/capabilityStore";

export function McpProjectTrustDialog() {
  const pending = useMcpTrustStore((state) => state.pending);
  const dismiss = useMcpTrustStore((state) => state.dismiss);
  const refresh = useCapabilityStore((state) => state.refresh);
  const current = pending[0];
  if (!current) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="mcp-trust-title">
      <div className="modal-card">
        <h3 id="mcp-trust-title">This project wants to enable {current.displayName ?? current.name}</h3>
        <p>
          `.kursor/mcp.json` declared the MCP server `{current.id}`. Review it before Kursor starts it or
          injects credentials.
        </p>
        <div className="modal-actions">
          <button type="button" className="modal-btn" onClick={() => dismiss(current.id)}>Later</button>
          <button
            type="button"
            className="modal-btn danger"
            onClick={() => {
              void mcpConfigurationManager.denyTrust(current.id).then(() => {
                dismiss(current.id);
                void refresh();
              });
            }}
          >
            Block
          </button>
          <button
            type="button"
            className="modal-btn primary"
            onClick={() => {
              void mcpConfigurationManager.approveTrust(current.id).then(() => {
                dismiss(current.id);
                void refresh();
              });
            }}
          >
            Enable
          </button>
        </div>
      </div>
    </div>
  );
}
