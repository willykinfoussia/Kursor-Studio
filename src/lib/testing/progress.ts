import type { ContextFileStore } from "../agent/context/types";
import { caseTypeFor, type TestCase, type TestLevel } from "./domain";

export type TestProgressStatus = "running" | "passed" | "failed" | "skipped";

export interface TestProgressCase {
  id: string;
  name: string;
  status: TestProgressStatus;
  error?: string;
}

export interface TestLevelProgress {
  level: TestLevel;
  phase: TestProgressStatus;
  passed: number;
  failed: number;
  skipped: number;
  running: number;
  total: number | null;
  cases: TestProgressCase[];
  screenshotPath?: string | null;
  videoPath?: string | null;
}

export type LiveReporter = "vitest" | "playwright" | "generic";

interface LiveParseState {
  level: TestLevel;
  reporter: LiveReporter;
  buffer: string;
  cases: Map<string, TestProgressCase>;
  order: string[];
  total: number | null;
}

export function reporterForCommand(command: string): LiveReporter {
  const lower = command.toLowerCase();
  if (lower.includes("vitest")) return "vitest";
  if (lower.includes("playwright")) return "playwright";
  return "generic";
}

export function progressFromOutput(
  level: TestLevel,
  reporter: LiveReporter,
  stdout: string,
  settled: boolean,
): TestLevelProgress {
  const state = createLiveParse(level, reporter);
  pushLiveChunk(state, stdout);
  if (settled) flushLive(state);
  return liveProgress(state, settled);
}

export function progressFromCases(level: TestLevel, cases: readonly TestCase[]): TestLevelProgress {
  const mapped: TestProgressCase[] = cases.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status === "PASSED"
      ? "passed"
      : item.status === "FAILED" || item.status === "ERROR"
        ? "failed"
        : item.status === "RUNNING"
          ? "running"
          : "skipped",
    error: item.error,
  }));
  return summarize(level, mapped, true, mapped.length);
}

export function casesFromProgress(progress: TestLevelProgress, runner: string): TestCase[] {
  return progress.cases.filter((item) => item.status !== "running").map((item) => ({
    id: item.id,
    name: item.name,
    description: item.name,
    type: caseTypeFor(progress.level),
    framework: runner,
    runner,
    status: item.status === "passed" ? "PASSED" : item.status === "failed" ? "FAILED" : "SKIPPED",
    error: item.error,
  }));
}

export interface E2eCapture {
  image: string | null;
  video: string | null;
}

export async function findLatestCapture(files?: ContextFileStore): Promise<E2eCapture> {
  const images: string[] = [];
  const videos: string[] = [];
  if (files) {
    for (const root of ["test-results", "playwright-report"]) {
      await collectMedia(files, root, 0, images, videos);
    }
  }
  return { image: preferCapture(images), video: preferCapture(videos) };
}

export async function findLatestScreenshot(files?: ContextFileStore): Promise<string | null> {
  return (await findLatestCapture(files)).image;
}

function createLiveParse(level: TestLevel, reporter: LiveReporter): LiveParseState {
  return { level, reporter, buffer: "", cases: new Map(), order: [], total: null };
}

function pushLiveChunk(state: LiveParseState, chunk: string) {
  state.buffer += chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let breakAt = state.buffer.indexOf("\n");
  while (breakAt >= 0) {
    const line = state.buffer.slice(0, breakAt);
    state.buffer = state.buffer.slice(breakAt + 1);
    consumeLine(state, line);
    breakAt = state.buffer.indexOf("\n");
  }
}

function flushLive(state: LiveParseState) {
  if (!state.buffer.trim()) return;
  consumeLine(state, state.buffer);
  state.buffer = "";
}

function liveProgress(state: LiveParseState, settled: boolean): TestLevelProgress {
  const cases = state.order
    .map((id) => state.cases.get(id))
    .filter((item): item is TestProgressCase => Boolean(item))
    .filter((item) => !settled || item.status !== "running");
  return summarize(state.level, cases, settled, state.total);
}

function summarize(
  level: TestLevel,
  cases: TestProgressCase[],
  settled: boolean,
  knownTotal: number | null,
): TestLevelProgress {
  const passed = cases.filter((item) => item.status === "passed").length;
  const failed = cases.filter((item) => item.status === "failed").length;
  const skipped = cases.filter((item) => item.status === "skipped").length;
  const running = cases.filter((item) => item.status === "running").length;
  const phase: TestProgressStatus = !settled
    ? "running"
    : failed > 0
      ? "failed"
      : cases.length > 0 && skipped === cases.length
        ? "skipped"
        : "passed";
  return {
    level,
    phase,
    passed,
    failed,
    skipped,
    running: settled ? 0 : running,
    total: knownTotal ?? (settled ? cases.length : null),
    cases,
  };
}

function consumeLine(state: LiveParseState, rawLine: string) {
  const trimmed = rawLine.trim();
  if (!trimmed || state.reporter === "generic") return;
  const runningTotal = /Running\s+(\d+)\s+tests/i.exec(trimmed);
  if (runningTotal) {
    state.total = Number(runningTotal[1]);
    return;
  }
  if (/^(?:Test Files|Tests|Start at|Duration)\b/.test(trimmed)) return;
  const arrow = /^(?:→|->)\s+(.+)$/.exec(trimmed);
  if (arrow) {
    appendError(state, arrow[1] ?? "");
    return;
  }
  if (/^(?:Error|AssertionError):/.test(trimmed)) {
    appendError(state, trimmed);
    return;
  }
  if (state.reporter === "playwright") {
    const symbol = /^([✓✔✘×xX])\s+\d+\s+(.+)$/.exec(trimmed);
    if (symbol) {
      noteCase(state, playwrightName(symbol[2] ?? ""), mark(symbol[1] ?? ""));
      return;
    }
    const word = /^(ok|x|passed|failed)\s+\d+\s+(.+)$/i.exec(trimmed);
    if (word) {
      const status = /^(ok|passed)$/i.test(word[1] ?? "") ? "passed" : "failed";
      noteCase(state, playwrightName(word[2] ?? ""), status);
    }
    return;
  }
  const current = /^❯\s+(.+)$/.exec(trimmed);
  if (current) {
    noteCase(state, cleanName(current[1] ?? ""), "running", true);
    return;
  }
  const match = /^([✓✔×✘xX])\s+(.+?)(?:\s+\d+(?:\.\d+)?\s*ms)?\s*$/.exec(trimmed);
  if (!match) return;
  const name = cleanName(match[2] ?? "");
  if (/\(\d+\s+tests?\)/.test(name)) return;
  noteCase(state, name, mark(match[1] ?? ""));
}

function noteCase(state: LiveParseState, name: string, status: TestProgressStatus, replaceRunning = false) {
  const label = name.trim();
  if (!label) return;
  if (replaceRunning) {
    for (const [id, item] of state.cases) {
      if (item.status !== "running") continue;
      state.cases.delete(id);
      state.order = state.order.filter((itemId) => itemId !== id);
    }
  }
  const existing = state.cases.get(label);
  if (existing) {
    existing.status = status;
    if (status !== "failed") existing.error = undefined;
    return;
  }
  state.cases.set(label, { id: label, name: label, status });
  state.order.push(label);
}

function appendError(state: LiveParseState, message: string) {
  const lastId = [...state.order].reverse().find((id) => state.cases.get(id)?.status === "failed");
  if (!lastId) return;
  const item = state.cases.get(lastId);
  if (!item) return;
  item.error = item.error ? `${item.error}\n${message}` : message;
}

function mark(symbol: string): TestProgressStatus {
  return symbol === "✓" || symbol === "✔" ? "passed" : "failed";
}

function cleanName(name: string) {
  return name.replace(/\s+\d+(?:\.\d+)?\s*ms$/, "").trim();
}

function playwrightName(rest: string) {
  const parts = rest.split("›").map((part) => part.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? rest.trim();
  return last.replace(/\s+\([\d.]+(?:ms|s)\)$/, "").trim();
}

function preferCapture(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const failed = paths.filter((path) => /fail|error/i.test(path));
  const pool = failed.length > 0 ? failed : paths;
  return pool.sort()[pool.length - 1] ?? null;
}

async function collectMedia(files: ContextFileStore, dir: string, depth: number, images: string[], videos: string[]) {
  if (depth > 3) return;
  const entries = await files.listDirectory(dir).catch(() => []);
  for (const entry of entries) {
    if (entry.kind === "directory") {
      await collectMedia(files, entry.path, depth + 1, images, videos);
      continue;
    }
    if (/\.(png|jpe?g|webp)$/i.test(entry.name)) images.push(entry.path);
    else if (/\.webm$/i.test(entry.name)) videos.push(entry.path);
  }
}
