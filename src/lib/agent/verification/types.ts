export const MAX_VERIFICATION_ATTEMPTS = 3;
export const MAX_VERIFY_OUTPUT_CHARS = 4_000;
export const VERIFY_HISTORY_CAP = 50;
export const VERIFY_JSON_PATH = ".kursor/verify.json";

export type CheckKind = "typecheck" | "lint" | "test" | "build" | "runtime" | "custom";
export type StandardCheckKind = Exclude<CheckKind, "custom">;
export type CheckToggle = boolean | string;
export type CheckOrigin = "auto" | "custom" | "disabled" | "absent";
export type VerificationEcosystem = "node" | "rust" | "go" | "python" | "unknown";
export type VerificationTrigger = "agent" | "manual";
export type VerificationHealth =
  | "running"
  | "verified"
  | "failed"
  | "blocked"
  | "not-verified"
  | "cancelled";

export const STANDARD_CHECK_KINDS = ["typecheck", "lint", "test", "build", "runtime"] as const satisfies readonly StandardCheckKind[];

export interface CustomCheck {
  name: string;
  command: string;
}

export interface VerificationProfile {
  typecheck?: CheckToggle;
  lint?: CheckToggle;
  test?: CheckToggle;
  build?: CheckToggle;
  runtime?: CheckToggle;
  custom?: CustomCheck[];
  expectedFiles?: string[];
}

export interface CheckResult {
  kind: CheckKind;
  name?: string;
  command?: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  path?: string;
  diagnosis: string;
  ok: boolean;
  skipped?: boolean;
  denied?: boolean;
  cancelled?: boolean;
  durationMs?: number;
  expectedFile?: boolean;
}

export interface VerificationReport {
  ok: boolean;
  attempts: number;
  results: CheckResult[];
  blockers: string[];
  missingFiles: string[];
  durationMs?: number;
  cancelled?: boolean;
}

export interface CommandRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  denied?: boolean;
}

export interface CheckRunner {
  run(command: string): Promise<CommandRunResult>;
}

export interface PlannedCheck {
  kind: CheckKind;
  name?: string;
  command?: string;
  expectedFile?: boolean;
  path?: string;
  disabled?: boolean;
  skipReason?: string;
}

export interface VerificationRunInput {
  runner?: CheckRunner;
  files?: import("../context/types").ContextFileStore;
  profile?: VerificationProfile;
  attempt?: number;
  kinds?: Array<CheckKind | "files">;
  customNames?: string[];
  expectedPaths?: string[];
  signal?: AbortSignal;
  onCheckStart?: (check: PlannedCheck) => void;
  onCheckEnd?: (result: CheckResult) => void;
}

export interface InspectedCheck {
  kind: StandardCheckKind;
  origin: CheckOrigin;
  autoCommand?: string;
  overlay?: CheckToggle;
  command?: string;
}

export interface ProfileInspection {
  ecosystem: VerificationEcosystem;
  detectedFrom: string[];
  auto: VerificationProfile;
  overlay: VerificationProfile;
  resolved: VerificationProfile;
  checks: InspectedCheck[];
  hasCustom: boolean;
}

export interface VerifyProfileWriter {
  writeFile(path: string, content: string): Promise<void>;
  createDirectory?(path: string): Promise<void>;
}

export interface VerificationHistoryEntry {
  id: string;
  timestamp: number;
  trigger: VerificationTrigger;
  requestId: string;
  runId?: string;
  ok: boolean;
  attempt: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  durationMs?: number;
  cancelled?: boolean;
}

export interface FeatureEvidence {
  id: string;
  name: string;
  tests?: number;
  passed?: number;
  failed?: number;
}
