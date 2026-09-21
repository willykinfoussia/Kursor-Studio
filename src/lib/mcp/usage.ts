import { capabilityToolId } from "./ids";
import { redactValue } from "./redact";
import { mcpApi } from "../tauri/mcpApi";

export function persistMcpUsage(input: {
  id: string;
  runId?: string;
  serverId: string;
  toolName: string;
  startedAt: number;
  finishedAt?: number;
  status: string;
  metadata?: Record<string, unknown>;
}) {
  const metadata = input.metadata ? JSON.stringify(redactValue(input.metadata)) : undefined;
  void mcpApi.recordUsage({
    id: input.id,
    runId: input.runId,
    serverId: input.serverId,
    capabilityId: capabilityToolId(input.serverId, input.toolName),
    toolName: input.toolName,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    status: input.status,
    metadataJson: metadata,
  }).catch(() => undefined);
}
