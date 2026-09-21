import { projectSettingsRepository } from "../../storage/settingsRepository";
import { VERIFY_HISTORY_CAP, type VerificationHistoryEntry, type VerificationReport } from "./types";

const LAST_REPORT_KEY = "verification.lastReport";
const HISTORY_KEY = "verification.history";

export async function loadLastReport(projectId: string): Promise<VerificationReport | null> {
  const raw = await readSetting(projectId, LAST_REPORT_KEY);
  return isReport(raw) ? raw : null;
}

export async function saveLastReport(projectId: string, report: VerificationReport): Promise<void> {
  await projectSettingsRepository.set(projectId, LAST_REPORT_KEY, report);
}

export async function loadVerificationHistory(projectId: string): Promise<VerificationHistoryEntry[]> {
  const raw = await readSetting(projectId, HISTORY_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isHistoryEntry);
}

export async function appendVerificationHistory(
  projectId: string,
  entry: VerificationHistoryEntry,
): Promise<VerificationHistoryEntry[]> {
  const current = await loadVerificationHistory(projectId);
  const next = [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, VERIFY_HISTORY_CAP);
  await projectSettingsRepository.set(projectId, HISTORY_KEY, next);
  return next;
}

export function mergeHistory(
  persisted: readonly VerificationHistoryEntry[],
  fromTraces: readonly VerificationHistoryEntry[],
): VerificationHistoryEntry[] {
  const byId = new Map<string, VerificationHistoryEntry>();
  for (const entry of [...fromTraces, ...persisted]) {
    const existing = byId.get(entry.id);
    if (!existing || entry.timestamp >= existing.timestamp) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort((left, right) => right.timestamp - left.timestamp).slice(0, VERIFY_HISTORY_CAP);
}

async function readSetting(projectId: string, key: string): Promise<unknown> {
  const items = await projectSettingsRepository.list(projectId).catch(() => []);
  const match = items.find((item) => item.key === key);
  if (!match) return null;
  try {
    return JSON.parse(match.value);
  } catch {
    return match.value;
  }
}

function isReport(value: unknown): value is VerificationReport {
  return Boolean(value && typeof value === "object" && Array.isArray((value as VerificationReport).results));
}

function isHistoryEntry(value: unknown): value is VerificationHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as VerificationHistoryEntry;
  return typeof entry.id === "string" && typeof entry.requestId === "string" && typeof entry.timestamp === "number";
}
