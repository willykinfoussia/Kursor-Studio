import type { CoveragePoint, CoverageSnapshot } from "../../lib/testing/domain";

export function CoveragePanel({
  coverage = null,
  history = [],
}: {
  coverage?: CoverageSnapshot | null;
  history?: CoveragePoint[];
}) {
  const points = history.filter((point) => typeof point.coverage.lines === "number");
  const hasNumbers = coverage && ["lines", "branches", "functions", "statements"].some((key) => {
    const value = coverage[key as keyof CoverageSnapshot];
    return typeof value === "number";
  });
  if (!hasNumbers && points.length === 0) {
    return (
      <section className="verify-panel">
        <h2>Coverage</h2>
        <p className="verify-muted">Coverage not collected. Configure a coverage-enabled test command.</p>
      </section>
    );
  }
  return (
    <section className="verify-panel">
      <h2>Coverage</h2>
      <div className="test-coverage-grid">
        <Metric label="Line" value={coverage?.lines} />
        <Metric label="Branch" value={coverage?.branches} />
        <Metric label="Function" value={coverage?.functions} />
        <Metric label="Statement" value={coverage?.statements} />
      </div>
      {points.length > 1 && <Sparkline points={points} />}
    </section>
  );
}

function Metric({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <span className="verify-stat-count">{typeof value === "number" ? `${value.toFixed(1)}%` : "—"}</span>
      <span className="verify-stat-label">{label}</span>
    </div>
  );
}

function Sparkline({ points }: { points: CoveragePoint[] }) {
  const values = points.map((point) => point.coverage.lines ?? 0);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const span = Math.max(max - min, 1);
  const width = 280;
  const height = 72;
  const coords = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 8) - 4;
    return `${x},${y}`;
  });
  return (
    <svg className="test-spark" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Coverage trend">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={coords.join(" ")} />
    </svg>
  );
}
