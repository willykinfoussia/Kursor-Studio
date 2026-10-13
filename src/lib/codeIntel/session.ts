import {
  CODEGRAPH_ID,
  CODEGRAPH_INSTALL,
  GRAPHIFY_ID,
  GRAPHIFY_INSTALL,
  INDEX_TIMEOUT_MS,
  INSTALLING_DETAIL,
  codegraphServer,
  commandLine,
  graphifyServer,
} from "./commands";
import type { CodeIntelBinary, CodeIntelHost } from "./host";
import { createProductionCodeIntelHost } from "./host";
import {
  CODEGRAPH_DIR,
  GITIGNORE_PATH,
  GRAPHIFY_DIR,
  GRAPHIFY_HTML,
  GRAPHIFY_NEEDS_UPDATE,
  isCodeIntelPath,
  withCodeIntelGitignore,
} from "./paths";

export type CodeIntelEngineStatus = "idle" | "missing" | "starting" | "ready" | "error";

const EMPTY_GRAPH_DETAIL = "No source files yet. The graph builds when code is added.";

export interface CodeIntelEngine {
  status: CodeIntelEngineStatus;
  detail: string;
}

export interface CodeIntelSnapshot {
  projectId: string | null;
  codegraph: CodeIntelEngine;
  graphify: CodeIntelEngine;
  html: string | null;
  htmlError: string | null;
  needsDocUpdate: boolean;
  updatingDocs: boolean;
}

const IDLE_ENGINE: CodeIntelEngine = { status: "idle", detail: "" };

function emptySnapshot(): CodeIntelSnapshot {
  return {
    projectId: null,
    codegraph: IDLE_ENGINE,
    graphify: IDLE_ENGINE,
    html: null,
    htmlError: null,
    needsDocUpdate: false,
    updatingDocs: false,
  };
}

function failureText(stderr: string, stdout: string, fallback: string): string {
  const text = (stderr || stdout).trim();
  return text || fallback;
}

export class CodeIntelSession {
  private generation = 0;
  private tail: Promise<void> = Promise.resolve();
  private watchJob: string | null = null;
  private rootPath = "";
  private graphifyCommand = "";
  private noteTimer: ReturnType<typeof setTimeout> | undefined;
  private snapshot: CodeIntelSnapshot = emptySnapshot();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly host: CodeIntelHost) {}

  getSnapshot = (): CodeIntelSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  open(projectId: string, rootPath: string): Promise<void> {
    const run = this.tail.then(() => this.openExclusive(projectId, rootPath));
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  close(): Promise<void> {
    const run = this.tail.then(() => this.shutdown());
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  notePath(filePath: string): void {
    if (!this.snapshot.projectId || !isCodeIntelPath(filePath)) return;
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => {
      void this.onGraphifyFilesChanged();
    }, 400);
  }

  async updateDocuments(): Promise<void> {
    if (!this.graphifyCommand || !this.rootPath || this.snapshot.graphify.status !== "ready") return;
    const generation = this.generation;
    this.patch({ updatingDocs: true });
    const result = await this.host.run(commandLine(this.graphifyCommand, ["extract", "."]), this.rootPath, INDEX_TIMEOUT_MS);
    if (generation !== this.generation) return;
    this.patch({
      updatingDocs: false,
      graphify: result.exitCode === 0
        ? { status: "ready", detail: "" }
        : { status: "error", detail: failureText(result.stderr, result.stdout, "Document update failed.") },
    });
    await this.loadView();
  }

  async search(query: string): Promise<string> {
    const trimmed = query.trim();
    if (!trimmed) return "";
    if (this.snapshot.codegraph.status !== "ready") return "CodeGraph is not ready.";
    const listed = await this.host.callTool(CODEGRAPH_ID, "codegraph_search", { query: trimmed, limit: 12 });
    const explored = await this.host.callTool(CODEGRAPH_ID, "codegraph_explore", { query: trimmed });
    return [`Search\n${listed.text}`, `Explore\n${explored.text}`].join("\n\n");
  }

  private async openExclusive(projectId: string, rootPath: string): Promise<void> {
    await this.shutdown();
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    this.rootPath = rootPath;
    this.graphifyCommand = "";
    this.patch({
      projectId,
      codegraph: { status: "starting", detail: INSTALLING_DETAIL },
      graphify: { status: "starting", detail: INSTALLING_DETAIL },
      html: null,
      htmlError: null,
      needsDocUpdate: false,
      updatingDocs: false,
    });
    try {
      await this.ensureGitignore();
      if (!current()) return;
      const [codegraph, graphify] = await Promise.all([
        this.host.which("codegraph"),
        this.host.which("graphify"),
      ]);
      if (!current()) return;
      this.patch({
        codegraph: { status: "starting", detail: "" },
        graphify: { status: "starting", detail: "" },
      });
      await Promise.all([
        this.bootCodegraph(codegraph, projectId, rootPath, current),
        this.bootGraphify(graphify, projectId, rootPath, current),
      ]);
      if (!current()) return;
      await this.host.sync(projectId);
      await this.loadView();
    } catch (error) {
      if (!current()) return;
      const detail = errorText(error);
      this.patch({
        codegraph: { status: "error", detail },
        graphify: { status: "error", detail },
      });
    }
  }

  private async bootCodegraph(
    binary: CodeIntelBinary,
    projectId: string,
    rootPath: string,
    current: () => boolean,
  ): Promise<void> {
    if (!binary.found || !binary.path) {
      this.patch({
        codegraph: {
          status: binary.error ? "error" : "missing",
          detail: binary.error ? `${binary.error}\n${CODEGRAPH_INSTALL}` : CODEGRAPH_INSTALL,
        },
      });
      return;
    }
    try {
      if (!await hasCodegraphIndex(this.host)) {
        const init = await this.host.run(commandLine(binary.path, ["init"]), rootPath, INDEX_TIMEOUT_MS);
        if (!current()) return;
        if (init.exitCode !== 0) {
          this.patch({
            codegraph: { status: "error", detail: failureText(init.stderr, init.stdout, "codegraph init failed.") },
          });
          return;
        }
      }
      if (!current()) return;
      await this.host.upsert(codegraphServer(binary.path, projectId));
      await this.host.restart(CODEGRAPH_ID);
      if (!current()) return;
      this.patch({ codegraph: { status: "ready", detail: "" } });
    } catch (error) {
      if (!current()) return;
      this.patch({ codegraph: { status: "error", detail: errorText(error) } });
    }
  }

  private async bootGraphify(
    binary: CodeIntelBinary,
    projectId: string,
    rootPath: string,
    current: () => boolean,
  ): Promise<void> {
    if (!binary.found || !binary.path) {
      this.patch({
        graphify: {
          status: binary.error ? "error" : "missing",
          detail: binary.error ? `${binary.error}\n${GRAPHIFY_INSTALL}` : GRAPHIFY_INSTALL,
        },
      });
      return;
    }
    try {
      let waitingForSource = false;
      if (!await hasGraphifyIndex(this.host)) {
        const extract = await this.host.run(
          commandLine(binary.path, ["extract", ".", "--code-only"]),
          rootPath,
          INDEX_TIMEOUT_MS,
        );
        if (!current()) return;
        if (extract.exitCode !== 0) {
          if (!isEmptyCorpus(extract.stdout, extract.stderr)) {
            this.patch({
              graphify: { status: "error", detail: failureText(extract.stderr, extract.stdout, "graphify extract failed.") },
            });
            return;
          }
          waitingForSource = true;
        }
      }
      if (!current()) return;
      if (!waitingForSource) {
        await this.host.upsert(graphifyServer(binary.path, projectId));
        await this.host.restart(GRAPHIFY_ID);
      }
      if (!await this.startGraphifyWatch(binary.path, rootPath, current)) return;
      this.patch({
        graphify: waitingForSource
          ? { status: "idle", detail: EMPTY_GRAPH_DETAIL }
          : { status: "ready", detail: "" },
      });
    } catch (error) {
      if (!current()) return;
      this.patch({ graphify: { status: "error", detail: errorText(error) } });
    }
  }

  private async ensureGitignore(): Promise<void> {
    let current: string;
    try {
      current = await this.host.readText(GITIGNORE_PATH);
    } catch {
      return;
    }
    const next = withCodeIntelGitignore(current);
    if (next !== current) await this.host.writeText(GITIGNORE_PATH, next);
  }

  private async startGraphifyWatch(binaryPath: string, rootPath: string, current: () => boolean): Promise<boolean> {
    const watch = await this.host.start(commandLine(binaryPath, ["watch", "."]), rootPath);
    if (!current()) {
      await this.host.kill(watch.jobId);
      return false;
    }
    this.watchJob = watch.jobId;
    this.graphifyCommand = binaryPath;
    return true;
  }

  private async onGraphifyFilesChanged(): Promise<void> {
    await this.loadView();
    if (this.snapshot.graphify.status !== "idle" || !this.graphifyCommand || !this.snapshot.projectId) return;
    if (!await hasGraphifyIndex(this.host)) return;
    const generation = this.generation;
    const projectId = this.snapshot.projectId;
    try {
      await this.host.upsert(graphifyServer(this.graphifyCommand, projectId));
      await this.host.restart(GRAPHIFY_ID);
      if (generation !== this.generation) return;
      await this.host.sync(projectId);
      this.patch({ graphify: { status: "ready", detail: "" } });
    } catch (error) {
      if (generation !== this.generation) return;
      this.patch({ graphify: { status: "error", detail: errorText(error) } });
    }
  }

  private async loadView(): Promise<void> {
    const generation = this.generation;
    const needsDocUpdate = await this.host.exists(GRAPHIFY_NEEDS_UPDATE);
    let html: string | null = null;
    let htmlError: string | null = null;
    if (await this.host.exists(GRAPHIFY_HTML)) {
      try {
        html = await this.host.readText(GRAPHIFY_HTML);
      } catch (error) {
        htmlError = errorText(error);
      }
    }
    if (generation !== this.generation) return;
    this.patch({ needsDocUpdate, html, htmlError });
  }

  private async shutdown(): Promise<void> {
    this.generation += 1;
    clearTimeout(this.noteTimer);
    const job = this.watchJob;
    this.watchJob = null;
    this.graphifyCommand = "";
    this.rootPath = "";
    if (job) await this.host.kill(job).catch(() => undefined);
    await Promise.all([
      this.host.stop(CODEGRAPH_ID).catch(() => undefined),
      this.host.stop(GRAPHIFY_ID).catch(() => undefined),
    ]);
  }

  private patch(partial: Partial<CodeIntelSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const listener of this.listeners) listener();
  }
}

async function hasCodegraphIndex(host: CodeIntelHost): Promise<boolean> {
  const entries = await host.list(CODEGRAPH_DIR);
  return entries.some((entry) => entry.kind === "file");
}

async function hasGraphifyIndex(host: CodeIntelHost): Promise<boolean> {
  const entries = await host.list(GRAPHIFY_DIR);
  return entries.some((entry) => entry.kind === "file" && entry.name === "graph.json");
}

function isEmptyCorpus(stdout: string, stderr: string): boolean {
  const text = `${stdout}\n${stderr}`.toLowerCase();
  return text.includes("graph is empty") || text.includes("extraction produced no nodes");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Code intelligence failed.";
}

export const codeIntelSession = new CodeIntelSession(createProductionCodeIntelHost());

export function startCodeIntel(projectId: string, rootPath: string): Promise<void> {
  return codeIntelSession.open(projectId, rootPath);
}

export function noteCodeIntelPath(filePath: string): void {
  codeIntelSession.notePath(filePath);
}
