import type { WorkStatus } from "../types";
import type { ConversationItem } from "./types";
import {
  commandFromTool,
  extractKnownFilePath,
  isGroupableTool,
  isStandaloneTool,
  readToolData,
  toolFamily,
  toolTarget,
  type ToolFamily,
} from "./toolMeta";

export interface ToolLookup {
  tool: string;
  status: WorkStatus;
  input?: unknown;
  output?: unknown;
}

export type TimelineViewItem =
  | { kind: "item"; item: ConversationItem }
  | { kind: "tool-group"; id: string; family: ToolFamily; items: Extract<ConversationItem, { type: "tool" }>[] };

export interface ToolGroupSummary {
  family: ToolFamily;
  title: string;
  running: boolean;
  failed: number;
  cancelled: number;
  files: string[];
  searches: number;
  commands: string[];
  added: number;
  removed: number;
}

function toolInfo(item: Extract<ConversationItem, { type: "tool" }>, tools: Map<string, ToolLookup>) {
  return tools.get(item.toolCallId);
}

export function shouldKeepToolSeparate(name: string, status?: WorkStatus) {
  if (isStandaloneTool(name)) return true;
  if (!isGroupableTool(name)) return true;
  if (status === "failed") return true;
  return false;
}

function flushBuffer(
  views: TimelineViewItem[],
  buffer: Extract<ConversationItem, { type: "tool" }>[],
  family: ToolFamily | null,
) {
  if (buffer.length === 0) return;
  const first = buffer[0];
  if (!first) return;
  views.push({
    kind: "tool-group",
    id: `group:${first.id}`,
    family: family ?? "other",
    items: [...buffer],
  });
}

function isToolGroupBreak(item: ConversationItem) {
  if (item.type === "tool") return false;
  if (item.type === "assistant") return item.content.trim().length > 0;
  if (item.type === "user" || item.type === "user-question") return true;
  return true;
}

export function groupTimelineItems(
  items: ConversationItem[],
  tools: Map<string, ToolLookup>,
): TimelineViewItem[] {
  const views: TimelineViewItem[] = [];
  let buffer: Extract<ConversationItem, { type: "tool" }>[] = [];
  let family: ToolFamily | null = null;

  const flush = () => {
    flushBuffer(views, buffer, family);
    buffer = [];
    family = null;
  };

  for (const item of items) {
    if (item.type === "assistant" && !item.content.trim()) continue;
    if (item.type !== "tool") {
      if (isToolGroupBreak(item) || buffer.length > 0) flush();
      views.push({ kind: "item", item });
      continue;
    }
    if (!family) family = toolFamily(toolInfo(item, tools)?.tool ?? "");
    buffer.push(item);
  }
  flush();
  return views;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
  }
  return next;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function diffStats(output: unknown) {
  const data = readToolData(output);
  if (!data) return { added: 0, removed: 0 };
  return {
    added: asNumber(data.additions) || asNumber(data.added) || asNumber(data.linesAdded),
    removed: asNumber(data.deletions) || asNumber(data.removed) || asNumber(data.linesRemoved),
  };
}

function fileFromCall(call: ToolLookup) {
  return extractKnownFilePath(call.input) ?? extractKnownFilePath(call.output) ?? "";
}

const FAMILY_ORDER: ToolFamily[] = ["skill", "explore", "web", "edit", "terminal", "git", "verify", "other"];

export function summarizeToolGroup(calls: ToolLookup[]): ToolGroupSummary {
  const families = uniqueStrings(calls.map((call) => toolFamily(call.tool))) as ToolFamily[];
  const family = (FAMILY_ORDER.find((item) => families.includes(item)) ?? families[0] ?? "other") as ToolFamily;
  const running = calls.some((call) => call.status === "running" || call.status === "pending");
  const failed = calls.filter((call) => call.status === "failed").length;
  const cancelled = 0;
  const files = uniqueStrings(calls.map(fileFromCall).filter(Boolean));
  const searches = calls.filter((call) => call.tool === "search_files" || call.tool === "web_search").length;
  const commands = uniqueStrings(calls.map((call) => commandFromTool(call.input, call.output)).filter(Boolean));
  const diffs = calls.reduce((acc, call) => {
    const stats = diffStats(call.output);
    return { added: acc.added + stats.added, removed: acc.removed + stats.removed };
  }, { added: 0, removed: 0 });
  const ordered = FAMILY_ORDER.filter((item) => families.includes(item));
  const titles = (ordered.length > 0 ? ordered : [family]).map((item) => {
    const subset = calls.filter((call) => toolFamily(call.tool) === item);
    return groupTitle(item, countsFor(subset), true);
  });
  const failSuffix = failed > 0 ? `  ${failed} failed` : "";

  return {
    family,
    title: `${titles.join(" · ")}${failSuffix}`,
    running,
    failed,
    cancelled,
    files,
    searches,
    commands,
    added: diffs.added,
    removed: diffs.removed,
  };
}

function countsFor(calls: ToolLookup[]) {
  const files = uniqueStrings(calls.map(fileFromCall).filter(Boolean)).length;
  const searches = calls.filter((call) => call.tool === "search_files" || call.tool === "web_search").length;
  const commands = uniqueStrings(calls.map((call) => commandFromTool(call.input, call.output)).filter(Boolean)).length;
  const failed = calls.filter((call) => call.status === "failed").length;
  return {
    files,
    searches,
    commands,
    calls: calls.length,
    failed,
    running: calls.some((call) => call.status === "running" || call.status === "pending"),
  };
}

function groupTitle(
  family: ToolFamily,
  counts: { files: number; searches: number; commands: number; calls: number; failed: number; running: boolean },
  omitFailed = false,
) {
  const failSuffix = !omitFailed && counts.failed > 0 ? `  ${counts.failed} failed` : "";
  if (family === "explore") {
    const parts: string[] = [];
    if (counts.files > 0) parts.push(`${counts.files} file${counts.files === 1 ? "" : "s"}`);
    if (counts.searches > 0) parts.push(`${counts.searches} search${counts.searches === 1 ? "" : "es"}`);
    if (parts.length === 0) return `Explored${failSuffix}`;
    if (counts.searches === 0) return `Read ${parts[0]}${failSuffix}`;
    return `Explored ${parts.join(", ")}${failSuffix}`;
  }
  if (family === "edit") {
    const n = Math.max(counts.files, counts.commands, 1);
    return `Edited ${n} file${n === 1 ? "" : "s"}${failSuffix}`;
  }
  if (family === "terminal") {
    const n = Math.max(counts.commands, 1);
    if (omitFailed) return `Ran ${n} command${n === 1 ? "" : "s"}`;
    const passed = n - counts.failed;
    const status = counts.failed > 0
      ? `  ${passed} passed, ${counts.failed} failed`
      : "";
    return `Ran ${n} command${n === 1 ? "" : "s"}${status}`;
  }
  if (family === "git") return counts.commands > 1 ? `Git  ${counts.commands} commands${failSuffix}` : `Git${failSuffix}`;
  if (family === "web") {
    if (counts.searches > 0 && counts.files === 0) return `Searched the web${failSuffix}`;
    const pages = Math.max(counts.files, counts.commands, 1);
    return `Fetched ${pages} page${pages === 1 ? "" : "s"}${failSuffix}`;
  }
  if (family === "verify") return counts.failed > 0 ? "Verification failed" : "Verified changes";
  if (family === "skill") {
    const n = Math.max(counts.calls, 1);
    return `Used ${n} skill${n === 1 ? "" : "s"}${failSuffix}`;
  }
  const n = Math.max(counts.files, counts.commands, 1);
  return `Used ${n} tool${n === 1 ? "" : "s"}${failSuffix}`;
}

export function activeToolLabel(tool: string, input: unknown) {
  const target = toolTarget(input);
  const family = toolFamily(tool);
  if (family === "explore") {
    if (tool === "search_files") return target ? `Searching ${target}...` : "Searching...";
    if (tool === "read_file") return target ? `Reading ${target}...` : "Reading...";
    if (tool === "list_files") return target ? `Listing ${target}...` : "Listing files...";
    return "Exploring...";
  }
  if (family === "edit") return target ? `Editing ${target}...` : "Editing...";
  if (family === "terminal") return target ? `Running ${target}...` : "Running command...";
  if (family === "git") return "Checking git...";
  if (family === "web") return tool === "web_search" ? (target ? `Searching ${target}...` : "Searching the web...") : (target ? `Fetching ${target}...` : "Fetching...");
  if (family === "verify") return "Verifying changes...";
  if (family === "skill") return target ? `Loading ${target}...` : "Loading skill...";
  return target ? `Using ${tool} on ${target}...` : `Using ${tool}...`;
}

export function formatDiffCounts(added: number, removed: number) {
  if (added <= 0 && removed <= 0) return "";
  const parts: string[] = [];
  if (added > 0) parts.push(`+${added}`);
  if (removed > 0) parts.push(`-${removed}`);
  return parts.join("  ");
}
