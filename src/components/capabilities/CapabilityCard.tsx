import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { MoreHorizontal } from "lucide-react";
import { capabilityService } from "../../lib/capabilities/instance";
import { parseMcpServerCapabilityId } from "../../lib/capabilities/ids";
import {
  canToggleCapability,
  cardTags,
  sourceLabel,
  typeLabel,
} from "../../lib/capabilities/presentationalStatus";
import type { CapabilitySummary } from "../../lib/capabilities/types";
import { builtInMcpRegistry } from "../../lib/mcp/builtin/registry";
import { mcpConfigurationManager } from "../../lib/mcp/MCPConfigurationManager";
import { mcpHealthService } from "../../lib/mcp/MCPHealthService";
import { mcpRegistry } from "../../lib/mcp/MCPRegistry";
import { mcpServerManager } from "../../lib/mcp/MCPServerManager";
import { useMcpSetupStore } from "../../stores/mcpSetupStore";
import { useDialogStore } from "../../stores/dialogStore";
import { Toggle } from "../ui/Controls";
import { CapabilityIcon } from "./CapabilityIcon";
import { CapabilityStatus } from "./CapabilityStatus";

function mcpContext(item: CapabilitySummary) {
  const serverId = item.kind === "mcp" ? parseMcpServerCapabilityId(item.id) : null;
  const snapshot = serverId ? mcpRegistry.listServers().find((entry) => entry.id === serverId) ?? null : null;
  const builtin = serverId ? builtInMcpRegistry.get(serverId) : null;
  const custom = Boolean(snapshot && (snapshot.origin === "user" || snapshot.origin === "imported" || snapshot.origin === "project"));
  return { serverId, snapshot, builtin, custom };
}

export function CapabilityCard({
  item,
  selected,
  index = 0,
  onSelect,
  onChanged,
  onDeleted,
}: {
  item: CapabilitySummary;
  selected: boolean;
  index?: number;
  onSelect: () => void;
  onChanged: () => void;
  onDeleted?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const tone = item.kind === "skill" ? "skill" : item.kind === "tool" || item.kind === "mcp-tool" ? "tool" : "mcp";
  const tags = cardTags(item);
  const showToggle = canToggleCapability(item);
  const { serverId, snapshot, builtin, custom } = mcpContext(item);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  const stop = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <article
      className={`cap-card cap-card-${tone} ${selected ? "selected" : ""} ${item.enabled ? "" : "disabled"}`}
      data-type={item.type}
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${item.displayName}, ${typeLabel(item)}`}
    >
      <div className="cap-card-top">
        <CapabilityIcon kind={item.kind} category={item.category} />
        <div className="cap-card-heading">
          <div className="cap-card-title">{item.displayName}</div>
          <div className="cap-card-meta">{typeLabel(item)} · {sourceLabel(item.source)}</div>
        </div>
        <CapabilityStatus item={item} compact />
      </div>
      {item.description && <p className="cap-card-desc">{item.description}</p>}
      {tags.length > 0 && (
        <div className="cap-card-tags">
          {tags.map((tag) => (
            <span className="cap-tag" key={tag}>{tag}</span>
          ))}
        </div>
      )}
      {notice && <p className="cap-card-notice">{notice}</p>}
      <div className={`cap-card-actions ${builtin && !snapshot ? "visible" : ""}`} onClick={stop} onKeyDown={(event) => event.stopPropagation()}>
        {builtin && !snapshot && (
          <button
            type="button"
            className="settings-action"
            onClick={() => useMcpSetupStore.getState().open(builtin.id)}
          >
            Set up
          </button>
        )}
        {showToggle && (
          <Toggle
            checked={item.enabled}
            label={`${item.enabled ? "Disable" : "Enable"} ${item.displayName}`}
            onChange={(enabled) => {
              void capabilityService.setEnabled(item.id, enabled).then(() => onChanged());
            }}
          />
        )}
        <div className="cap-card-more" ref={menuRef}>
          <button
            type="button"
            className="cap-icon-btn"
            aria-label={`Actions for ${item.displayName}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div className="cap-add-menu cap-card-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onSelect(); }}>
                View details
              </button>
              {builtin && serverId && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    useMcpSetupStore.getState().open(builtin.id);
                  }}
                >
                  {snapshot ? "Configure" : "Set up"}
                </button>
              )}
              {custom && snapshot && serverId && snapshot.trust !== "trusted" && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void mcpConfigurationManager.approveTrust(serverId).then(() => onChanged());
                  }}
                >
                  Enable
                </button>
              )}
              {custom && serverId && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void mcpHealthService.check(serverId).then((report) => {
                      setNotice(mcpHealthService.line(report));
                    });
                  }}
                >
                  Health
                </button>
              )}
              {custom && serverId && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void useDialogStore.getState().askConfirm(
                      "Remove MCP",
                      `Remove "${item.displayName}" from this workspace?`,
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
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
