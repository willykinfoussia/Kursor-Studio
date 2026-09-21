import { mcpRegistry } from "./MCPRegistry";
import { mcpRuntime } from "./MCPRuntime";
import { pendingProjectMcpTrust } from "./trust";
import { useMcpTrustStore } from "../../stores/mcpTrustStore";

export async function bootstrapMcp(projectId?: string | null, projectRoot?: string | null) {
  mcpRegistry.bindEvents();
  try {
    if (projectRoot) {
      await mcpRuntime.switchProject(projectId, projectRoot);
    } else {
      await mcpRuntime.bootstrap(projectId);
    }
    await mcpRegistry.sync(projectId);
  } catch {
    await mcpRegistry.sync(projectId).catch(() => undefined);
  }
  useMcpTrustStore.getState().setPending(pendingProjectMcpTrust(mcpRegistry.listServers()));
}
