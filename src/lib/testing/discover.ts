import type { ContextFileStore } from "../agent/context/types";
import type { ApplicationType, DetectedRunner, ProjectDiscovery, RunnerId, TestLevel } from "./domain";

const UNIT_DEPS: Array<{ id: RunnerId; names: string[] }> = [
  { id: "vitest", names: ["vitest"] },
  { id: "jest", names: ["jest"] },
  { id: "pytest", names: ["pytest"] },
];

const E2E_DEPS: Array<{ id: RunnerId; names: string[] }> = [
  { id: "playwright", names: ["@playwright/test", "playwright"] },
  { id: "cypress", names: ["cypress"] },
  { id: "appium", names: ["appium", "webdriverio"] },
];

export function memoryFileStore(files: Record<string, string>): ContextFileStore {
  return {
    async readFile(path: string) {
      const key = normalize(path);
      if (!(key in files)) throw new Error(`missing ${key}`);
      return files[key] ?? "";
    },
    async listDirectory(path: string) {
      const dir = path === "" || path === "." ? "" : normalize(path);
      const seen = new Set<string>();
      const entries: { name: string; path: string; kind: "file" | "directory" }[] = [];
      for (const key of Object.keys(files)) {
        const rel = dir ? (key.startsWith(`${dir}/`) ? key.slice(dir.length + 1) : null) : key;
        if (!rel) continue;
        const [name, ...rest] = rel.split("/");
        if (!name || seen.has(name)) continue;
        seen.add(name);
        entries.push({
          name,
          path: dir ? `${dir}/${name}` : name,
          kind: rest.length > 0 ? "directory" : "file",
        });
      }
      return entries;
    },
  };
}

export async function discoverProject(files?: ContextFileStore): Promise<ProjectDiscovery> {
  const names = files ? await rootNames(files) : new Set<string>();
  const pkg = files ? parsePackage(await readIfPresent(files, "package.json")) : null;
  const scripts = scriptMap(pkg);
  const deps = depNames(pkg);
  const markers = [...names];
  const packageManager = detectPackageManager(names);
  const ecosystem = detectEcosystem(names);
  const language = languageFor(ecosystem, names);
  const frontend = hasAny(deps, ["react", "vue", "svelte", "@angular/core", "next", "nuxt"]) || names.has("index.html");
  const mobileApplication = hasAny(deps, ["react-native", "expo", "@capacitor/core", "appium"]);
  const desktopApplication = hasAny(deps, ["@tauri-apps/api", "electron"]) || names.has("src-tauri");
  const browserApplication = (frontend || desktopApplication || names.has("index.html")) && !mobileApplication;
  const backend = hasAny(deps, ["express", "fastify", "koa", "@nestjs/core", "hono"]);
  const database = hasAny(deps, ["prisma", "pg", "postgres", "mysql2", "better-sqlite3", "mongoose", "typeorm", "drizzle-orm", "@libsql/client"]);
  const workers = hasAny(deps, ["bullmq", "bee-queue", "graphile-worker"]);
  const queues = workers || hasAny(deps, ["amqplib", "@aws-sdk/client-sqs"]);
  const cli = Boolean(pkg && pkg.bin) && !browserApplication && !mobileApplication;
  const api = backend || names.has("openapi.yaml") || names.has("openapi.json");
  const docker = names.has("Dockerfile") || names.has("docker-compose.yml") || names.has("compose.yml");
  const ci = names.has(".github") || names.has(".gitlab-ci.yml") || names.has("azure-pipelines.yml");
  const runners = detectRunners({ names, deps, scripts, ecosystem, packageManager });
  return {
    language,
    ecosystem,
    packageManager,
    frontend,
    backend,
    database,
    api,
    cli,
    workers,
    queues,
    browserApplication,
    mobileApplication,
    desktopApplication,
    docker,
    ci,
    scripts,
    runners,
    markers,
  };
}

export function applicationType(discovery: ProjectDiscovery): ApplicationType {
  if (discovery.mobileApplication) return "mobile";
  if (discovery.browserApplication) return "web";
  if (discovery.desktopApplication) return "desktop";
  if (discovery.cli) return "cli";
  if (discovery.backend || discovery.api) return "backend";
  if (discovery.ecosystem !== "unknown") return "library";
  return "unknown";
}

export async function loadUserCases(files: ContextFileStore | undefined, projectId: string) {
  const raw = files ? await readIfPresent(files, ".kursor/user-cases.json") : "";
  const parsed = raw ? safeParse(raw) : null;
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => normalizeUserCase(item, projectId));
}

function detectRunners(input: {
  names: Set<string>;
  deps: Set<string>;
  scripts: Record<string, string>;
  ecosystem: string;
  packageManager: ProjectDiscovery["packageManager"];
}): DetectedRunner[] {
  const runners: DetectedRunner[] = [];
  const pm = input.packageManager === "none" ? "pnpm" : input.packageManager;
  for (const spec of UNIT_DEPS) {
    const configs = configHits(input.names, spec.id);
    if (input.deps.has(spec.names[0]!) || configs.length > 0 || scriptMentions(input.scripts, spec.id)) {
      runners.push({
        id: spec.id,
        level: "unit",
        present: true,
        command: unitCommand(spec.id, pm, input.scripts),
        configFiles: configs,
      });
    }
  }
  if (input.ecosystem === "python" && !runners.some((runner) => runner.id === "pytest")) {
    const configs = configHits(input.names, "pytest");
    if (configs.length > 0 || input.names.has("requirements.txt") || input.names.has("pyproject.toml")) {
      runners.push({
        id: "pytest",
        level: "unit",
        present: configs.length > 0 || input.deps.has("pytest"),
        command: "pytest -q",
        configFiles: configs,
      });
    }
  }
  if (input.names.has("Cargo.toml")) {
    runners.push({ id: "cargo", level: "unit", present: true, command: "cargo test", configFiles: ["Cargo.toml"] });
  }
  if (input.names.has("go.mod")) {
    runners.push({ id: "go", level: "unit", present: true, command: "go test ./...", configFiles: ["go.mod"] });
  }
  if (input.names.has("pom.xml") || input.names.has("build.gradle") || input.names.has("build.gradle.kts")) {
    runners.push({
      id: "junit",
      level: "unit",
      present: true,
      command: input.names.has("pom.xml") ? "mvn -q test" : "gradle test",
      configFiles: [...input.names].filter((name) => name === "pom.xml" || name.startsWith("build.gradle")),
    });
  }
  if ([...input.names].some((name) => name.endsWith(".csproj") || name.endsWith(".sln"))) {
    runners.push({ id: "dotnet", level: "unit", present: true, command: "dotnet test", configFiles: ["*.csproj"] });
  }
  for (const spec of E2E_DEPS) {
    const configs = configHits(input.names, spec.id);
    const present = spec.names.some((name) => input.deps.has(name)) || configs.length > 0;
    if (!present) continue;
    runners.push({
      id: spec.id,
      level: "e2e",
      present: true,
      command: e2eCommand(spec.id, pm, input.scripts),
      configFiles: configs,
    });
  }
  return runners;
}

function unitCommand(id: RunnerId, pm: string, scripts: Record<string, string>): string {
  if (id === "vitest") return `${exec(pm, "vitest")} run --reporter=json`;
  if (id === "jest") return `${exec(pm, "jest")} --json`;
  if (id === "pytest") return scripts.test?.includes("pytest") ? scripts.test : "pytest -q";
  return scripts.test ?? "";
}

function e2eCommand(id: RunnerId, pm: string, scripts: Record<string, string>): string {
  if (id === "playwright") {
    if (scripts["test:e2e"]) return scripts["test:e2e"];
    return `${exec(pm, "playwright")} test --reporter=json`;
  }
  if (id === "cypress") return scripts["test:e2e"] ?? `${exec(pm, "cypress")} run`;
  if (id === "appium") return scripts["test:e2e"] ?? scripts.appium ?? "";
  return "";
}

export function exec(pm: string, bin: string): string {
  if (pm === "npm") return `npx ${bin}`;
  if (pm === "yarn") return `yarn ${bin}`;
  return `pnpm exec ${bin}`;
}

export function addDev(pm: string, pkg: string): string {
  if (pm === "npm") return `npm install -D ${pkg}`;
  if (pm === "yarn") return `yarn add -D ${pkg}`;
  return `pnpm add -D ${pkg}`;
}

function configHits(names: Set<string>, id: RunnerId): string[] {
  const patterns: Record<string, string[]> = {
    vitest: ["vitest.config.ts", "vitest.config.js", "vitest.config.mjs"],
    jest: ["jest.config.ts", "jest.config.js", "jest.config.json"],
    pytest: ["pytest.ini", "conftest.py"],
    playwright: ["playwright.config.ts", "playwright.config.js", "playwright.config.mjs"],
    cypress: ["cypress.config.ts", "cypress.config.js"],
    appium: ["appium.config.ts", "wdio.conf.ts", "wdio.conf.js"],
  };
  return (patterns[id] ?? []).filter((name) => names.has(name));
}

function scriptMentions(scripts: Record<string, string>, id: string): boolean {
  return Object.values(scripts).some((script) => script.toLowerCase().includes(id));
}

function detectPackageManager(names: Set<string>): ProjectDiscovery["packageManager"] {
  if (names.has("pnpm-lock.yaml")) return "pnpm";
  if (names.has("package-lock.json")) return "npm";
  if (names.has("yarn.lock")) return "yarn";
  if (names.has("package.json")) return "pnpm";
  return "none";
}

function detectEcosystem(names: Set<string>): string {
  if (names.has("package.json")) return "node";
  if (names.has("Cargo.toml")) return "rust";
  if (names.has("go.mod")) return "go";
  if (names.has("pyproject.toml") || names.has("requirements.txt")) return "python";
  if (names.has("pom.xml") || names.has("build.gradle") || names.has("build.gradle.kts")) return "java";
  if ([...names].some((name) => name.endsWith(".csproj") || name.endsWith(".sln"))) return "dotnet";
  return "unknown";
}

function languageFor(ecosystem: string, names: Set<string>): string {
  if (names.has("tsconfig.json") || names.has("tsconfig.app.json")) return "typescript";
  if (ecosystem === "node") return "javascript";
  if (ecosystem === "rust") return "rust";
  if (ecosystem === "go") return "go";
  if (ecosystem === "python") return "python";
  if (ecosystem === "java") return "java";
  if (ecosystem === "dotnet") return "csharp";
  return "unknown";
}

function hasAny(deps: Set<string>, names: string[]): boolean {
  return names.some((name) => deps.has(name));
}

function depNames(pkg: Record<string, unknown> | null): Set<string> {
  const names = new Set<string>();
  if (!pkg) return names;
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const block = pkg[field];
    if (block && typeof block === "object" && !Array.isArray(block)) {
      for (const name of Object.keys(block)) names.add(name);
    }
  }
  return names;
}

function scriptMap(pkg: Record<string, unknown> | null): Record<string, string> {
  if (!pkg || !pkg.scripts || typeof pkg.scripts !== "object" || Array.isArray(pkg.scripts)) return {};
  const scripts: Record<string, string> = {};
  for (const [name, value] of Object.entries(pkg.scripts)) {
    if (typeof value === "string" && value.trim()) scripts[name] = value.trim();
  }
  return scripts;
}

function parsePackage(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const value = safeParse(raw);
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeUserCase(value: unknown, projectId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : "";
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : "";
  if (!id || !name) return [];
  const priority = row.priority === "critical" ? "critical" as const : "normal" as const;
  return [{
    id,
    projectId,
    name,
    description: typeof row.description === "string" ? row.description : "",
    actor: typeof row.actor === "string" && row.actor.trim() ? row.actor.trim() : "user",
    preconditions: stringList(row.preconditions),
    steps: stringList(row.steps),
    expectedResults: stringList(row.expectedResults),
    priority,
    status: "open" as const,
    linkedTests: stringList(row.linkedTests),
  }];
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
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

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function runnersFor(discovery: ProjectDiscovery, level: TestLevel): DetectedRunner[] {
  return discovery.runners.filter((runner) => runner.level === level && runner.present);
}

export function scriptPrefers(discovery: ProjectDiscovery, ids: RunnerId[]): RunnerId | null {
  const blob = Object.values(discovery.scripts).join("\n").toLowerCase();
  for (const id of ids) {
    if (blob.includes(id)) return id;
  }
  return null;
}

function normalize(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}
