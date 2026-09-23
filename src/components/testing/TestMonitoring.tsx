import { useEffect, useState } from "react";
import { createTestingStore } from "../../lib/testing/store";
import type { MonitoringData, MonitoringQuery, RunStatus, TestCaseType } from "../../lib/testing/domain";
import { CoveragePanel } from "../verification/CoveragePanel";

const STATUSES: Array<RunStatus | ""> = ["", "PASSED", "FAILED", "PARTIAL", "ERROR", "CANCELLED", "RUNNING", "PENDING"];
const TYPES: Array<TestCaseType | ""> = ["", "UNIT", "INTEGRATION", "E2E", "REGRESSION"];

export function TestMonitoring({ projectId }: { projectId: string }) {
  const [filters, setFilters] = useState<MonitoringQuery>({ projectId });
  const [data, setData] = useState<MonitoringData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFailure, setSelectedFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createTestingStore().query({ ...filters, projectId }).then((next) => {
      if (!cancelled) setData(next);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Monitoring unavailable.");
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, filters]);

  const failure = data?.failures.find((item) => item.id === selectedFailure) ?? null;
  const artifact = failure
    ? data?.runs.flatMap((run) => run.artifacts).find((item) => item.runId === failure.runId)
    : null;

  return (
    <section className="verify-panel test-monitor">
      <h2>Test Monitoring</h2>
      {error && <p className="verify-muted">{error}</p>}
      <div className="test-filters">
        <Filter label="Branch" value={filters.branch ?? ""} onChange={(branch) => setFilters({ ...filters, branch: branch || undefined })} />
        <Filter label="Commit" value={filters.commitSha ?? ""} onChange={(commitSha) => setFilters({ ...filters, commitSha: commitSha || undefined })} />
        <Filter label="Task" value={filters.taskId ?? ""} onChange={(taskId) => setFilters({ ...filters, taskId: taskId || undefined })} />
        <Filter label="Runner" value={filters.runner ?? ""} onChange={(runner) => setFilters({ ...filters, runner: runner || undefined })} />
        <Filter label="User case" value={filters.userCaseId ?? ""} onChange={(userCaseId) => setFilters({ ...filters, userCaseId: userCaseId || undefined })} />
        <label>
          Status
          <select value={filters.status ?? ""} onChange={(event) => setFilters({ ...filters, status: (event.target.value || undefined) as RunStatus | undefined })}>
            {STATUSES.map((status) => <option key={status || "any"} value={status}>{status || "Any"}</option>)}
          </select>
        </label>
        <label>
          Type
          <select value={filters.type ?? ""} onChange={(event) => setFilters({ ...filters, type: (event.target.value || undefined) as TestCaseType | undefined })}>
            {TYPES.map((type) => <option key={type || "any"} value={type}>{type || "Any"}</option>)}
          </select>
        </label>
      </div>
      {!data || data.runs.length === 0 ? (
        <p className="verify-muted">No test runs yet.</p>
      ) : (
        <>
          <div className="test-coverage-grid">
            <Stat label="Total" value={String(data.totals.total)} />
            <Stat label="Passed" value={String(data.totals.passed)} />
            <Stat label="Failed" value={String(data.totals.failed)} />
            <Stat label="Skipped" value={String(data.totals.skipped)} />
            <Stat label="Duration" value={`${Math.round(data.totals.durationMs / 1000)}s`} />
          </div>
          <h3>Levels</h3>
          <ul className="test-level-list">
            {(["unit", "integration", "e2e"] as const).map((level) => (
              <li key={level}>
                {level} · {data.byLevel[level].passed} passed · {data.byLevel[level].failed} failed · {data.byLevel[level].skipped} skipped
              </li>
            ))}
          </ul>
          <CoveragePanel coverage={data.totals.coverage ?? null} history={data.coverageHistory} />
          {data.plan && (
            <pre className="test-plan">{data.plan.text}</pre>
          )}
          <h3>User cases</h3>
          {data.userCases.length === 0 ? <p className="verify-muted">No user cases.</p> : (
            <ul className="test-level-list">
              {data.userCases.map((userCase) => {
                const linked = data.runs.flatMap((run) => run.results).filter((result) => result.case.userCaseId === userCase.id || result.case.name.includes(userCase.id));
                return (
                  <li key={userCase.id}>
                    {userCase.id} {userCase.name}
                    <span> unit {mark(linked, "UNIT")} </span>
                    <span> integration {mark(linked, "INTEGRATION")} </span>
                    <span> e2e {mark(linked, "E2E")} </span>
                  </li>
                );
              })}
            </ul>
          )}
          <h3>Runs</h3>
          <table className="test-runs">
            <thead>
              <tr>
                <th>Run</th><th>Date</th><th>Task</th><th>Commit</th><th>Duration</th><th>Passed</th><th>Failed</th><th>Coverage</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((run) => {
                const passed = run.results.filter((result) => result.case.status === "PASSED").length;
                const failed = run.results.filter((result) => result.case.status === "FAILED" || result.case.status === "ERROR").length;
                return (
                  <tr key={run.id}>
                    <td>{run.id.slice(0, 8)}</td>
                    <td>{new Date(run.timestamp).toLocaleString()}</td>
                    <td>{run.taskId ?? "—"}</td>
                    <td>{run.commitSha ? run.commitSha.slice(0, 7) : "—"}</td>
                    <td>{Math.round(run.durationMs / 1000)}s</td>
                    <td>{passed}</td>
                    <td>{failed}</td>
                    <td>{typeof run.coverage?.lines === "number" ? `${run.coverage.lines.toFixed(1)}%` : "—"}</td>
                    <td>{run.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h3>Failed tests</h3>
          {data.failures.length === 0 ? <p className="verify-muted">No failed tests in this filter.</p> : (
            <ul className="test-level-list">
              {data.failures.map((result) => (
                <li key={result.id}>
                  <button type="button" className="test-failure" onClick={() => setSelectedFailure(result.id)}>
                    {result.case.name}
                  </button>
                  <span>{result.case.error ?? result.case.status}</span>
                </li>
              ))}
            </ul>
          )}
          {failure && (
            <div className="test-failure-detail">
              <h3>{failure.case.name}</h3>
              <p>{failure.case.error}</p>
              {failure.case.stack && <pre className="test-plan">{failure.case.stack}</pre>}
              <p>Task {failure.taskId ?? "—"} · run {failure.runId.slice(0, 8)}</p>
              {artifact && <p>Artifact {artifact.kind}: {artifact.label}</p>}
              {artifact?.body && <pre className="test-plan">{artifact.body}</pre>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function mark(results: { case: { type: string; status: string } }[], type: string) {
  const match = results.filter((result) => result.case.type === type);
  if (match.length === 0) return "—";
  if (match.some((result) => result.case.status === "FAILED" || result.case.status === "ERROR")) return "x";
  if (match.some((result) => result.case.status === "PASSED")) return "ok";
  return "—";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="verify-stat-count">{value}</span>
      <span className="verify-stat-label">{label}</span>
    </div>
  );
}

function Filter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
