import type { ContextFileStore } from "../context/types";
import type {
  CheckKind,
  CheckOrigin,
  CheckToggle,
  CustomCheck,
  InspectedCheck,
  ProfileInspection,
  StandardCheckKind,
  VerificationEcosystem,
  VerificationProfile,
  VerifyProfileWriter,
} from "./types";
import { STANDARD_CHECK_KINDS, VERIFY_JSON_PATH } from "./types";

export async function resolveProfile(
  files?: ContextFileStore,
  override?: VerificationProfile,
): Promise<VerificationProfile> {
  const auto = files ? await detectProfile(files) : {};
  const fileOverride = files ? await readProjectProfile(files) : {};
  return mergeProfiles(auto, fileOverride, override ?? {});
}

export async function inspectProfile(
  files?: ContextFileStore,
  override?: VerificationProfile,
): Promise<ProfileInspection> {
  const names = files ? await rootNames(files) : new Set<string>();
  const auto = files ? await detectProfile(files) : {};
  const overlay = files ? await readProjectProfile(files) : {};
  const resolved = mergeProfiles(auto, overlay, override ?? {});
  return {
    ecosystem: detectEcosystem(names),
    detectedFrom: detectionSources(names),
    auto,
    overlay,
    resolved,
    checks: STANDARD_CHECK_KINDS.map((kind) => inspectCheck(kind, auto, overlay, resolved)),
    hasCustom: (resolved.custom ?? []).some((item) => item.command.trim()),
  };
}

export function enabledCommand(toggle: CheckToggle | undefined, fallback?: string): string | undefined {
  if (toggle === false || toggle === undefined) return undefined;
  if (typeof toggle === "string" && toggle.trim()) return toggle.trim();
  if (toggle === true && fallback?.trim()) return fallback.trim();
  return undefined;
}

export async function readProjectProfile(files: ContextFileStore): Promise<VerificationProfile> {
  const raw = await readIfPresent(files, VERIFY_JSON_PATH);
  if (!raw) return {};
  return sanitizeOverlay(safeParse(raw)) ?? {};
}

export async function writeVerifyProfile(
  writer: VerifyProfileWriter,
  overlay: VerificationProfile,
): Promise<VerificationProfile> {
  const clean = compactOverlay(overlay);
  if (writer.createDirectory) {
    await writer.createDirectory(".kursor").catch(() => undefined);
  }
  await writer.writeFile(VERIFY_JSON_PATH, `${JSON.stringify(clean, null, 2)}\n`);
  return clean;
}

export function sanitizeOverlay(value: unknown): VerificationProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const overlay: VerificationProfile = {};
  for (const kind of STANDARD_CHECK_KINDS) {
    const toggle = sanitizeToggle(record[kind]);
    if (toggle !== undefined) overlay[kind] = toggle;
  }
  if (Array.isArray(record.custom)) {
    const custom: CustomCheck[] = [];
    for (const item of record.custom) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const command = typeof row.command === "string" ? row.command.trim() : "";
      if (!command) continue;
      custom.push({ name: name || command, command });
    }
    if (custom.length > 0) overlay.custom = custom;
  }
  if (Array.isArray(record.expectedFiles)) {
    const expected = [...new Set(record.expectedFiles
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean))];
    if (expected.length > 0) overlay.expectedFiles = expected;
  }
  return overlay;
}

export const OVERLAY_KEYS = [...STANDARD_CHECK_KINDS, "custom", "expectedFiles"] as const;

export function overlayUnknownKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["<root>"];
  return Object.keys(value).filter((key) => !(OVERLAY_KEYS as readonly string[]).includes(key));
}

export function compactOverlay(overlay: VerificationProfile): VerificationProfile {
  return sanitizeOverlay(overlay) ?? {};
}

export function overlayFromInspection(
  inspection: ProfileInspection,
  next: {
    toggles?: Partial<Record<StandardCheckKind, CheckToggle | undefined>>;
    custom?: CustomCheck[];
    expectedFiles?: string[];
  },
): VerificationProfile {
  const overlay: VerificationProfile = { ...inspection.overlay };
  for (const kind of STANDARD_CHECK_KINDS) {
    if (next.toggles && Object.prototype.hasOwnProperty.call(next.toggles, kind)) {
      const value = next.toggles[kind];
      if (value === undefined) delete overlay[kind];
      else overlay[kind] = value;
    }
  }
  if (next.custom) overlay.custom = next.custom;
  if (next.expectedFiles) overlay.expectedFiles = next.expectedFiles;
  return compactOverlay(overlay);
}

export async function detectProfile(files: ContextFileStore): Promise<VerificationProfile> {
  const names = await rootNames(files);
  if (names.has("package.json")) return detectNode(files, names);
  if (names.has("Cargo.toml")) {
    return {
      typecheck: "cargo check",
      lint: "cargo clippy --all-targets -- -D warnings",
      test: "cargo test",
      build: "cargo build",
    };
  }
  if (names.has("go.mod")) {
    return { typecheck: "go test ./...", test: "go test ./...", build: "go build ./..." };
  }
  if (names.has("pyproject.toml") || names.has("requirements.txt")) {
    return { test: "pytest" };
  }
  return {};
}

function inspectCheck(
  kind: StandardCheckKind,
  auto: VerificationProfile,
  overlay: VerificationProfile,
  resolved: VerificationProfile,
): InspectedCheck {
  const autoCommand = enabledCommand(auto[kind]);
  const overlayValue = overlay[kind];
  return {
    kind,
    origin: originFor(overlayValue, autoCommand, resolved[kind]),
    autoCommand,
    overlay: overlayValue,
    command: enabledCommand(resolved[kind], autoCommand),
  };
}

function originFor(
  overlay: CheckToggle | undefined,
  autoCommand: string | undefined,
  resolved: CheckToggle | undefined,
): CheckOrigin {
  if (overlay === false) return "disabled";
  if (typeof overlay === "string" && overlay.trim()) return "custom";
  if (enabledCommand(resolved, autoCommand) || autoCommand) return "auto";
  return "absent";
}

function detectEcosystem(names: Set<string>): VerificationEcosystem {
  if (names.has("package.json")) return "node";
  if (names.has("Cargo.toml")) return "rust";
  if (names.has("go.mod")) return "go";
  if (names.has("pyproject.toml") || names.has("requirements.txt")) return "python";
  return "unknown";
}

function detectionSources(names: Set<string>): string[] {
  const sources: string[] = [];
  if (names.has("package.json")) sources.push("package.json");
  if (names.has("tsconfig.json")) sources.push("tsconfig.json");
  if (names.has("tsconfig.app.json") && !names.has("tsconfig.json")) sources.push("tsconfig.app.json");
  if (names.has("Cargo.toml")) sources.push("Cargo.toml");
  if (names.has("go.mod")) sources.push("go.mod");
  if (names.has("pyproject.toml")) sources.push("pyproject.toml");
  if (names.has("requirements.txt")) sources.push("requirements.txt");
  return sources;
}

async function detectNode(files: ContextFileStore, names: Set<string>): Promise<VerificationProfile> {
  const pkg = parseJson(await readIfPresent(files, "package.json"));
  const scripts = pkg && typeof pkg === "object" && pkg.scripts && typeof pkg.scripts === "object"
    ? pkg.scripts as Record<string, unknown>
    : {};
  const profile: VerificationProfile = {};
  if (names.has("tsconfig.json") || names.has("tsconfig.app.json")) {
    profile.typecheck = "pnpm exec tsc --noEmit";
  }
  if (typeof scripts.lint === "string") profile.lint = "pnpm lint";
  if (typeof scripts.test === "string") profile.test = "pnpm test";
  if (typeof scripts.build === "string") profile.build = "pnpm build";
  return profile;
}

function mergeProfiles(...layers: VerificationProfile[]): VerificationProfile {
  const merged: VerificationProfile = {};
  const custom: CustomCheck[] = [];
  const expected: string[] = [];
  for (const layer of layers) {
    for (const kind of STANDARD_CHECK_KINDS) {
      merged[kind] = mergeToggle(merged[kind], layer[kind]);
    }
    if (Array.isArray(layer.custom)) custom.push(...layer.custom.filter((item) => item?.command));
    if (Array.isArray(layer.expectedFiles)) expected.push(...layer.expectedFiles);
  }
  if (custom.length > 0) merged.custom = custom;
  if (expected.length > 0) merged.expectedFiles = [...new Set(expected)];
  return merged;
}

function mergeToggle(prev: CheckToggle | undefined, next: CheckToggle | undefined): CheckToggle | undefined {
  if (next === undefined) return prev;
  if (next === false) return false;
  if (typeof next === "string") return next;
  if (typeof prev === "string") return prev;
  return next;
}

function sanitizeToggle(value: unknown): CheckToggle | undefined {
  if (value === false || value === true) return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function rootNames(files: ContextFileStore) {
  const entries = await files.listDirectory(".").catch(() => files.listDirectory("").catch(() => []));
  return new Set(entries.map((entry) => entry.name));
}

async function readIfPresent(files: ContextFileStore, path: string) {
  try {
    return (await files.readFile(path)).trim();
  } catch {
    return "";
  }
}

function parseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const value = safeParse(raw);
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function isStandardKind(value: string): value is StandardCheckKind {
  return (STANDARD_CHECK_KINDS as readonly string[]).includes(value);
}

export function isCheckKind(value: string): value is CheckKind {
  return isStandardKind(value) || value === "custom";
}
