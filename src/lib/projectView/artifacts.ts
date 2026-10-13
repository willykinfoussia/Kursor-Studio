import type { ArtifactRole, ArtifactSource, PreviewCapability, PreviewKind, ProjectArtifact } from "./types";

export const WEB_ARTIFACT_ID = "runtime:web";

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

const OUTPUT_DIRECTORIES = new Set([
  "docs",
  "doc",
  "output",
  "outputs",
  "deliverables",
  "slides",
  "presentations",
]);

const WEB_ASSET_DIRECTORIES = new Set(["public", "src", "assets", "static"]);

const WEB_ASSET_EXTENSIONS = new Set([
  "html", "htm", "svg", "png", "jpg", "jpeg", "gif", "webp", "ico", "avif", "bmp",
]);

const ROOT_SHELL_NAMES = new Set(["index.html", "index.htm", "favicon.ico"]);

const CONFIG_NAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "tsconfig.json",
  "jsconfig.json",
  "cargo.toml",
  "cargo.lock",
  "go.mod",
  "go.sum",
  "pyproject.toml",
  "requirements.txt",
  "dockerfile",
  "makefile",
  ".gitignore",
  ".npmrc",
  ".prettierrc",
  ".eslintrc",
  "vite.config.ts",
  "vite.config.js",
  "next.config.ts",
  "next.config.js",
  "tailwind.config.ts",
  "tailwind.config.js",
]);

const SOURCE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "css", "scss", "less", "sass",
  "vue", "svelte", "py", "rs", "go", "java", "kt", "c", "h", "cpp", "hpp",
  "cs", "php", "rb", "swift", "toml", "yaml", "yml", "xml", "gradle", "lock",
  "sh", "ps1", "bat", "cmd",
]);

const LOOSE_DELIVERABLES = new Set(["pptx", "xlsx", "xlsm", "docx", "pdf", "csv", "tsv"]);

interface PreviewDescriptor {
  kind: PreviewKind;
  mimeType: string;
  capability: PreviewCapability;
  role: ArtifactRole;
}

const PREVIEW_BY_EXTENSION: Record<string, PreviewDescriptor> = {
  md: { kind: "markdown", mimeType: "text/markdown", capability: "native", role: "deliverable" },
  markdown: { kind: "markdown", mimeType: "text/markdown", capability: "native", role: "deliverable" },
  html: { kind: "html", mimeType: "text/html", capability: "native", role: "deliverable" },
  htm: { kind: "html", mimeType: "text/html", capability: "native", role: "deliverable" },
  txt: { kind: "text", mimeType: "text/plain", capability: "native", role: "deliverable" },
  png: { kind: "image", mimeType: "image/png", capability: "native", role: "deliverable" },
  jpg: { kind: "image", mimeType: "image/jpeg", capability: "native", role: "deliverable" },
  jpeg: { kind: "image", mimeType: "image/jpeg", capability: "native", role: "deliverable" },
  gif: { kind: "image", mimeType: "image/gif", capability: "native", role: "deliverable" },
  webp: { kind: "image", mimeType: "image/webp", capability: "native", role: "deliverable" },
  svg: { kind: "image", mimeType: "image/svg+xml", capability: "native", role: "deliverable" },
  avif: { kind: "image", mimeType: "image/avif", capability: "native", role: "deliverable" },
  bmp: { kind: "image", mimeType: "image/bmp", capability: "native", role: "deliverable" },
  ico: { kind: "image", mimeType: "image/x-icon", capability: "native", role: "deliverable" },
  pdf: { kind: "pdf", mimeType: "application/pdf", capability: "native", role: "deliverable" },
  xlsx: { kind: "spreadsheet", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", capability: "native", role: "deliverable" },
  xlsm: { kind: "spreadsheet", mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12", capability: "native", role: "deliverable" },
  csv: { kind: "spreadsheet", mimeType: "text/csv", capability: "native", role: "deliverable" },
  tsv: { kind: "spreadsheet", mimeType: "text/tab-separated-values", capability: "native", role: "deliverable" },
  docx: { kind: "document", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", capability: "native", role: "deliverable" },
  pptx: { kind: "presentation", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", capability: "native", role: "deliverable" },
  ppt: { kind: "presentation", mimeType: "application/vnd.ms-powerpoint", capability: "external", role: "deliverable" },
  xls: { kind: "spreadsheet", mimeType: "application/vnd.ms-excel", capability: "external", role: "deliverable" },
  doc: { kind: "document", mimeType: "application/msword", capability: "external", role: "deliverable" },
};

export interface ArtifactFile {
  relativePath: string;
  modifiedAt?: number;
}

export function buildArtifacts(input: {
  projectId: string;
  files: ArtifactFile[];
  agentPaths: string[];
  now?: number;
}): ProjectArtifact[] {
  const now = input.now ?? Date.now();
  const agentOrder = input.agentPaths.map(normalizePath).filter(Boolean);
  const agentSet = new Set(agentOrder);
  const byId = new Map<string, ProjectArtifact>();

  for (const file of input.files) {
    const path = normalizePath(file.relativePath);
    if (!path || isExcludedPath(path)) continue;
    const source: ArtifactSource = agentSet.has(path) ? "agent" : "scan";
    const descriptor = describePath(path, source);
    if (!descriptor) continue;
    byId.set(path, {
      artifactId: path,
      projectId: input.projectId,
      path,
      name: fileName(path),
      kind: descriptor.kind,
      role: descriptor.role,
      mimeType: descriptor.mimeType,
      createdAt: file.modifiedAt || now,
      updatedAt: file.modifiedAt || now,
      source,
      previewCapability: descriptor.capability,
      status: "ready",
    });
  }

  const ordered: ProjectArtifact[] = [];
  for (const path of agentOrder) {
    const artifact = byId.get(path);
    if (!artifact) continue;
    ordered.push(artifact);
    byId.delete(path);
  }
  const rest = [...byId.values()].sort((left, right) => right.updatedAt - left.updatedAt || left.path.localeCompare(right.path));
  return [...ordered, ...rest];
}

export function isWebAppAsset(path: string): boolean {
  const parts = normalizePath(path).split("/").filter(Boolean);
  const name = (parts[parts.length - 1] ?? "").toLowerCase();
  if (parts.length === 1 && ROOT_SHELL_NAMES.has(name)) return true;
  if (!WEB_ASSET_EXTENSIONS.has(extensionOf(name))) return false;
  return parts.slice(0, -1).some((part) => WEB_ASSET_DIRECTORIES.has(part.toLowerCase()));
}

export function withRuntimeArtifact(
  artifacts: ProjectArtifact[],
  launchCommand: string | null,
  projectId: string,
): ProjectArtifact[] {
  const files = artifacts.filter((artifact) => {
    if (artifact.kind === "web-app") return false;
    return !(launchCommand && isWebAppAsset(artifact.path));
  });
  if (!launchCommand) return files;
  return [{
    artifactId: WEB_ARTIFACT_ID,
    projectId,
    path: "",
    name: "Application",
    kind: "web-app",
    role: "deliverable",
    mimeType: "text/html",
    createdAt: 0,
    updatedAt: 0,
    source: "scan",
    previewCapability: "native",
    status: "ready",
  }, ...files];
}

export function artifactCursor(artifacts: { artifactId: string }[], activeId: string | null) {
  const index = artifacts.findIndex((artifact) => artifact.artifactId === activeId);
  return {
    index,
    count: artifacts.length,
    canPrev: index > 0,
    canNext: index >= 0 && index < artifacts.length - 1,
  };
}

export function describePath(path: string, source: ArtifactSource): PreviewDescriptor | null {
  const name = fileName(path).toLowerCase();
  if (CONFIG_NAMES.has(name)) return null;
  const extension = extensionOf(path);
  if (SOURCE_EXTENSIONS.has(extension)) return null;
  const preview = PREVIEW_BY_EXTENSION[extension];
  if (preview) {
    if (source === "agent" || LOOSE_DELIVERABLES.has(extension) || isRootOrOutput(path)) return preview;
    return null;
  }
  if (source !== "agent" || !extension) return null;
  return {
    kind: "unsupported",
    mimeType: "application/octet-stream",
    capability: "external",
    role: "generated",
  };
}

function isRootOrOutput(path: string) {
  const parts = path.split("/");
  if (parts.length <= 1) return true;
  return parts.slice(0, -1).some((part) => OUTPUT_DIRECTORIES.has(part.toLowerCase()));
}

function isExcludedPath(path: string) {
  return normalizePath(path).split("/").some((part) => EXCLUDED_DIRECTORIES.has(part));
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function fileName(path: string) {
  return path.split("/").pop() || path;
}

function extensionOf(path: string) {
  const name = fileName(path);
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index + 1).toLowerCase();
}
