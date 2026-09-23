import { useEffect, useState } from "react";
import type { ApprovalDecision, ApprovalRequest } from "../../../lib/agent/permissions/types";
import { describeScope } from "../../../lib/agent/permissions/policy";
import { isUserQuestionStep } from "../../../lib/agent/workflow/questionOptions";
import type { WorkflowApprovalRequest } from "../../../lib/agent/workflows/types";
import { approvalHeadline, formatRiskLevel } from "../../../lib/agent/conversation/approvalCopy";
import { commandFromTool, toolTarget } from "../../../lib/agent/conversation";
import type { PendingApprovalEntry } from "../../../stores/agentStore";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function ApprovalDock({
  entries,
  index,
  onIndexChange,
  workingDirectory,
  highlighted,
  onDeny,
  onAllowOnce,
  onAllowTask,
  onAllowPermanent,
  onApprovePlan,
  onRejectPlan,
  onSelectChoice,
  onStop,
}: {
  entries: PendingApprovalEntry[];
  index: number;
  onIndexChange: (index: number) => void;
  workingDirectory?: string | null;
  highlighted?: boolean;
  onDeny: (id: string) => void;
  onAllowOnce: (id: string) => void;
  onAllowTask: (id: string) => void;
  onAllowPermanent: (id: string) => void;
  onApprovePlan: (id: string) => void;
  onRejectPlan: (id: string) => void;
  onSelectChoice?: (id: string, selected: string) => void;
  onStop?: () => void;
}) {
  const safeIndex = Math.min(Math.max(0, index), Math.max(0, entries.length - 1));
  const entry = entries[safeIndex];
  const [live, setLive] = useState("");

  useEffect(() => {
    if (entry) setLive("Approval required");
    else setLive("");
  }, [entry]);

  useEffect(() => {
    if (!entry) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        if (event.key === "Enter" && event.shiftKey && entry.kind === "permission") {
          event.preventDefault();
          onAllowTask(entry.id);
          return;
        }
        if (event.key === "Enter" && entry.kind === "permission") {
          event.preventDefault();
          onAllowOnce(entry.id);
          return;
        }
        if (event.key === "Enter" && entry.kind === "workflow") {
          event.preventDefault();
          onApprovePlan(entry.id);
          return;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          if (entry.kind === "permission") onDeny(entry.id);
          else onRejectPlan(entry.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, onAllowOnce, onAllowTask, onApprovePlan, onDeny, onRejectPlan]);

  if (!entry) return null;

  return (
    <section
      className={`approval-dock${highlighted ? " timeline-highlight" : ""}`}
      role="alertdialog"
      aria-label="Approval required"
      aria-live="polite"
      data-approval-dock
      tabIndex={-1}
    >
      <span className="sr-only">{live}</span>
      {entries.length > 1 && (
        <header className="approval-queue">
          <span>Approval required</span>
          <span className="approval-queue-count">{safeIndex + 1} of {entries.length}</span>
          <button type="button" className="icon-btn" aria-label="Previous approval" disabled={safeIndex === 0} onClick={() => onIndexChange(safeIndex - 1)}>
            <ChevronLeft size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label="Next approval" disabled={safeIndex >= entries.length - 1} onClick={() => onIndexChange(safeIndex + 1)}>
            <ChevronRight size={14} />
          </button>
        </header>
      )}
      {entry.kind === "workflow" ? (
        <WorkflowApproval
          workflow={entry.workflow}
          onApprove={() => onApprovePlan(entry.id)}
          onReject={() => onRejectPlan(entry.id)}
          onSelect={onSelectChoice ? (selected) => onSelectChoice(entry.id, selected) : undefined}
        />
      ) : (
        <PermissionApproval
          permission={entry.permission}
          workingDirectory={workingDirectory}
          onDeny={() => onDeny(entry.id)}
          onAllowOnce={() => onAllowOnce(entry.id)}
          onAllowTask={() => onAllowTask(entry.id)}
          onAllowPermanent={() => onAllowPermanent(entry.id)}
        />
      )}
      {onStop && (
        <button type="button" className="permission-deny approval-stop" onClick={onStop}>Stop Agent</button>
      )}
    </section>
  );
}

function WorkflowApproval({
  workflow,
  onApprove,
  onReject,
  onSelect,
}: {
  workflow: WorkflowApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
  onSelect?: (selected: string) => void;
}) {
  const choices = workflow.options ?? [];
  const isQuestion = isUserQuestionStep(workflow.stepId);
  const finish = workflow.stepId === "finish-branch"
    || choices.some((item) => /^(merge|pr|keep|discard)$/i.test(item.label) || /^(merge|pr|keep|discard)$/i.test(item.id));
  const prompt = workflow.summary.trim() || "The agent is waiting for a decision.";
  const title = finish
    ? "Finish this development branch?"
    : isQuestion
      ? prompt
      : "Kursor wants to continue";
  return (
    <>
      <p className="approval-title">{title}</p>
      {!isQuestion && !finish && <p className="approval-copy">{prompt}</p>}
      {finish && prompt !== title && <p className="approval-copy">{prompt}</p>}
      {choices.length > 0 && onSelect ? (
        <div className="permission-actions approval-choices">
          {choices.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                /^(deny|discard|no|non)$/i.test(option.label.trim())
                  ? "permission-deny approval-choice"
                  : "permission-allow approval-choice"
              }
              onClick={() => onSelect(option.label)}
            >
              <span className="approval-choice-label">{option.label}</span>
              {option.description ? <span className="approval-choice-desc">{option.description}</span> : null}
            </button>
          ))}
        </div>
      ) : isQuestion ? null : (
        <div className="permission-actions">
          <button type="button" className="permission-deny" onClick={onReject}>Deny</button>
          <button type="button" className="permission-allow" onClick={onApprove}>Allow</button>
        </div>
      )}
    </>
  );
}

function PermissionApproval({
  permission,
  workingDirectory,
  onDeny,
  onAllowOnce,
  onAllowTask,
  onAllowPermanent,
}: {
  permission: ApprovalRequest;
  workingDirectory?: string | null;
  onDeny: () => void;
  onAllowOnce: () => void;
  onAllowTask: () => void;
  onAllowPermanent: () => void;
}) {
  const target = commandFromTool(permission.input) || toolTarget(permission.input);
  const destructive = permission.riskLevel === "high" || permission.riskLevel === "critical";
  const allowPermanent = permission.mode !== "read-only";
  return (
    <>
      <p className="approval-title">{approvalHeadline(permission)}</p>
      {target && <pre className="process-command">{target}</pre>}
      {workingDirectory && (
        <p className="approval-cwd">
          <span>Working directory</span>
          <code>{workingDirectory}</code>
        </p>
      )}
      {destructive && <p className="destructive-flag">Destructive action</p>}
      {permission.reason && <p className="approval-copy">{permission.reason}</p>}
      <div className="permission-meta">
        <span>Risk: {formatRiskLevel(permission.riskLevel)}</span>
        <span>This call: {describeScope(permission.scope)}</span>
      </div>
      <p className="approval-copy">Session and project allows cover every {permission.tool.replaceAll("_", " ")} call, including subagents.</p>
      <div className="permission-actions">
        <button type="button" className="permission-deny" onClick={onDeny} aria-keyshortcuts="Control+Backspace">Deny</button>
        <button type="button" className="permission-allow" onClick={onAllowOnce} aria-keyshortcuts="Control+Enter">Allow once</button>
        <button type="button" className="permission-allow-task" onClick={onAllowTask}>Allow for this session</button>
        {allowPermanent && (
          <button type="button" className="permission-allow-task" onClick={onAllowPermanent}>Always allow for this project</button>
        )}
      </div>
    </>
  );
}

export function decisionFromAction(action: "deny" | "once" | "task" | "permanent"): ApprovalDecision {
  if (action === "deny") return "deny";
  if (action === "once") return "allow-once";
  if (action === "permanent") return "allow-permanent";
  return "allow-task";
}
