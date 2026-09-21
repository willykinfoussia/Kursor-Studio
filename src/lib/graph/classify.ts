import { extensionOf, normalizeRelativePath } from "../filesystem/pathUtils";
import { fileBasename } from "./ids";
import type { FileCategory } from "./types";

const DATA_EXTENSIONS = new Set(["xlsx", "xls", "csv", "sql", "tsv"]);
const DOC_EXTENSIONS = new Set(["md", "markdown", "txt", "rst", "adoc"]);

export const ACCOUNT_VIRTUAL_PREFIX = "account/specs";
export const PROJECT_SPECS_PREFIX = ".kursor/specs/project";

export type SpecScope = "account" | "project" | "none";

export const ACCOUNT_GROUP_KINDS = [
  "stack", "information", "identity", "projects", "preference",
  "workflow", "tools", "editor", "git", "communication",
  "language", "models", "skills", "coding-style", "environment", "security",
] as const;

export const PROJECT_GROUP_KINDS = [
  "technical", "functional", "business", "ui", "constraints", "documentation",
  "database", "missions", "stack", "architecture", "api", "security",
  "infrastructure", "testing", "deployment", "domain", "integrations",
  "auth", "observability", "product", "data", "environments", "roadmap", "ci",
] as const;

export type SpecKind =
  | (typeof ACCOUNT_GROUP_KINDS)[number]
  | (typeof PROJECT_GROUP_KINDS)[number]
  | "generic";

const SPEC_KIND_SET = new Set<string>([...ACCOUNT_GROUP_KINDS, ...PROJECT_GROUP_KINDS, "generic"]);

const SPEC_KIND_LABELS: Record<string, string> = {
  stack: "Stack",
  information: "User Information",
  identity: "Identity",
  projects: "Projects",
  preference: "Preferences",
  workflow: "Workflow",
  tools: "Tools",
  editor: "Editor",
  git: "Git",
  communication: "Communication",
  language: "Language",
  models: "Models",
  skills: "Skills",
  "coding-style": "Coding Style",
  environment: "Environment",
  security: "Security",
  technical: "Technical",
  functional: "Functional",
  business: "Business",
  ui: "UI",
  constraints: "Constraints",
  documentation: "Documentation",
  database: "Database",
  missions: "Missions",
  architecture: "Architecture",
  api: "API",
  infrastructure: "Infrastructure",
  testing: "Testing",
  deployment: "Deployment",
  domain: "Domain",
  integrations: "Integrations",
  auth: "Auth",
  observability: "Observability",
  product: "Product",
  data: "Data",
  environments: "Environments",
  roadmap: "Roadmap",
  ci: "CI",
};

export function classifyFile(filePath: string): FileCategory {
  const normalized = normalizeRelativePath(filePath).toLowerCase();
  const parts = normalized.split("/").filter(Boolean);
  const name = parts.at(-1) ?? normalized;
  const extension = extensionOf(filePath) ?? "";

  if (isTestPath(parts, name) && specScope(filePath) === "none") return "tests";
  if (specScope(filePath) !== "none") return "specifications";
  if (DATA_EXTENSIONS.has(extension)) return "data";
  if (DOC_EXTENSIONS.has(extension)) return "documentation";
  return "code";
}

export function specScope(filePath: string): SpecScope {
  const normalized = normalizeRelativePath(filePath).replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  if (lower === ACCOUNT_VIRTUAL_PREFIX || lower.startsWith(`${ACCOUNT_VIRTUAL_PREFIX}/`)) return "account";
  if (lower.startsWith(".kursor/specs/") || lower.split("/")[0] === "specs") return "project";
  return "none";
}

export function isAccountSpec(filePath: string): boolean {
  return specScope(filePath) === "account";
}

export function isProjectSpec(filePath: string): boolean {
  return specScope(filePath) === "project";
}

export function isSpecFile(filePath: string): boolean {
  return specScope(filePath) !== "none";
}

export function isMarkdownSpecFile(filePath: string): boolean {
  if (!isSpecFile(filePath)) return false;
  const extension = extensionOf(filePath);
  return extension === "md" || extension === "markdown";
}

export function canonicalSpecKind(value: string): SpecKind | undefined {
  const raw = value.toLowerCase().trim();
  if (!raw) return undefined;
  if (raw === "constraint") return "constraints";
  if (raw === "preferences" || raw === "preference") return "preference";
  if (raw === "coding_style" || raw === "codingstyle" || raw === "coding-style") return "coding-style";
  if (SPEC_KIND_SET.has(raw) && raw !== "generic") return raw as SpecKind;
  return undefined;
}

export function specKindFromPath(filePath: string): SpecKind {
  const scope = specScope(filePath);
  if (scope === "none") return "generic";
  const parts = specDisplayRelative(filePath).toLowerCase().split("/").filter(Boolean);
  for (const part of parts) {
    const kind = canonicalSpecKind(part);
    if (kind) return kind;
  }
  return scope === "account" ? "preference" : "generic";
}

export function resolveSpecKind(filePath: string, metadata?: Record<string, unknown>): SpecKind | string {
  const raw = typeof metadata?.specType === "string" ? metadata.specType.toLowerCase().trim() : "";
  if (raw) {
    const kind = canonicalSpecKind(raw);
    if (kind) return kind;
    return sanitizeSpecGroupName(raw) || specKindFromPath(filePath);
  }
  return specKindFromPath(filePath);
}

export function specKindLabel(kind: string, scope?: SpecScope): string {
  const raw = kind.toLowerCase().trim();
  if (scope === "account" && raw === "stack") return "Preferred Stack";
  if (SPEC_KIND_LABELS[raw]) return SPEC_KIND_LABELS[raw];
  return kind
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || kind;
}

export function isTestFile(filePath: string): boolean {
  return classifyFile(filePath) === "tests";
}

export function isDocumentationFile(filePath: string): boolean {
  const category = classifyFile(filePath);
  return category === "documentation" || category === "specifications";
}

export function isCodeFile(filePath: string): boolean {
  return classifyFile(filePath) === "code";
}

export function isConfigFile(filePath: string): boolean {
  const extension = extensionOf(filePath) ?? "";
  const name = (filePath.split("/").pop() ?? "").toLowerCase();
  if (["json", "yaml", "yml", "toml", "ini"].includes(extension)) return true;
  return name.startsWith(".") && (name.endsWith("rc") || name.includes("config"));
}

export function testTargetBasename(filePath: string): string | undefined {
  const name = fileBasename(filePath);
  if (name.startsWith("test_")) return name.slice(5);
  if (name.endsWith("_test")) return name.slice(0, -5);
  if (name.endsWith(".test")) return name.slice(0, -5);
  if (name.endsWith(".spec")) return name.slice(0, -5);
  return undefined;
}

export function isAccountVirtualPath(filePath: string): boolean {
  return isAccountSpec(filePath);
}

export function toUserSpecsRelative(virtualPath: string): string {
  const normalized = normalizeRelativePath(virtualPath);
  const rest = normalized.slice(ACCOUNT_VIRTUAL_PREFIX.length).replace(/^\//, "");
  return rest ? `account/${rest}` : "account";
}

export function fromUserSpecsRelative(relative: string): string {
  const normalized = normalizeRelativePath(relative);
  if (normalized.startsWith("account/")) {
    return `${ACCOUNT_VIRTUAL_PREFIX}/${normalized.slice("account/".length)}`;
  }
  return `${ACCOUNT_VIRTUAL_PREFIX}/${normalized}`;
}

export function isSpecKind(value: string): value is SpecKind {
  return SPEC_KIND_SET.has(value.toLowerCase());
}

export function sanitizeSpecGroupName(name: string): string {
  return name.trim().replace(/[\\/]+/g, "-").replace(/\s+/g, "-");
}

export function specDisplayRelative(filePath: string): string {
  const normalized = normalizeRelativePath(filePath).replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  const projectPrefix = PROJECT_SPECS_PREFIX.toLowerCase();
  if (lower === ACCOUNT_VIRTUAL_PREFIX || lower.startsWith(`${ACCOUNT_VIRTUAL_PREFIX}/`)) {
    return normalized.slice(ACCOUNT_VIRTUAL_PREFIX.length).replace(/^\//, "");
  }
  if (lower === projectPrefix || lower.startsWith(`${projectPrefix}/`)) {
    return normalized.slice(PROJECT_SPECS_PREFIX.length).replace(/^\//, "");
  }
  if (lower.startsWith(".kursor/specs/")) {
    return normalized.slice(".kursor/specs/".length);
  }
  if (lower === "specs" || lower.startsWith("specs/")) {
    return normalized.slice("specs".length).replace(/^\//, "");
  }
  return normalized;
}

export function newProjectSpecPath(kind: SpecKind, fileName: string, group?: string): string {
  const folder = sanitizeSpecGroupName(group ?? (kind === "preference" || kind === "generic" ? "documentation" : kind));
  const name = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
  return `${PROJECT_SPECS_PREFIX}/${folder}/${name}`;
}

export function newAccountSpecPath(fileName: string, group?: string): string {
  const name = fileName.endsWith(".md") ? fileName : `${fileName}.md`;
  const folder = group ? sanitizeSpecGroupName(group) : "";
  return folder ? `${ACCOUNT_VIRTUAL_PREFIX}/${folder}/${name}` : `${ACCOUNT_VIRTUAL_PREFIX}/${name}`;
}

export function newSpecGroupPath(scope: "account" | "project", group: string): string {
  const folder = sanitizeSpecGroupName(group);
  return scope === "account" ? `${ACCOUNT_VIRTUAL_PREFIX}/${folder}` : `${PROJECT_SPECS_PREFIX}/${folder}`;
}

function isTestPath(parts: string[], name: string): boolean {
  if (parts.includes("tests") || parts.includes("__tests__") || parts.includes("test")) return true;
  if (name.startsWith("test_")) return true;
  if (name.endsWith("_test.py") || name.endsWith("_test.ts") || name.endsWith("_test.js")) return true;
  if (name.includes(".test.") || name.includes(".spec.")) return true;
  return false;
}
