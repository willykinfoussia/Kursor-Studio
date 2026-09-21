import type { ContextFileStore } from "../context/types";
import { clipVerifyOutput, diagnoseCheck } from "./clip";
import { enabledCommand, resolveProfile } from "./profile";
import {
  MAX_VERIFICATION_ATTEMPTS,
  STANDARD_CHECK_KINDS,
  type CheckKind,
  type CheckResult,
  type CheckRunner,
  type PlannedCheck,
  type VerificationProfile,
  type VerificationReport,
  type VerificationRunInput,
} from "./types";

export class VerificationEngine {
  constructor(private readonly options: { files?: ContextFileStore; profile?: VerificationProfile } = {}) {}

  async run(input: VerificationRunInput = {}): Promise<VerificationReport> {
    const started = Date.now();
    const files = input.files ?? this.options.files;
    const profile = await resolveProfile(files, input.profile ?? this.options.profile);
    const planned = planChecks(profile, input);
    const results: CheckResult[] = [];
    let cancelled = false;

    for (const check of planned) {
      if (input.signal?.aborted) {
        cancelled = true;
        results.push(cancelledCheck(check));
        input.onCheckEnd?.(results[results.length - 1]!);
        continue;
      }
      input.onCheckStart?.(check);
      const result = await executePlanned(check, files, input.runner);
      results.push(result);
      input.onCheckEnd?.(result);
      if (input.signal?.aborted) cancelled = true;
    }

    const missingFiles = results
      .filter((result) => result.expectedFile && !result.ok && !result.skipped && !result.cancelled)
      .map((result) => result.name)
      .filter((name): name is string => Boolean(name));
    const attempts = input.attempt ?? 1;
    const blockers = completionGate(results, []);
    return {
      ok: !cancelled && blockers.length === 0,
      attempts,
      results,
      blockers,
      missingFiles,
      durationMs: Date.now() - started,
      cancelled,
    };
  }
}

export function planChecks(profile: VerificationProfile, input: VerificationRunInput = {}): PlannedCheck[] {
  const planned: PlannedCheck[] = [];
  const filtered = isFiltered(input);

  for (const kind of STANDARD_CHECK_KINDS) {
    if (filtered && !input.kinds?.includes(kind)) continue;
    const command = enabledCommand(profile[kind]);
    if (profile[kind] === false) {
      planned.push({ kind, disabled: true, skipReason: "disabled by profile" });
      continue;
    }
    if (!command) {
      planned.push({
        kind,
        skipReason: kind === "runtime" ? "no runtime command" : "no command",
      });
      continue;
    }
    planned.push({ kind, command });
  }

  const customNames = new Set((input.customNames ?? []).map((name) => name.trim()).filter(Boolean));
  const wantCustom = !filtered || input.kinds?.includes("custom") === true || customNames.size > 0;
  if (wantCustom) {
    for (const custom of profile.custom ?? []) {
      if (!custom.command.trim()) continue;
      if (customNames.size > 0 && !customNames.has(custom.name) && !customNames.has(custom.command)) continue;
      planned.push({ kind: "custom", name: custom.name, command: custom.command });
    }
  }

  const wantFiles = !filtered || input.kinds?.includes("files") === true || Boolean(input.expectedPaths?.length);
  if (wantFiles) {
    const paths = input.expectedPaths?.length
      ? input.expectedPaths
      : profile.expectedFiles ?? [];
    for (const path of paths) {
      if (!path.trim()) continue;
      planned.push({
        kind: "custom",
        name: path,
        path,
        expectedFile: true,
      });
    }
  }

  return planned;
}

export function completionGate(results: readonly CheckResult[], missingFiles: readonly string[] = []): string[] {
  const blockers: string[] = [];
  for (const result of results) {
    if (result.skipped || result.cancelled) continue;
    if (result.denied) {
      blockers.push(result.diagnosis || `Required ${result.kind} check was denied.`);
      continue;
    }
    if (!result.ok) {
      blockers.push(result.diagnosis || `Required ${result.kind} check failed.`);
    }
  }
  for (const path of missingFiles) {
    blockers.push(`Expected file missing: ${path}`);
  }
  return blockers;
}

export function formatForModel(report: VerificationReport): string {
  const lines = [
    `Verification failed (attempt ${report.attempts}/${MAX_VERIFICATION_ATTEMPTS}).`,
    "Do not declare the task done until required checks pass.",
  ];
  for (const result of report.results) {
    if (result.skipped || result.ok || result.cancelled) continue;
    lines.push("");
    lines.push(`Check: ${result.name ?? result.kind}`);
    if (result.command) lines.push(`Command: ${result.command}`);
    lines.push(`Exit code: ${result.exitCode ?? "denied"}`);
    if (result.path) lines.push(`Path: ${result.path}`);
    if (result.diagnosis) lines.push(`Diagnosis: ${result.diagnosis}`);
    if (result.stdout) lines.push(`stdout:\n${clipVerifyOutput(result.stdout)}`);
    if (result.stderr) lines.push(`stderr:\n${clipVerifyOutput(result.stderr)}`);
  }
  if (report.missingFiles.length > 0) {
    lines.push("");
    lines.push(`Missing files: ${report.missingFiles.join(", ")}`);
  }
  return lines.join("\n");
}

async function executePlanned(
  check: PlannedCheck,
  files: ContextFileStore | undefined,
  runner?: CheckRunner,
): Promise<CheckResult> {
  if (check.expectedFile && check.path) {
    const started = Date.now();
    if (!files) {
      return {
        kind: "custom",
        name: check.path,
        exitCode: null,
        stdout: "",
        stderr: "",
        diagnosis: "no file store",
        ok: false,
        expectedFile: true,
        durationMs: Date.now() - started,
      };
    }
    const exists = await files.readFile(check.path).then(() => true).catch(() => false);
    return {
      kind: "custom",
      name: check.path,
      path: check.path,
      exitCode: exists ? 0 : 1,
      stdout: "",
      stderr: exists ? "" : `Expected file missing: ${check.path}`,
      diagnosis: exists ? "" : `Expected file missing: ${check.path}`,
      ok: exists,
      expectedFile: true,
      durationMs: Date.now() - started,
    };
  }
  if (check.disabled || check.skipReason) {
    return skipped(check.kind, check.skipReason ?? "disabled by profile", check.name);
  }
  if (!check.command) return skipped(check.kind, "no command", check.name);
  return runCheck(check.kind, check.command, runner, check.name);
}

async function runCheck(
  kind: CheckKind,
  command: string,
  runner?: CheckRunner,
  name?: string,
): Promise<CheckResult> {
  if (!runner) return skipped(kind, "no runner", name);
  const started = Date.now();
  const ran = await runner.run(command);
  const durationMs = Date.now() - started;
  const stdout = clipVerifyOutput(ran.stdout);
  const stderr = clipVerifyOutput(ran.stderr);
  if (ran.denied) {
    const diagnosed = diagnoseCheck({
      kind,
      command,
      exitCode: ran.exitCode,
      stdout,
      stderr,
      denied: true,
    });
    return {
      kind,
      name,
      command,
      exitCode: ran.exitCode,
      stdout,
      stderr,
      diagnosis: diagnosed.diagnosis,
      ok: false,
      denied: true,
      durationMs,
    };
  }
  const ok = ran.exitCode === 0;
  const diagnosed = ok
    ? { diagnosis: "", path: undefined }
    : diagnoseCheck({ kind, command, exitCode: ran.exitCode, stdout, stderr });
  return {
    kind,
    name,
    command,
    exitCode: ran.exitCode,
    stdout,
    stderr,
    path: diagnosed.path,
    diagnosis: diagnosed.diagnosis,
    ok,
    durationMs,
  };
}

function skipped(kind: CheckKind, reason: string, name?: string): CheckResult {
  return {
    kind,
    name,
    exitCode: null,
    stdout: "",
    stderr: "",
    diagnosis: reason,
    ok: true,
    skipped: true,
    durationMs: 0,
  };
}

function cancelledCheck(check: PlannedCheck): CheckResult {
  return {
    kind: check.kind,
    name: check.name,
    command: check.command,
    path: check.path,
    expectedFile: check.expectedFile,
    exitCode: null,
    stdout: "",
    stderr: "",
    diagnosis: "cancelled by user",
    ok: false,
    cancelled: true,
    skipped: true,
    durationMs: 0,
  };
}

function isFiltered(input: VerificationRunInput): boolean {
  return Boolean(input.kinds?.length || input.customNames?.length || input.expectedPaths?.length);
}

export function commandCheckRunner(run: (command: string) => Promise<{
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  metadata?: Record<string, unknown>;
}>): CheckRunner {
  return {
    async run(command) {
      const result = await run(command);
      const data = result.data && typeof result.data === "object"
        ? result.data as { stdout?: unknown; stderr?: unknown; exitCode?: unknown }
        : {};
      const denied = result.error?.code === "permission_denied"
        || result.error?.code === "hook_denied"
        || result.error?.code === "workflow_denied";
      const exitCode = typeof data.exitCode === "number"
        ? data.exitCode
        : typeof result.metadata?.exitCode === "number"
          ? result.metadata.exitCode
          : result.success
            ? 0
            : denied
              ? null
              : 1;
      return {
        exitCode,
        stdout: typeof data.stdout === "string" ? data.stdout : "",
        stderr: typeof data.stderr === "string" ? data.stderr : (result.error?.message ?? ""),
        denied,
      };
    },
  };
}
