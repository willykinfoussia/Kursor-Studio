import { databaseApi } from "../../tauri/databaseApi";
import { eventTraceRepository } from "../../storage/eventTraceRepository";
import { toRunEventFromStored } from "../../workflow/events";
import type { VerificationHistoryEntry } from "./types";
import { countsFromReport } from "./status";
import type { CheckResult, VerificationReport } from "./types";

export async function historyFromAgentTraces(projectId: string): Promise<VerificationHistoryEntry[]> {
  const runs = await databaseApi.agentRunsList(projectId, 40).catch(() => []);
  const entries: VerificationHistoryEntry[] = [];
  for (const run of runs) {
    const traces = await eventTraceRepository.list(run.id).catch(() => []);
    for (const record of traces) {
      if (record.eventType !== "verification-completed") continue;
      const event = toRunEventFromStored(record);
      if (!event || event.payload.type !== "verification-completed") continue;
      const payload = event.payload;
      const results = payload.results ?? [];
      const counts = results.length > 0
        ? countsFromReport({
          ok: payload.ok,
          attempts: payload.attempt,
          results,
          blockers: payload.blockers,
          missingFiles: [],
          durationMs: payload.durationMs,
          cancelled: payload.cancelled,
        } satisfies VerificationReport)
        : countsFromCommands(payload.commands, payload.ok, payload.blockers);
      entries.push({
        id: `${payload.requestId}:${payload.attempt}`,
        timestamp: event.timestamp || record.createdAt,
        trigger: payload.trigger ?? "agent",
        requestId: payload.requestId,
        runId: run.id,
        ok: payload.ok,
        attempt: payload.attempt,
        passed: counts.passed,
        failed: counts.failed,
        skipped: counts.skipped,
        blocked: counts.blocked,
        durationMs: payload.durationMs,
        cancelled: payload.cancelled,
      });
    }
  }
  return entries;
}

function countsFromCommands(commands: string[], ok: boolean, blockers: string[]): {
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
} {
  const total = Math.max(commands.length, ok ? 0 : 1);
  if (ok) return { passed: total, failed: 0, skipped: 0, blocked: 0 };
  const failed = Math.max(1, blockers.length);
  return {
    passed: Math.max(0, total - failed),
    failed,
    skipped: 0,
    blocked: 0,
  };
}

export function reportFromResults(results: CheckResult[], attempt = 1): VerificationReport {
  const missingFiles = results.filter((result) => result.expectedFile && !result.ok).map((result) => result.name ?? "");
  return {
    ok: results.every((result) => result.ok || result.skipped || result.cancelled),
    attempts: attempt,
    results,
    blockers: results.filter((result) => !result.ok && !result.skipped && !result.cancelled).map((result) => result.diagnosis),
    missingFiles: missingFiles.filter(Boolean),
  };
}
