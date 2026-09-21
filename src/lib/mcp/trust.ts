import type { MCPServerSnapshot } from "./types";

export function pendingProjectMcpTrust(servers: readonly MCPServerSnapshot[]) {
  return servers.filter((server) => server.origin === "project" && server.trust === "untrusted");
}
