import { formatRelative } from "../../lib/agent/verification/format";
import type { VerificationCounts } from "../../lib/agent/verification";

export function VerificationStats({
  counts,
  lastVerified,
  coverage,
  onSelect,
}: {
  counts: VerificationCounts;
  lastVerified?: number | null;
  coverage?: string | null;
  onSelect?: (id: "checks" | "passed" | "failed" | "skipped" | "blocked") => void;
}) {
  const items = [
    { id: "checks" as const, label: "Checks", value: String(counts.checks) },
    { id: "passed" as const, label: "Passed", value: String(counts.passed) },
    { id: "failed" as const, label: "Failed", value: String(counts.failed) },
    { id: "skipped" as const, label: "Skipped", value: String(counts.skipped) },
    { id: "blocked" as const, label: "Blocked", value: String(counts.blocked) },
  ];
  return (
    <section className="verify-stats" aria-label="Verification summary">
      {items.map((item) => (
        <button type="button" className="verify-stat" key={item.id} onClick={() => onSelect?.(item.id)}>
          <span className="verify-stat-count">{item.value}</span>
          <span className="verify-stat-label">{item.label}</span>
        </button>
      ))}
      <div className="verify-stat">
        <span className="verify-stat-count">{coverage ?? "Not available"}</span>
        <span className="verify-stat-label">Coverage</span>
      </div>
      <div className="verify-stat">
        <span className="verify-stat-count">{formatRelative(lastVerified) ?? "Not available"}</span>
        <span className="verify-stat-label">Last verified</span>
      </div>
    </section>
  );
}
