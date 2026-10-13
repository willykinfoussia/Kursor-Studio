import { useEffect } from "react";
import { agentRuntime } from "../lib/agent/AgentRuntime";
import { useAgentStore } from "../stores/agentStore";
import { useE2ePreviewStore } from "../stores/e2ePreviewStore";
import { useVerificationStore } from "../stores/verificationStore";

export function useVerificationEvents() {
  useEffect(() => agentRuntime.subscribe((event) => {
    if (event.type === "test-progress") {
      if (event.level === "e2e") useE2ePreviewStore.getState().present(event);
      return;
    }
    if (
      event.type === "verification-started"
      || event.type === "verification-check-started"
      || event.type === "verification-check-completed"
      || event.type === "verification-completed"
    ) {
      useVerificationStore.getState().applyEvent(event);
      return;
    }
    const verification = useVerificationStore.getState();
    if (event.type === "permission-required" && verification.running) {
      const store = useAgentStore.getState();
      store.setPendingPermission({
        id: event.id,
        tool: event.tool,
        input: event.input,
        reason: event.reason,
        riskLevel: event.riskLevel,
        capability: event.capability,
        scope: event.scope,
        mode: event.mode,
      });
      store.addPermissionTrace({
        id: event.id,
        tool: event.tool,
        reason: event.reason,
        riskLevel: event.riskLevel,
        status: "pending",
      });
      store.setStatus("waiting_approval");
      verification.noteApproval(true);
      return;
    }
    if (event.type === "approval-resolved" && event.kind === "permission" && verification.phase === "approval") {
      verification.noteApproval(false);
    }
  }), []);
}
