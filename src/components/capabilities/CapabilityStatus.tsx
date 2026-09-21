import { AlertTriangle, Check, Circle, CircleDot, X } from "lucide-react";
import { presentationalStatus } from "../../lib/capabilities/presentationalStatus";
import type { CapabilityStatusInput } from "../../lib/capabilities/presentationalStatus";

export function CapabilityStatus({
  item,
  compact = false,
}: {
  item: CapabilityStatusInput;
  compact?: boolean;
}) {
  const status = presentationalStatus(item);
  const Icon = status.id === "error"
    ? X
    : status.id === "needs-setup" || status.id === "unavailable"
      ? AlertTriangle
      : status.id === "disabled"
        ? Circle
        : status.id === "disconnected"
          ? CircleDot
          : Check;
  return (
    <span className={`cap-status status-${status.tone} ${compact ? "compact" : ""}`}>
      <Icon size={compact ? 10 : 11} strokeWidth={2} aria-hidden="true" />
      <span>{status.label}</span>
    </span>
  );
}
