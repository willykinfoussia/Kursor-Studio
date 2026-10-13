import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { StatusGlyph } from "../StatusGlyph";
import { CopyButton } from "../markdown/CopyButton";
import type { PresentationState } from "../../../lib/agent/conversation";
import type { TestLevelProgress, TestProgressCase } from "../../../lib/testing/progress";
import { ViewInWorkflowButton } from "./ViewInWorkflowButton";
import type { CheckResult } from "../../../lib/agent/verification/types";
import { labelForKind } from "../../../lib/agent/verification";

export function VerificationBlock({
  status,
  ok,
  blockers,
  commands,
  attempt,
  results,
  levels,
  presentation,
  onToggle,
  workflowNodeId,
}: {
  status: "running" | "completed";
  ok?: boolean;
  blockers: string[];
  commands: string[];
  attempt: number;
  results?: CheckResult[];
  levels?: TestLevelProgress[];
  presentation: PresentationState;
  onToggle: () => void;
  workflowNodeId?: string;
}) {
  const chatLevels = (levels ?? []).filter((level) => level.level === "unit" || level.level === "integration");
  const covered = new Set(chatLevels.map((level) => level.level));
  const failed = status === "completed" && ok === false;
  const checks = checksFrom(results, commands).filter((check) => !covered.has(check.label));
  const failedLevels = chatLevels.filter((level) => level.failed > 0 || level.phase === "failed").length;
  const failedCount = failed
    ? Math.max(1, (results?.filter((result) => !result.ok && !result.skipped).length ?? blockers.length) + failedLevels)
    : 0;
  const levelSummary = chatLevels.map((level) => `${levelLabel(level.level)} ${fraction(level)}`).join(", ");
  const title = status === "running"
    ? "Verifying changes"
    : failed
      ? `Verification failed  ${failedCount} of ${Math.max(checks.length + chatLevels.length, 1)} checks failed`
      : levelSummary
        ? `Verified changes  ${levelSummary}`
        : checks.length > 0
          ? `Verified changes  ${summarizeChecks(checks.map((check) => check.label))}`
          : "Verified changes  passed";
  const detailsId = "verification-details";

  return (
    <div className={`tool-activity${failed ? " failed" : ""}`}>
      <button
        type="button"
        className="tool-activity-line"
        onClick={onToggle}
        aria-expanded={presentation.expanded}
        aria-controls={detailsId}
      >
        <StatusGlyph status={status === "running" ? "running" : failed ? "failed" : "completed"} />
        <span className="tool-activity-title">{title}</span>
        {attempt > 1 && <span className="block-meta">attempt {attempt}</span>}
        <ChevronDown size={12} className={`block-chevron${presentation.expanded ? " open" : ""}`} />
      </button>
      {chatLevels.length > 0 && (
        <div className="test-level-stack">
          {chatLevels.map((level) => (
            <TestLevelRow key={level.level} level={level} expanded={presentation.expanded} live={status === "running"} />
          ))}
        </div>
      )}
      {failed && blockers[0] && !presentation.expanded && (
        <p className="compact-error">{blockers[0]}</p>
      )}
      {presentation.expanded && (
        <div id={detailsId} className="tool-group-details">
          {checks.length > 0 && (
            <ul className="plan-steps">
              {checks.map((check) => (
                <li key={check.id} className="plan-step">
                  <StatusGlyph status={status === "running" ? "running" : check.failed ? "failed" : "completed"} />
                  <span>{check.label}</span>
                </li>
              ))}
            </ul>
          )}
          {blockers.length > 0 && (
            <div className="tool-io">
              <div className="tool-io-head">OUTPUT <CopyButton text={blockers.join("\n")} /></div>
              <pre className="tool-io-pre">{blockers.join("\n")}</pre>
            </div>
          )}
          <ViewInWorkflowButton nodeId={workflowNodeId ?? "verification:"} />
        </div>
      )}
    </div>
  );
}

export function TestLevelRow({
  level,
  expanded,
  live,
}: {
  level: TestLevelProgress;
  expanded: boolean;
  live?: boolean;
}) {
  const [showPassed, setShowPassed] = useState(false);
  const done = level.passed + level.failed + level.skipped;
  const total = level.total ?? (done > 0 ? done : null);
  const basis = total && total > 0 ? total : Math.max(done, 1);
  const indeterminate = (live || level.phase === "running") && done === 0 && level.running === 0;
  const running = level.cases.filter((item) => item.status === "running");
  const failed = level.cases.filter((item) => item.status === "failed");
  const passed = level.cases.filter((item) => item.status === "passed");
  const label = levelLabel(level.level);

  return (
    <div className="test-level">
      <div className="test-level-head">
        <span>{label}</span>
        <span className="test-level-count">{total == null ? (done > 0 ? String(done) : "…") : `${done}/${total}`}</span>
        <div
          className={`test-progress${indeterminate ? " indeterminate" : ""}`}
          role="progressbar"
          aria-label={label}
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total ?? undefined}
        >
          {indeterminate ? <span className="test-progress-indeterminate" /> : (
            <>
              <span className="test-progress-pass" style={{ width: `${(level.passed / basis) * 100}%` }} />
              <span className="test-progress-fail" style={{ width: `${(level.failed / basis) * 100}%` }} />
              <span className="test-progress-skip" style={{ width: `${(level.skipped / basis) * 100}%` }} />
            </>
          )}
        </div>
      </div>
      {(running.length > 0 || failed.length > 0 || (expanded && passed.length > 0)) && (
        <ul className="test-case-list">
          {running.map((item) => <CaseRow key={item.id} item={item} />)}
          {failed.map((item) => <CaseRow key={item.id} item={item} />)}
          {expanded && passed.length > 0 && (
            <li className="test-case passed-toggle">
              <button type="button" onClick={() => setShowPassed((value) => !value)}>
                {passed.length} passed
              </button>
              {showPassed && (
                <ul>
                  {passed.map((item) => <li key={item.id}>{item.name}</li>)}
                </ul>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function CaseRow({ item }: { item: TestProgressCase }) {
  const glyph = item.status === "failed" ? "failed" : item.status === "running" ? "running" : "completed";
  const error = firstLine(item.error);
  return (
    <li className={`test-case ${item.status}`}>
      <StatusGlyph status={glyph} />
      <span>{item.name}</span>
      {error && <p className="test-case-error">{error}</p>}
    </li>
  );
}

function fraction(level: TestLevelProgress) {
  const done = level.passed + level.failed + level.skipped;
  if (level.total == null) return done > 0 ? String(done) : "…";
  return `${done}/${level.total}`;
}

function levelLabel(level: TestLevelProgress["level"]) {
  if (level === "integration") return "Integration";
  if (level === "e2e") return "E2E";
  return "Unit";
}

function checksFrom(results: CheckResult[] | undefined, commands: string[]) {
  if (results && results.length > 0) {
    return results.map((result, index) => ({
      id: `${result.kind}:${result.name ?? result.command ?? index}`,
      label: result.name || result.command || labelForKind(result.kind),
      failed: !result.ok && !result.skipped,
    }));
  }
  return commands.map((command, index) => ({
    id: `${command}:${index}`,
    label: prettyCheck(command),
    failed: false,
  }));
}

function summarizeChecks(names: string[]) {
  if (names.length === 0) return "passed";
  if (names.length === 1) return `${names[0]} passed`;
  if (names.length === 2) return `${names[0]} and ${names[1]} passed`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} passed`;
}

function prettyCheck(check: string) {
  const lower = check.toLowerCase();
  if (lower.includes("tsc") || lower.includes("type")) return "Typecheck";
  if (lower.includes("lint")) return "Lint";
  if (lower.includes("test")) return "Tests";
  if (lower.includes("build")) return "Build";
  return check;
}

function firstLine(error?: string) {
  return error?.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}
