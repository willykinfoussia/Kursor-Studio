import { Puzzle } from "lucide-react";
import { capabilityIdFromRuntimeTool } from "../../../lib/capabilities/ids";
import { openCapability } from "../../../lib/workflow/navigation";

export function ViewCapabilityButton({ tool }: { tool: string }) {
  return (
    <button type="button" className="copy-btn" onClick={() => openCapability(capabilityIdFromRuntimeTool(tool))}>
      <Puzzle size={11} /> View capability
    </button>
  );
}
