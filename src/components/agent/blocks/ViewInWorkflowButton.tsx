import { Workflow } from "lucide-react";
import { openWorkflowNode } from "../../../lib/workflow/navigation";

export function ViewInWorkflowButton({ nodeId }: { nodeId: string }) {
  return (
    <button type="button" className="copy-btn" onClick={() => openWorkflowNode(nodeId)}>
      <Workflow size={11} /> View in Workflow
    </button>
  );
}
