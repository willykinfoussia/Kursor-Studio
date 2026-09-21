import { Server, Sparkles, Wrench } from "lucide-react";
import type { CapabilitySummary, CapabilityType } from "../../lib/capabilities/types";
import { CapabilityCard } from "./CapabilityCard";
import { CapabilityEmptyState } from "./CapabilityEmptyState";

const GROUPS: { id: CapabilityType; label: string; hint: string; icon: typeof Sparkles }[] = [
  { id: "skill", label: "Skills", hint: "Knowledge and ways of working", icon: Sparkles },
  { id: "tool", label: "Tools", hint: "Actions Kursor can execute", icon: Wrench },
  { id: "mcp", label: "MCP", hint: "External integrations", icon: Server },
];

export function CapabilityList({
  items,
  selectedId,
  onSelect,
  onChanged,
  grouped = false,
  onViewType,
  emptyTitle,
  emptyBody,
  emptyAction,
  emptyActionLabel,
  emptyVariant,
}: {
  items: CapabilitySummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
  grouped?: boolean;
  onViewType?: (type: CapabilityType) => void;
  emptyTitle?: string;
  emptyBody?: string;
  emptyAction?: () => void;
  emptyActionLabel?: string;
  emptyVariant?: "skill" | "tool" | "mcp" | "search";
}) {
  if (items.length === 0) {
    if (!emptyTitle) return null;
    return (
      <CapabilityEmptyState
        title={emptyTitle}
        body={emptyBody ?? ""}
        actionLabel={emptyActionLabel}
        onAction={emptyAction}
        variant={emptyVariant}
      />
    );
  }

  if (!grouped) {
    return <CapabilityGrid items={items} selectedId={selectedId} onSelect={onSelect} onChanged={onChanged} />;
  }

  const groups = GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => item.type === group.id),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="cap-groups">
      {groups.map((group) => {
        const Icon = group.icon;
        return (
          <section key={group.id} className={`cap-group cap-group-${group.id}`} aria-labelledby={`cap-group-${group.id}`}>
            <header className="cap-group-head">
              <div>
                <h3 id={`cap-group-${group.id}`} className="cap-group-title">
                  <span className={`cap-icon cap-icon-${group.id === "skill" ? "skill" : group.id === "tool" ? "tool" : "mcp"}`} aria-hidden="true">
                    <Icon size={13} strokeWidth={1.8} />
                  </span>
                  {group.label}
                  <span className="cap-group-count">{group.items.length}</span>
                </h3>
                <p className="cap-group-hint">{group.hint}</p>
              </div>
              {onViewType && (
                <button type="button" className="cap-link" onClick={() => onViewType(group.id)}>
                  View all
                </button>
              )}
            </header>
            <CapabilityGrid items={group.items} selectedId={selectedId} onSelect={onSelect} onChanged={onChanged} />
          </section>
        );
      })}
    </div>
  );
}

function CapabilityGrid({
  items,
  selectedId,
  onSelect,
  onChanged,
}: {
  items: CapabilitySummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  return (
    <div className="cap-grid">
      {items.map((item, index) => (
        <CapabilityCard
          key={item.id}
          item={item}
          index={index}
          selected={item.id === selectedId}
          onSelect={() => onSelect(item.id)}
          onChanged={onChanged}
          onDeleted={onChanged}
        />
      ))}
    </div>
  );
}
