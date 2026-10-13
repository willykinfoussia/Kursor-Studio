import type { ProjectCategory } from "./types";

const WEB_DEPENDENCIES = new Set([
  "react",
  "react-dom",
  "vue",
  "svelte",
  "next",
  "vite",
  "astro",
  "nuxt",
  "@angular/core",
  "remix",
  "@remix-run/react",
]);

const WEB_SCRIPT = /vite|next(?:\s+dev)?|astro|nuxt|webpack-dev-server|ng\s+serve|expo\s+start|react-scripts|parcel/i;

export interface ProjectSignals {
  paths: string[];
  scripts?: Record<string, string>;
  dependencyNames?: string[];
}

export interface ProjectDetection {
  category: ProjectCategory;
  launchCommand: string | null;
}

export function detectProject(signals: ProjectSignals): ProjectDetection {
  const paths = signals.paths.map(normalizePath);
  const names = new Set(paths.filter((path) => !path.includes("/")));
  const launchCommand = resolveLaunchCommand(signals, names);
  const families = deliverableFamilies(paths);

  if (launchCommand) {
    return { category: "software", launchCommand };
  }
  if (families.size > 1) return { category: "multi", launchCommand: null };
  if (families.has("spreadsheet")) return { category: "spreadsheet", launchCommand: null };
  if (families.has("presentation")) return { category: "presentation", launchCommand: null };
  if (families.has("document")) return { category: "document", launchCommand: null };
  return { category: "unknown", launchCommand: null };
}

export function resolveLaunchCommand(signals: ProjectSignals, rootNames?: Set<string>): string | null {
  if (!isWebApplication(signals)) return null;
  const scripts = signals.scripts ?? {};
  const script = typeof scripts.dev === "string" ? "dev" : typeof scripts.start === "string" ? "start" : null;
  if (!script) return null;
  const names = rootNames ?? new Set(signals.paths.map(normalizePath).filter((path) => !path.includes("/")));
  const manager = packageManager(names);
  const base = manager === "npm" ? `npm run ${script}` : `${manager} ${script}`;
  const hostFlag = bindFlag(scripts[script] ?? "");
  if (!hostFlag) return base;
  return manager === "npm" ? `${base} -- ${hostFlag}` : `${base} ${hostFlag}`;
}

function bindFlag(scriptBody: string): string | null {
  if (/\bnext\b/i.test(scriptBody)) return "--hostname 127.0.0.1";
  if (/\b(?:vite|astro)\b/i.test(scriptBody)) return "--host 127.0.0.1";
  return null;
}

export function isWebApplication(signals: ProjectSignals): boolean {
  const scripts = signals.scripts ?? {};
  const dev = `${scripts.dev ?? ""}\n${scripts.start ?? ""}`;
  if (WEB_SCRIPT.test(dev)) return true;
  const dependencies = signals.dependencyNames ?? [];
  if (dependencies.some((name) => WEB_DEPENDENCIES.has(name))) return Boolean(scripts.dev || scripts.start);
  const paths = signals.paths.map(normalizePath);
  return paths.includes("index.html") && Boolean(scripts.dev || scripts.start);
}

function deliverableFamilies(paths: string[]): Set<"document" | "spreadsheet" | "presentation"> {
  const families = new Set<"document" | "spreadsheet" | "presentation">();
  for (const path of paths) {
    if (isExcludedPath(path)) continue;
    const extension = extensionOf(path);
    if (["md", "markdown", "html", "htm", "pdf", "docx", "txt", "png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) {
      families.add("document");
    } else if (["xlsx", "xlsm", "csv", "tsv"].includes(extension)) {
      families.add("spreadsheet");
    } else if (extension === "pptx") {
      families.add("presentation");
    }
  }
  return families;
}

function packageManager(rootNames: Set<string>): "pnpm" | "yarn" | "bun" | "npm" {
  if (rootNames.has("pnpm-lock.yaml")) return "pnpm";
  if (rootNames.has("yarn.lock")) return "yarn";
  if (rootNames.has("bun.lock") || rootNames.has("bun.lockb")) return "bun";
  return "npm";
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function extensionOf(path: string) {
  const name = path.split("/").pop() ?? "";
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index + 1).toLowerCase();
}

function isExcludedPath(path: string) {
  return path.split("/").some((part) => EXCLUDED_DIRECTORIES.has(part));
}

const EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "target",
  ".git",
  ".kursor",
  ".vscode",
  ".idea",
  "coverage",
]);
