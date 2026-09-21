import { useMemo } from "react";
import { builtInMcpRegistry } from "../../lib/mcp/builtin/registry";
import { mcpRegistry } from "../../lib/mcp/MCPRegistry";
import { useCapabilityStore } from "../../stores/capabilityStore";
import { useMcpSetupStore } from "../../stores/mcpSetupStore";
import { openCapability } from "../../lib/workflow/navigation";
import { mcpServerCapabilityId } from "../../lib/capabilities/ids";
import type { CapabilityStatusInput } from "../../lib/capabilities/presentationalStatus";
import type { BuiltInMCPInstance } from "../../lib/mcp/builtin/types";
import { CapabilityIcon } from "./CapabilityIcon";
import { CapabilityStatus } from "./CapabilityStatus";

function statusFromInstance(instance: BuiltInMCPInstance): CapabilityStatusInput {
  const ready = instance.status === "ready" || instance.status === "connected";
  return {
    kind: "mcp",
    type: "mcp",
    status: instance.status === "error"
      ? "error"
      : instance.status === "disabled"
        ? "disabled"
        : instance.status === "known" || instance.status === "setup-incomplete"
          ? "unavailable"
          : "enabled",
    enabled: instance.snapshot?.enabled ?? false,
    connectionStatus: instance.status === "error"
      ? "error"
      : instance.status === "disabled"
        ? "disabled"
        : ready
          ? "connected"
          : "disconnected",
    tags: [instance.status],
    lastError: instance.snapshot?.lastError ?? undefined,
  };
}

export function BuiltInMcpSection() {
  const summaries = useCapabilityStore((state) => state.summaries);
  const search = useCapabilityStore((state) => state.search);
  const instances = useMemo(() => {
    const all = builtInMcpRegistry.instances(mcpRegistry.listServers());
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((instance) => {
      const haystack = `${instance.definition.displayName} ${instance.definition.description} ${instance.definition.id} mcp`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [summaries, search]);
  const openWizard = useMcpSetupStore((state) => state.open);

  if (instances.length === 0) return null;

  return (
    <section className="mcp-builtin">
      <header className="mcp-section-head">
        <div>
          <h3>Built-in integrations</h3>
          <p>First-class MCP servers with a guided setup.</p>
        </div>
      </header>
      <div className="mcp-builtin-grid">
        {instances.map((instance) => {
          const status = statusFromInstance(instance);
          return (
            <article key={instance.definition.id} className={`cap-card cap-card-mcp mcp-builtin-card status-${instance.status}`}>
              <div className="cap-card-top">
                <CapabilityIcon kind="mcp" />
                <div className="cap-card-heading">
                  <div className="cap-card-title">{instance.definition.displayName}</div>
                  <div className="cap-card-meta">MCP · Built-in</div>
                </div>
                <CapabilityStatus item={status} compact />
              </div>
              <p className="cap-card-desc">{instance.definition.description}</p>
              <div className="mcp-builtin-actions">
                <button
                  type="button"
                  className="settings-action"
                  onClick={() => openWizard(instance.definition.id, instance.setupStep)}
                >
                  {instance.snapshot ? "Configure" : "Set up"}
                </button>
                <button
                  type="button"
                  className="settings-action"
                  onClick={() => openCapability(mcpServerCapabilityId(instance.definition.serverId))}
                >
                  Details
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
