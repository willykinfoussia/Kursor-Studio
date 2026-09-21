import { Search, Server, Sparkles, Wrench } from "lucide-react";

export function CapabilityEmptyState({
  title,
  body,
  actionLabel,
  onAction,
  variant = "skill",
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "skill" | "tool" | "mcp" | "search";
}) {
  const Icon = variant === "mcp" ? Server : variant === "tool" ? Wrench : variant === "search" ? Search : Sparkles;
  return (
    <div className={`cap-empty-state cap-empty-${variant}`}>
      <span className="cap-empty-visual" aria-hidden="true">
        <Icon size={22} strokeWidth={1.6} />
      </span>
      <h3>{title}</h3>
      <p>{body}</p>
      {actionLabel && onAction && (
        <button type="button" className="primary-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function CapabilitySkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="cap-grid cap-skeleton-grid" aria-hidden="true">
      {Array.from({ length: cards }, (_, index) => (
        <div className="cap-card cap-skeleton-card" key={index}>
          <div className="cap-skeleton-line cap-skeleton-icon" />
          <div className="cap-skeleton-line cap-skeleton-title" />
          <div className="cap-skeleton-line cap-skeleton-meta" />
          <div className="cap-skeleton-line cap-skeleton-body" />
        </div>
      ))}
    </div>
  );
}

export function CapabilityStatsSkeleton() {
  return (
    <div className="cap-stats" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div className="cap-stat cap-skeleton-stat" key={index}>
          <div className="cap-skeleton-line cap-skeleton-count" />
          <div className="cap-skeleton-line cap-skeleton-label" />
        </div>
      ))}
    </div>
  );
}
