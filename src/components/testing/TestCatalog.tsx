import { useEditorStore } from "../../stores/editorStore";
import type { CatalogEntry, CaseStatus, TestLevel } from "../../lib/testing/domain";
import type { TestLevelProgress } from "../../lib/testing/progress";
import { CaptureMedia } from "./CaptureMedia";

const LEVELS: TestLevel[] = ["unit", "integration", "e2e"];

export function TestCatalog({
  entries,
  selectedId,
  runningKey,
  progress,
  onSelect,
  onRun,
}: {
  entries: CatalogEntry[];
  selectedId: string | null;
  runningKey: string | null;
  progress: TestLevelProgress | null;
  onSelect: (id: string) => void;
  onRun: (input: { key: string; levels: TestLevel[]; file?: string; name?: string }) => void;
}) {
  if (entries.length === 0) return <p className="verify-muted">No tests yet.</p>;
  return (
    <div className="test-catalog">
      {LEVELS.map((level) => {
        const group = entries.filter((entry) => entry.level === level);
        if (group.length === 0) return null;
        const levelKey = `level:${level}`;
        const selected = group.find((entry) => entry.id === selectedId) ?? null;
        return (
          <section key={level}>
            <div className="test-catalog-head">
              <h3>{level}</h3>
              <button
                type="button"
                className="test-run-btn"
                onClick={() => onRun({ key: levelKey, levels: [level] })}
                disabled={Boolean(runningKey && runningKey !== levelKey)}
              >
                {runningKey === levelKey ? "Stop" : `Run ${level}`}
              </button>
            </div>
            {runningKey === levelKey && progress?.level === level && <LevelProgress progress={progress} />}
            <ul className="test-catalog-list">
              {group.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`test-catalog-row${entry.id === selectedId ? " selected" : ""}`}
                    onClick={() => onSelect(entry.id)}
                  >
                    <span className="test-catalog-copy">
                      <span className="test-catalog-title">{entry.name}</span>
                      <span className="test-catalog-desc">{entry.description}</span>
                    </span>
                    <span className={`verify-row-status ${statusClass(entry.status)}`}>{entry.status}</span>
                  </button>
                </li>
              ))}
            </ul>
            {selected && (
              <TestFiche
                entry={selected}
                running={runningKey === selected.id}
                busy={Boolean(runningKey && runningKey !== selected.id)}
                progress={runningKey === selected.id ? progress : null}
                onRun={() => onRun({ key: selected.id, levels: [selected.level], ...runTarget(selected) })}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}

function TestFiche({
  entry,
  running,
  busy,
  progress,
  onRun,
}: {
  entry: CatalogEntry;
  running: boolean;
  busy: boolean;
  progress: TestLevelProgress | null;
  onRun: () => void;
}) {
  const video = entry.artifacts.find((artifact) => artifact.kind === "video");
  const shots = entry.artifacts.filter((artifact) => artifact.kind === "screenshot");
  const traces = entry.artifacts.filter((artifact) => artifact.kind === "trace");
  const liveVideo = progress?.videoPath;
  const liveShot = progress?.screenshotPath;
  return (
    <div className="test-fiche">
      <div className="test-fiche-actions">
        <button type="button" className="test-run-btn" onClick={onRun} disabled={busy}>
          {running ? "Stop" : "Run"}
        </button>
        {entry.file && (
          <button type="button" className="test-run-btn" onClick={() => void useEditorStore.getState().openFile(entry.file ?? "")}>
            Open file
          </button>
        )}
      </div>
      <p className="test-catalog-meta">
        {entry.type} · {entry.runner}
        {entry.file ? ` · ${entry.file}` : ""}
        {typeof entry.durationMs === "number" ? ` · ${Math.round(entry.durationMs)}ms` : ""}
      </p>
      <p>{entry.description}</p>
      {entry.preconditions.length > 0 && (
        <>
          <h4>Preconditions</h4>
          <ul className="test-level-list">{entry.preconditions.map((step) => <li key={step}>{step}</li>)}</ul>
        </>
      )}
      {entry.steps.length > 0 && (
        <>
          <h4>Steps</h4>
          <ol className="test-level-list">{entry.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </>
      )}
      {entry.expectedResults.length > 0 && (
        <>
          <h4>Expected</h4>
          <ul className="test-level-list">{entry.expectedResults.map((step) => <li key={step}>{step}</li>)}</ul>
        </>
      )}
      {running && progress && <LevelProgress progress={progress} />}
      {(liveVideo || video) && <CaptureMedia path={(liveVideo || video?.path) ?? ""} kind="video" />}
      {!liveVideo && !video && liveShot && <CaptureMedia path={liveShot} kind="image" />}
      {shots.map((shot) => <CaptureMedia key={shot.id} path={shot.path} kind="image" />)}
      {traces.map((trace) => (
        <p key={trace.id} className="test-catalog-meta">
          Trace <code>{trace.path}</code>
        </p>
      ))}
      {entry.error && <p>{entry.error}</p>}
      {entry.stack && <pre className="test-plan">{entry.stack}</pre>}
      {entry.command && (
        <details>
          <summary>Command</summary>
          <pre className="test-plan">{entry.command.command}</pre>
          {entry.command.stdout && <pre className="test-plan">{entry.command.stdout.slice(-4000)}</pre>}
          {entry.command.stderr && <pre className="test-plan">{entry.command.stderr.slice(-4000)}</pre>}
        </details>
      )}
    </div>
  );
}

function LevelProgress({ progress }: { progress: TestLevelProgress }) {
  const done = progress.passed + progress.failed + progress.skipped;
  const total = progress.total ?? (done > 0 ? done : null);
  const basis = total && total > 0 ? total : Math.max(done, 1);
  const indeterminate = progress.phase === "running" && done === 0 && progress.running === 0;
  return (
    <div
      className={`test-progress${indeterminate ? " indeterminate" : ""}`}
      role="progressbar"
      aria-label={progress.level}
      aria-valuenow={done}
      aria-valuemin={0}
      aria-valuemax={total ?? undefined}
    >
      {indeterminate ? <span className="test-progress-indeterminate" /> : (
        <>
          <span className="test-progress-pass" style={{ width: `${(progress.passed / basis) * 100}%` }} />
          <span className="test-progress-fail" style={{ width: `${(progress.failed / basis) * 100}%` }} />
          <span className="test-progress-skip" style={{ width: `${(progress.skipped / basis) * 100}%` }} />
        </>
      )}
    </div>
  );
}

function runTarget(entry: CatalogEntry): { file?: string; name?: string } {
  const base = entry.file?.split("/").pop();
  const named = Boolean(entry.name) && entry.name !== base && !entry.id.endsWith(":suite");
  return { file: entry.file, name: named ? entry.name : undefined };
}

function statusClass(status: CaseStatus) {
  if (status === "PASSED") return "status-passed";
  if (status === "FAILED" || status === "ERROR") return "status-failed";
  if (status === "RUNNING") return "status-running";
  return "";
}
