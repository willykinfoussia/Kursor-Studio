import type { AgentEvent } from "../types";
import type { ContextFileStore } from "../context/types";
import { commandCheckRunner, planChecks, VerificationEngine } from "./VerificationEngine";
import { inspectProfile, writeVerifyProfile } from "./profile";
import { summaryFromReport } from "./status";
import {
  appendVerificationHistory,
  loadLastReport,
  loadVerificationHistory,
  mergeHistory,
  saveLastReport,
} from "./history";
import { projectVerifyFiles } from "./files";
import { historyFromAgentTraces } from "./traceHistory";
import type {
  CheckRunner,
  ProfileInspection,
  VerificationHistoryEntry,
  VerificationProfile,
  VerificationReport,
  VerificationRunInput,
  VerificationTrigger,
  VerifyProfileWriter,
} from "./types";

export interface VerificationServiceOptions {
  files?: ContextFileStore;
  writer?: VerifyProfileWriter;
  engine?: VerificationEngine;
  getProjectId?: () => string | null;
  emit?: (event: AgentEvent) => void;
}

export class VerificationService {
  constructor(private readonly options: VerificationServiceOptions = {}) {}

  files() {
    return this.options.files ?? projectVerifyFiles();
  }

  writer(): VerifyProfileWriter {
    const files = this.files();
    if (this.options.writer) return this.options.writer;
    if ("writeFile" in files && typeof (files as VerifyProfileWriter).writeFile === "function") {
      return files as VerifyProfileWriter;
    }
    throw new Error("Verification profile writer is not available.");
  }

  inspect(override?: VerificationProfile): Promise<ProfileInspection> {
    return inspectProfile(this.files(), override);
  }

  async saveOverlay(overlay: VerificationProfile): Promise<ProfileInspection> {
    await writeVerifyProfile(this.writer(), overlay);
    return this.inspect();
  }

  async run(input: {
    runner: CheckRunner;
    requestId: string;
    trigger?: VerificationTrigger;
    runId?: string;
    attempt?: number;
    kinds?: VerificationRunInput["kinds"];
    customNames?: string[];
    expectedPaths?: string[];
    signal?: AbortSignal;
    emit?: (event: AgentEvent) => void;
    engine?: VerificationEngine;
  }): Promise<VerificationReport> {
    const trigger = input.trigger ?? "manual";
    const emit = input.emit ?? this.options.emit ?? (() => undefined);
    const engine = input.engine ?? this.options.engine ?? new VerificationEngine({ files: this.files() });
    const inspection = await inspectProfile(this.files());
    const planned = planChecks(inspection.resolved, {
      kinds: input.kinds,
      customNames: input.customNames,
      expectedPaths: input.expectedPaths,
    });
    emit({
      type: "verification-started",
      requestId: input.requestId,
      trigger,
      checkCount: planned.length,
    });
    const report = await engine.run({
      runner: input.runner,
      files: this.files(),
      attempt: input.attempt ?? 1,
      kinds: input.kinds,
      customNames: input.customNames,
      expectedPaths: input.expectedPaths,
      signal: input.signal,
      onCheckStart: (check) => {
        emit({
          type: "verification-check-started",
          requestId: input.requestId,
          kind: check.kind,
          name: check.name,
          command: check.command,
          expectedFile: check.expectedFile,
        });
      },
      onCheckEnd: (result) => {
        emit({
          type: "verification-check-completed",
          requestId: input.requestId,
          result,
        });
      },
    });
    emit({
      type: "verification-completed",
      requestId: input.requestId,
      ok: report.ok,
      blockers: report.blockers,
      commands: report.results.map((result) => result.command).filter((command): command is string => Boolean(command)),
      attempt: report.attempts,
      results: report.results,
      durationMs: report.durationMs,
      trigger,
      cancelled: report.cancelled,
    });
    await this.persist(report, {
      requestId: input.requestId,
      trigger,
      runId: input.runId,
    });
    return report;
  }

  async persist(
    report: VerificationReport,
    meta: { requestId: string; trigger: VerificationTrigger; runId?: string },
  ): Promise<VerificationHistoryEntry | null> {
    const projectId = this.options.getProjectId?.();
    if (!projectId) return null;
    await saveLastReport(projectId, report);
    const entry = summaryFromReport(report, meta);
    await appendVerificationHistory(projectId, entry);
    return entry;
  }

  async loadState(projectId: string | null): Promise<{
    lastReport: VerificationReport | null;
    history: VerificationHistoryEntry[];
  }> {
    if (!projectId) return { lastReport: null, history: [] };
    const [lastReport, persisted, traces] = await Promise.all([
      loadLastReport(projectId),
      loadVerificationHistory(projectId),
      historyFromAgentTraces(projectId).catch(() => []),
    ]);
    return { lastReport, history: mergeHistory(persisted, traces) };
  }
}

export { commandCheckRunner };
