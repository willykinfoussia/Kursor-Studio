import type { ApprovalRequest } from "../../../lib/agent/permissions/types";
import type { WorkflowApprovalRequest } from "../../../lib/agent/workflows/types";
import { ApprovalDock } from "./ApprovalDock";

export function ApprovalBlock({
  kind,
  permission,
  workflow,
  onDeny,
  onAllowTask,
  onAllowPermanent,
  onApprovePlan,
  onRejectPlan,
}: {
  kind: "permission" | "workflow";
  permission?: ApprovalRequest | null;
  workflow?: WorkflowApprovalRequest | null;
  onDeny?: () => void;
  onAllowTask?: () => void;
  onAllowPermanent?: () => void;
  onApprovePlan?: () => void;
  onRejectPlan?: () => void;
}) {
  const entries = kind === "workflow" && workflow
    ? [{ kind: "workflow" as const, id: workflow.id, workflow }]
    : permission
      ? [{ kind: "permission" as const, id: permission.id, permission }]
      : [];
  if (entries.length === 0) return null;
  return (
    <ApprovalDock
      entries={entries}
      index={0}
      onIndexChange={() => undefined}
      onDeny={() => onDeny?.()}
      onAllowOnce={() => onAllowTask?.()}
      onAllowTask={() => onAllowTask?.()}
      onAllowPermanent={() => onAllowPermanent?.()}
      onApprovePlan={() => onApprovePlan?.()}
      onRejectPlan={() => onRejectPlan?.()}
    />
  );
}
