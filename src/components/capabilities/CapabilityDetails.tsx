import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { BUILTIN_AGENTS } from "../../lib/agent/agents/builtin";
import { agentsForTool } from "../../lib/capabilities/agents";
import { capabilityService } from "../../lib/capabilities/instance";
import { presentationalStatus, typeLabel } from "../../lib/capabilities/presentationalStatus";
import type { CapabilityStatusInput } from "../../lib/capabilities/presentationalStatus";
import type {
  CapabilityDetail,
  CapabilityStats,
  MCPServerCapability,
  McpChildCapability,
  SkillCapability,
  ToolCapability,
} from "../../lib/capabilities/types";
import { lifecycleLabel, type BuiltInLifecycleStatus } from "../../lib/mcp/builtin/types";
import { openCapability } from "../../lib/workflow/navigation";
import { useDialogStore } from "../../stores/dialogStore";
import { Toggle } from "../ui/Controls";
import { CapabilityDependencies } from "./CapabilityDependencies";
import { CapabilityIcon } from "./CapabilityIcon";
import { CapabilityMcpActions } from "./CapabilityMcpActions";
import { CapabilityPermissions } from "./CapabilityPermissions";
import { CapabilitySourceBlock } from "./CapabilitySource";
import { CapabilityStatus } from "./CapabilityStatus";
import { CapabilityUsageBlock } from "./CapabilityUsage";

type DetailTab = "overview" | "permissions" | "dependencies" | "configuration" | "usage";

function isSkill(detail: CapabilityDetail): detail is SkillCapability {
  return detail.type === "skill";
}

function isTool(detail: CapabilityDetail): detail is ToolCapability {
  return detail.type === "tool";
}

function isMcpServer(detail: CapabilityDetail): detail is MCPServerCapability {
  return detail.type === "mcp" && !("kind" in detail);
}

function isMcpChild(detail: CapabilityDetail): detail is McpChildCapability {
  return detail.type === "mcp" && "kind" in detail;
}

function tabsFor(detail: CapabilityDetail): { id: DetailTab; label: string }[] {
  const tabs: { id: DetailTab; label: string }[] = [{ id: "overview", label: "Overview" }];
  if ((isTool(detail) || isMcpServer(detail)) && detail.permissions && detail.permissions.length > 0) {
    tabs.push({ id: "permissions", label: "Permissions" });
  }
  if ((detail.dependencies && detail.dependencies.length > 0) || (isSkill(detail) && detail.allowedTools && detail.allowedTools.length > 0)) {
    tabs.push({ id: "dependencies", label: "Dependencies" });
  }
  if (
    isSkill(detail)
    || (isTool(detail) && detail.inputSchema != null)
    || isMcpServer(detail)
    || (isMcpChild(detail) && detail.inputSchema != null)
  ) {
    tabs.push({ id: "configuration", label: "Configuration" });
  }
  tabs.push({ id: "usage", label: "Usage" });
  return tabs;
}

function statusInput(detail: CapabilityDetail): CapabilityStatusInput {
  return {
    kind: isMcpChild(detail) ? detail.kind : detail.type,
    type: detail.type,
    status: detail.status,
    enabled: detail.enabled,
    connectionStatus: isMcpServer(detail) ? detail.connectionStatus : undefined,
    tags: [
      ...(detail.tags ?? []),
      ...(isMcpServer(detail) && typeof detail.metadata?.lifecycle === "string" ? [detail.metadata.lifecycle] : []),
    ],
    lastError: isMcpServer(detail) ? detail.lastError : undefined,
  };
}

export function CapabilityDetails({
  detail,
  stats,
  loading = false,
  missing = false,
  onChanged,
  onClose,
  onEditSkill,
  onDeleted,
}: {
  detail: CapabilityDetail | null;
  stats: CapabilityStats;
  loading?: boolean;
  missing?: boolean;
  onChanged: () => void;
  onClose: () => void;
  onEditSkill?: (skill: SkillCapability) => void;
  onDeleted?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<DetailTab>("overview");
  const closeRef = useRef<HTMLButtonElement>(null);
  const tabs = detail ? tabsFor(detail) : [];

  useEffect(() => {
    setExpanded(false);
    setTab("overview");
  }, [detail?.id]);

  useEffect(() => {
    closeRef.current?.focus();
  }, [detail?.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!detail) {
    return (
      <aside className="cap-details" aria-label="Capability details">
        <header className="cap-details-toolbar">
          <button type="button" className="cap-details-close" ref={closeRef} onClick={onClose}>
            <ArrowLeft size={14} /> Back
          </button>
        </header>
        <div className={`cap-details-empty ${loading ? "loading" : ""}`}>
          <p>
            {loading
              ? "Loading capability…"
              : missing
                ? "Couldn't load this capability."
                : "Select a capability to inspect what Kursor can do."}
          </p>
        </div>
      </aside>
    );
  }

  const kicker = typeLabel({ kind: isMcpChild(detail) ? detail.kind : detail.type, type: detail.type });
  const showToggle = isSkill(detail) || isTool(detail) || (isMcpServer(detail) && detail.metadata?.lifecycle !== "known");
  const presentation = presentationalStatus(statusInput(detail));

  return (
    <aside className={`cap-details cap-details-${detail.type}`} aria-label="Capability details">
      <header className="cap-details-toolbar">
        <button type="button" className="cap-details-close" ref={closeRef} onClick={onClose}>
          <ArrowLeft size={14} /> Back
        </button>
      </header>
      <div className="cap-details-hero">
        <CapabilityIcon kind={isMcpChild(detail) ? detail.kind : detail.type} category={isTool(detail) ? detail.category : undefined} size={18} />
        <div>
          <div className="cap-details-kicker">{kicker}{detail.version ? ` · v${detail.version}` : ""}</div>
          <h2>{detail.displayName}</h2>
        </div>
      </div>
      <div className="cap-details-status">
        <CapabilityStatus item={statusInput(detail)} />
        {showToggle ? (
          <Toggle
            checked={detail.enabled}
            label={`Toggle ${detail.displayName}`}
            onChange={(enabled) => {
              void capabilityService.setEnabled(detail.id, enabled).then(() => onChanged());
            }}
          />
        ) : null}
      </div>
      {detail.status === "error" && (
        <p className="cap-error">Failed to initialize capability.</p>
      )}
      {isMcpServer(detail) && detail.connectionStatus === "error" && (
        <p className="cap-error">Connection failed{detail.lastError ? `: ${detail.lastError}` : "."}</p>
      )}
      {presentation.id === "needs-setup" && isMcpServer(detail) && (
        <p className="cap-setup-hint">This integration needs a short setup before Kursor can use it.</p>
      )}
      {isSkill(detail) && (detail.source.type === "project" || detail.source.type === "user") && (
        <div className="mcp-detail-actions">
          <button type="button" className="settings-action" onClick={() => onEditSkill?.(detail)}>
            Edit
          </button>
          <button
            type="button"
            className="settings-action danger"
            onClick={() => {
              void useDialogStore.getState().askConfirm(
                "Delete skill",
                `Delete "${detail.displayName}"? This removes the SKILL.md file.`,
                "Delete",
                true,
              ).then((ok) => {
                if (!ok) return;
                void capabilityService.deleteSkill(detail.id).then(() => (onDeleted ?? onChanged)());
              });
            }}
          >
            Delete
          </button>
        </div>
      )}
      {isMcpServer(detail) && <CapabilityMcpActions detail={detail} onChanged={onChanged} onDeleted={onDeleted} />}
      <div className="cap-detail-tabs" role="tablist" aria-label="Capability sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="cap-detail-pane" role="tabpanel">
        {tab === "overview" && (
          <Overview detail={detail} />
        )}
        {tab === "permissions" && (isTool(detail) || isMcpServer(detail)) && (
          <CapabilityPermissions items={detail.permissions} />
        )}
        {tab === "dependencies" && (
          <>
            {isSkill(detail) && detail.allowedTools && detail.allowedTools.length > 0 && (
              <section>
                <h3>Tools used</h3>
                <p>{detail.allowedTools.join(" · ")}</p>
              </section>
            )}
            <CapabilityDependencies items={detail.dependencies} />
          </>
        )}
        {tab === "configuration" && (
          <Configuration detail={detail} expanded={expanded} setExpanded={setExpanded} onChanged={onChanged} />
        )}
        {tab === "usage" && <CapabilityUsageBlock stats={stats} capabilityId={detail.id} />}
      </div>
    </aside>
  );
}

function Overview({ detail }: { detail: CapabilityDetail }) {
  return (
    <>
      {detail.description && <p className="cap-details-copy">{detail.description}</p>}
      <CapabilitySourceBlock
        source={detail.source}
        sourcePath={isSkill(detail) ? detail.sourcePath : undefined}
      />
      {isSkill(detail) && (
        <>
          <dl className="cap-dl">
            <div><dt>Scope</dt><dd>{detail.scope}</dd></div>
            {detail.modelPreference && <div><dt>Model preference</dt><dd>{detail.modelPreference}</dd></div>}
          </dl>
          {detail.triggers && detail.triggers.length > 0 && (
            <section>
              <h3>Triggers</h3>
              <div className="cap-card-tags">
                {detail.triggers.map((trigger) => <span className="cap-tag" key={trigger}>{trigger}</span>)}
              </div>
            </section>
          )}
        </>
      )}
      {isTool(detail) && (
        <dl className="cap-dl">
          <div><dt>Category</dt><dd>{detail.category}</dd></div>
          <div><dt>Risk</dt><dd>{detail.riskLevel}</dd></div>
          <div><dt>Approval</dt><dd>{detail.approval === "auto" ? "Automatic" : detail.approval}</dd></div>
        </dl>
      )}
      {isMcpServer(detail) && (
        <>
          <dl className="cap-dl">
            <div><dt>Status</dt><dd>{typeof detail.metadata?.lifecycle === "string" ? lifecycleLabel(detail.metadata.lifecycle as BuiltInLifecycleStatus) : detail.connectionStatus}</dd></div>
            <div><dt>Transport</dt><dd>{detail.transport}</dd></div>
            <div><dt>Tools</dt><dd>{detail.tools.length}</dd></div>
            <div><dt>Resources</dt><dd>{detail.resources?.length ?? 0}</dd></div>
            <div><dt>Prompts</dt><dd>{detail.prompts?.length ?? 0}</dd></div>
          </dl>
          {typeof detail.metadata?.catalogId === "string" && detail.metadata.catalogId === "builtin.mcp.blender" && (
            <p className="cap-error">Blender MCP can execute LLM-generated Python inside Blender. This warning is never hidden.</p>
          )}
        </>
      )}
      {isMcpChild(detail) && (
        <section>
          <h3>Parent MCP</h3>
          <p>{detail.parentName}</p>
          <button type="button" className="cap-link" onClick={() => openCapability(detail.parentId)}>Open MCP</button>
        </section>
      )}
      <section>
        <h3>Available to</h3>
        <ul className="cap-agent-list">
          {(isTool(detail) ? agentsForTool(detail.name) : BUILTIN_AGENTS.map((agent) => ({ id: agent.id, name: agent.name }))).map((agent) => (
            <li key={agent.id}>{agent.name}</li>
          ))}
        </ul>
      </section>
      {detail.documentationUrl && !isMcpServer(detail) && (
        <a className="cap-link" href={detail.documentationUrl} target="_blank" rel="noreferrer">Open documentation</a>
      )}
    </>
  );
}

function Configuration({
  detail,
  expanded,
  setExpanded,
  onChanged,
}: {
  detail: CapabilityDetail;
  expanded: boolean;
  setExpanded: (value: boolean | ((current: boolean) => boolean)) => void;
  onChanged: () => void;
}) {
  if (isSkill(detail)) {
    return (
      <>
        {isSkill(detail) && (detail.source.type === "project" || detail.source.type === "user") && detail.supportingFiles && detail.supportingFiles.length > 0 && (
          <section>
            <h3>Supporting files</h3>
            <p>{detail.supportingFiles.join(" · ")}</p>
          </section>
        )}
        <section>
          <h3>Instructions</h3>
          <pre className={`cap-instructions ${expanded ? "open" : ""}`}>{detail.instructions}</pre>
          {detail.instructions.length > 240 && (
            <button type="button" className="cap-link" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
        </section>
      </>
    );
  }
  if (isTool(detail) && detail.inputSchema != null) {
    return (
      <section>
        <h3>Input</h3>
        <pre className="cap-schema">{JSON.stringify(detail.inputSchema, null, 2)}</pre>
      </section>
    );
  }
  if (isMcpServer(detail)) {
    return (
      <section>
        <h3>Tools</h3>
        <ul className="cap-tree">
          {detail.tools.map((tool) => (
            <li key={tool.id}>
              <button type="button" className="cap-link" onClick={() => openCapability(tool.id)}>{tool.name}</button>
              <Toggle
                checked={tool.enabled}
                label={`Toggle ${tool.name}`}
                onChange={(enabled) => {
                  void capabilityService.setEnabled(tool.id, enabled).then(() => onChanged());
                }}
              />
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (isMcpChild(detail) && detail.inputSchema != null) {
    return (
      <section>
        <h3>Input</h3>
        <pre className="cap-schema">{JSON.stringify(detail.inputSchema, null, 2)}</pre>
      </section>
    );
  }
  return <p className="cap-details-copy">No configuration for this capability.</p>;
}
