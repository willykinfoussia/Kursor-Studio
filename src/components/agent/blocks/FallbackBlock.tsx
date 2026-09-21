import { RotateCw } from "lucide-react";
import { getModelName } from "../../../lib/agent/config";
import { useSettingsStore } from "../../../stores/settingsStore";
import { ViewInWorkflowButton } from "./ViewInWorkflowButton";

export function FallbackBlock({
  fromModel,
  toModel,
  reason,
}: {
  fromModel: string;
  toModel: string;
  reason: string;
}) {
  const customModels = useSettingsStore((state) => state.customModels);
  return (
    <div className="system-notice fallback-notice" role="status">
      <RotateCw size={12} />
      <span>
        Model unavailable · {getModelName(fromModel, customModels)} → {getModelName(toModel, customModels)}
        {" · Continuing…"}
      </span>
      {reason && <small>{reason}</small>}
      <ViewInWorkflowButton nodeId={`fallback:${fromModel}:${toModel}`} />
    </div>
  );
}
