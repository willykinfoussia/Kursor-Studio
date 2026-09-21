import { useEffect, useMemo, useState } from "react";
import { capabilityService } from "../lib/capabilities/instance";
import { emptyStats } from "../lib/capabilities/CapabilityUsage";
import type { CapabilityDetail, CapabilityStats as CapabilityUsageStats, SkillCapability } from "../lib/capabilities/types";
import {
  capabilityAttentionCount,
  capabilityCounts,
  hasCapabilityFilters,
  useCapabilityStore,
  visibleCapabilities,
  type CapabilitySort,
  type CapabilityStatusView,
  type CapabilityTypeFilter,
} from "../stores/capabilityStore";
import { useProjectStore } from "../stores/projectStore";
import { BuiltInMcpSection } from "../components/capabilities/BuiltInMcpSection";
import { CapabilityDetails } from "../components/capabilities/CapabilityDetails";
import { CapabilityHeader } from "../components/capabilities/CapabilityHeader";
import { CapabilityList } from "../components/capabilities/CapabilityList";
import { CapabilitySkeleton, CapabilityStatsSkeleton } from "../components/capabilities/CapabilityEmptyState";
import { CapabilityStats } from "../components/capabilities/CapabilityStats";
import { CapabilityTabs } from "../components/capabilities/CapabilityTabs";
import { SkillEditorDialog, type SkillEditorTarget } from "../components/capabilities/SkillEditorDialog";
import { CustomMcpInstallModal } from "../components/mcp/CustomMcpInstallModal";
import { SelectControl } from "../components/ui/Controls";
import type { SkillDocumentScope } from "../lib/agent/skills/SkillDocument";

const BUILTIN_MCP_IDS = new Set(["mcp.blender", "mcp.github", "mcp.composio", "mcp.playwright"]);

const STATUS_CHIPS: { id: CapabilityStatusView; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "disabled", label: "Disabled" },
  { id: "needs-setup", label: "Needs setup" },
];

export function CapabilitiesPage() {
  const summaries = useCapabilityStore((state) => state.summaries);
  const selectedId = useCapabilityStore((state) => state.selectedCapabilityId);
  const search = useCapabilityStore((state) => state.search);
  const typeFilter = useCapabilityStore((state) => state.typeFilter);
  const sourceFilter = useCapabilityStore((state) => state.sourceFilter);
  const statusFilter = useCapabilityStore((state) => state.statusFilter);
  const riskFilter = useCapabilityStore((state) => state.riskFilter);
  const scopeFilter = useCapabilityStore((state) => state.scopeFilter);
  const agentFilter = useCapabilityStore((state) => state.agentFilter);
  const projectFilter = useCapabilityStore((state) => state.projectFilter);
  const statusView = useCapabilityStore((state) => state.statusView);
  const sortBy = useCapabilityStore((state) => state.sortBy);
  const attentionOnly = useCapabilityStore((state) => state.attentionOnly);
  const detailsOpen = useCapabilityStore((state) => state.detailsOpen);
  const loading = useCapabilityStore((state) => state.loading);
  const error = useCapabilityStore((state) => state.error);
  const refresh = useCapabilityStore((state) => state.refresh);
  const select = useCapabilityStore((state) => state.select);
  const setSearch = useCapabilityStore((state) => state.setSearch);
  const setTypeFilter = useCapabilityStore((state) => state.setTypeFilter);
  const setStatusView = useCapabilityStore((state) => state.setStatusView);
  const setSortBy = useCapabilityStore((state) => state.setSortBy);
  const setAttentionOnly = useCapabilityStore((state) => state.setAttentionOnly);
  const clearFilters = useCapabilityStore((state) => state.clearFilters);
  const projectId = useProjectStore((state) => state.currentProject?.id);
  const [detail, setDetail] = useState<CapabilityDetail | null>(null);
  const [stats, setStats] = useState<CapabilityUsageStats>(emptyStats());
  const [detailLoading, setDetailLoading] = useState(false);
  const [editor, setEditor] = useState<SkillEditorTarget | null>(null);
  const [installOpen, setInstallOpen] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh, projectId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setStats(emptyStats());
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void Promise.all([
      capabilityService.getCapability(selectedId),
      capabilityService.getUsage(selectedId),
    ]).then(([nextDetail, nextStats]) => {
      if (cancelled) return;
      setDetail(nextDetail);
      setStats(nextStats);
      setDetailLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setDetail(null);
      setDetailLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedId, summaries]);

  const items = useMemo(
    () => visibleCapabilities(summaries, {
      search,
      typeFilter,
      sourceFilter,
      statusFilter,
      riskFilter,
      scopeFilter,
      agentFilter,
      projectFilter,
      attentionOnly,
      sortBy,
      statusView,
    }),
    [summaries, search, typeFilter, sourceFilter, statusFilter, riskFilter, scopeFilter, agentFilter, projectFilter, attentionOnly, sortBy, statusView],
  );
  const counts = capabilityCounts(summaries);
  const attention = capabilityAttentionCount(summaries);
  const filtered = hasCapabilityFilters({
    search,
    sourceFilter,
    statusFilter,
    riskFilter,
    agentFilter,
    projectFilter,
    attentionOnly,
    statusView,
  });
  const listItems = typeFilter === "mcp" && !filtered
    ? items.filter((item) => item.kind !== "mcp" || !BUILTIN_MCP_IDS.has(item.id))
    : items;

  const openCreate = (scope: SkillDocumentScope) => {
    setTypeFilter("skill");
    setEditor({ mode: "create", scope });
  };

  const openEdit = (skill: SkillCapability) => {
    const scope = skill.source.type === "user" ? "user" as const : "project" as const;
    setEditor({ mode: "edit", scope, skill });
  };

  const onSaved = (capabilityId: string) => {
    setEditor(null);
    void refresh().then(() => select(capabilityId));
  };

  const onSelectType = (type: Exclude<CapabilityTypeFilter, "all">) => {
    setAttentionOnly(false);
    setTypeFilter(typeFilter === type && !attentionOnly ? "all" : type);
  };

  const empty = emptyCopy(typeFilter, filtered, listItems.length === 0);

  return (
    <div className={`cap-workspace ${detailsOpen ? "details-open" : ""}`}>
      <CapabilityHeader
        search={search}
        onSearch={setSearch}
        onAddSkill={openCreate}
        onAddMcp={() => {
          setTypeFilter("mcp");
          setInstallOpen(true);
        }}
      />
      {error && (
        <div className="cap-error-banner" role="alert">
          <span>{error}</span>
          <button type="button" className="cap-link" onClick={() => void refresh()}>Retry</button>
        </div>
      )}
      {loading && summaries.length === 0 ? (
        <CapabilityStatsSkeleton />
      ) : (
        <CapabilityStats
          counts={counts}
          attention={attention}
          activeType={typeFilter}
          attentionOnly={attentionOnly}
          onSelectType={onSelectType}
          onToggleAttention={() => setAttentionOnly(!attentionOnly)}
        />
      )}
      <div className="cap-toolbar">
        <CapabilityTabs
          active={typeFilter}
          counts={counts}
          onChange={(value) => {
            setAttentionOnly(false);
            setTypeFilter(value);
          }}
        />
        <div className="cap-toolbar-aside">
          <div className="cap-chip-row cap-status-chips" role="group" aria-label="Status">
            {STATUS_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`cap-chip ${statusView === chip.id ? "active" : ""}`}
                aria-pressed={statusView === chip.id}
                onClick={() => setStatusView(statusView === chip.id ? "all" : chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <label className="cap-sort">
            <span>Sort</span>
            <SelectControl
              value={sortBy}
              aria-label="Sort capabilities"
              onChange={(event) => setSortBy(event.target.value as CapabilitySort)}
            >
              <option value="name">Name</option>
              <option value="status">Status</option>
              <option value="type">Type</option>
            </SelectControl>
          </label>
        </div>
      </div>
      <div className="cap-body">
        <div className="cap-main">
          {typeFilter === "mcp" && !filtered && <BuiltInMcpSection />}
          {loading && summaries.length === 0 ? (
            <CapabilitySkeleton />
          ) : (
            <CapabilityList
              items={listItems}
              selectedId={selectedId}
              onSelect={select}
              onChanged={() => void refresh()}
              grouped={typeFilter === "all"}
              onViewType={setTypeFilter}
              emptyTitle={empty?.title}
              emptyBody={empty?.body}
              emptyAction={empty?.action === "skill" ? () => openCreate("user") : empty?.action === "clear" ? clearFilters : undefined}
              emptyActionLabel={empty?.actionLabel}
              emptyVariant={empty?.variant}
            />
          )}
        </div>
        {detailsOpen && (
          <>
            <button type="button" className="cap-details-backdrop" aria-label="Close details" onClick={() => select(null)} />
            <CapabilityDetails
              detail={detail}
              stats={stats}
              loading={detailLoading}
              missing={Boolean(selectedId) && !detail && !detailLoading}
              onChanged={() => void refresh()}
              onClose={() => select(null)}
              onEditSkill={openEdit}
              onDeleted={() => {
                select(null);
                void refresh();
              }}
            />
          </>
        )}
      </div>
      {installOpen && (
        <CustomMcpInstallModal
          projectId={projectId ?? null}
          onClose={() => setInstallOpen(false)}
          onInstalled={() => {
            void refresh();
          }}
        />
      )}
      {editor && (
        <SkillEditorDialog
          target={editor}
          onClose={() => setEditor(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function emptyCopy(type: CapabilityTypeFilter, filtered: boolean, isEmpty: boolean) {
  if (!isEmpty) return null;
  if (filtered) {
    return {
      title: "No capabilities found",
      body: "Try another search or clear your filters.",
      action: "clear" as const,
      actionLabel: "Clear filters",
      variant: "search" as const,
    };
  }
  if (type === "mcp") return null;
  if (type === "skill") {
    return {
      title: "No skills yet",
      body: "Teach Kursor new ways of working.",
      action: "skill" as const,
      actionLabel: "Add Skill",
      variant: "skill" as const,
    };
  }
  if (type === "tool") {
    return {
      title: "No tools available",
      body: "Native tools appear here once Kursor finishes loading its runtime.",
      variant: "tool" as const,
    };
  }
  return {
    title: "No capabilities yet",
    body: "Skills, tools and MCP servers will show up here.",
    variant: "search" as const,
  };
}
