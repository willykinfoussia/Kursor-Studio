import { ChevronDown } from "lucide-react";
import { StatusGlyph } from "../StatusGlyph";
import { CopyButton } from "../markdown/CopyButton";
import type { PresentationState } from "../../../lib/agent/conversation";
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
  presentation: PresentationState;
  onToggle: () => void;
  workflowNodeId?: string;
}) {
  const failed = status === "completed" && ok === false;
  const checks = checksFrom(results, commands);
  const failedCount = failed
    ? Math.max(1, results?.filter((result) => !result.ok && !result.skipped).length ?? blockers.length)
    : 0;
  const title = status === "running"
    ? "Verifying changes"
    : failed
      ? `Verification failed  ${failedCount} of ${Math.max(checks.length, 1)} checks failed`
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
