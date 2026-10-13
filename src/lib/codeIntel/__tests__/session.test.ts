import { describe, expect, it, vi } from "vitest";
import { EXPLORE_AGENT } from "../../agent/agents/builtin";
import { toolGuidance } from "../../agent/context/identity";
import { shouldIndexPath } from "../../graph/scanner/FileScanner";
import { CODE_INTEL_GUIDANCE, codegraphServer, commandLine, graphifyServer } from "../commands";
import type { CodeIntelHost } from "../host";
import { isCodeIntelPath, withCodeIntelGitignore } from "../paths";
import { CodeIntelSession } from "../session";

interface MemoryHost extends CodeIntelHost {
  calls: string[];
  files: Set<string>;
  texts: Record<string, string>;
}

function memoryHost(options?: {
  codegraph?: string | null;
  graphify?: string | null;
  files?: string[];
  texts?: Record<string, string>;
  failInit?: boolean;
  failEmpty?: boolean;
}): MemoryHost {
  const files = new Set(options?.files ?? []);
  const texts = { ...(options?.texts ?? {}) };
  const calls: string[] = [];
  const host: MemoryHost = {
    calls,
    files,
    texts,
    async which(name) {
      const path = name === "codegraph" ? options?.codegraph : options?.graphify;
      if (path === undefined) return { found: false };
      if (path === null) return { found: false };
      return { found: true, path };
    },
    async exists(relativePath) {
      return files.has(relativePath);
    },
    async list(relativePath) {
      const prefix = relativePath ? `${relativePath}/` : "";
      const names = new Map<string, "file" | "directory">();
      for (const file of files) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        if (!rest) continue;
        const [name, ...more] = rest.split("/");
        if (!name) continue;
        const kind = more.length > 0 ? "directory" : "file";
        if (names.get(name) !== "directory") names.set(name, kind);
      }
      return [...names].map(([name, kind]) => ({ name, kind }));
    },
    async readText(relativePath) {
      if (!(relativePath in texts)) throw new Error(`missing ${relativePath}`);
      return texts[relativePath];
    },
    async writeText(relativePath, content) {
      texts[relativePath] = content;
      calls.push(`write:${relativePath}`);
    },
    async run(command, cwd, timeoutMs) {
      calls.push(`run:${command}@${cwd}@${timeoutMs}`);
      if (options?.failInit && command.includes(" init")) {
        return { exitCode: 1, stdout: "", stderr: "init failed" };
      }
      if (options?.failEmpty && command.includes("--code-only")) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "[graphify extract] graph is empty — extraction produced no nodes.",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    async start(command) {
      calls.push(`start:${command}`);
      return { jobId: "watch-1" };
    },
    async kill(jobId) {
      calls.push(`kill:${jobId}`);
    },
    async upsert(config) {
      calls.push(`upsert:${config.id}`);
    },
    async restart(id) {
      calls.push(`restart:${id}`);
    },
    async stop(id) {
      calls.push(`stop:${id}`);
    },
    async callTool(_id, tool) {
      calls.push(`tool:${tool}`);
      return { success: true, text: `${tool} ok` };
    },
    async sync(projectId) {
      calls.push(`sync:${projectId}`);
    },
  };
  return host;
}

describe("code intelligence paths", () => {
  it("ignores generated indexes and appends gitignore lines once", () => {
    expect(isCodeIntelPath(".codegraph/db")).toBe(true);
    expect(isCodeIntelPath("graphify-out/graph.json")).toBe(true);
    expect(isCodeIntelPath("src/App.tsx")).toBe(false);
    expect(shouldIndexPath("graphify-out/graph.json")).toBe(false);
    expect(shouldIndexPath(".codegraph/index.ts")).toBe(false);
    expect(shouldIndexPath("src/App.tsx")).toBe(true);
    const once = withCodeIntelGitignore("dist/\n");
    expect(once).toContain(".codegraph/");
    expect(once).toContain("graphify-out/");
    expect(withCodeIntelGitignore(once)).toBe(once);
  });

  it("quotes program paths that contain spaces", () => {
    expect(commandLine("C:\\Program Files\\graphify.exe", ["watch", "."])).toBe("\"C:\\Program Files\\graphify.exe\" watch .");
  });
});

describe("CodeIntelSession", () => {
  it("reports missing CLIs and does not register servers", async () => {
    const host = memoryHost();
    const session = new CodeIntelSession(host);
    await session.open("p1", "D:\\repo");
    expect(session.getSnapshot().codegraph.status).toBe("missing");
    expect(session.getSnapshot().graphify.status).toBe("missing");
    expect(session.getSnapshot().codegraph.detail).toMatch(/npm install -g @colbymchenry\/codegraph/);
    expect(host.calls.some((call) => call.startsWith("upsert:"))).toBe(false);
  });

  it("inits indexes, starts both servers, and watches graphify", async () => {
    const host = memoryHost({
      codegraph: "C:\\npm\\codegraph.cmd",
      graphify: "C:\\uv\\graphify.exe",
      texts: { ".gitignore": "dist/\n" },
    });
    const session = new CodeIntelSession(host);
    await session.open("p1", "D:\\repo");
    expect(host.calls.some((call) => call.includes("codegraph.cmd init"))).toBe(true);
    expect(host.calls.some((call) => call.includes("--code-only"))).toBe(true);
    expect(host.calls).toContain("upsert:codegraph");
    expect(host.calls).toContain("upsert:graphify");
    expect(host.calls).toContain("restart:codegraph");
    expect(host.calls.some((call) => call.startsWith("start:") && call.includes("watch"))).toBe(true);
    expect(host.texts[".gitignore"]).toContain(".codegraph/");
    expect(session.getSnapshot().codegraph.status).toBe("ready");
    expect(session.getSnapshot().graphify.status).toBe("ready");
    expect(codegraphServer("C:\\npm\\codegraph.cmd", "p1").env?.map((item) => item.name)).toEqual([
      "CODEGRAPH_MCP_TOOLS",
      "CODEGRAPH_TELEMETRY",
    ]);
    expect(graphifyServer("C:\\uv\\graphify.exe", "p1").args).toEqual([".", "--mcp"]);

    await session.close();
    expect(host.calls).toContain("kill:watch-1");
    expect(host.calls).toContain("stop:codegraph");
    expect(host.calls).toContain("stop:graphify");
  });

  it("skips codegraph registration when init fails", async () => {
    const host = memoryHost({
      codegraph: "codegraph",
      graphify: "graphify",
      failInit: true,
    });
    const session = new CodeIntelSession(host);
    await session.open("p1", "D:\\repo");
    expect(session.getSnapshot().codegraph.status).toBe("error");
    expect(session.getSnapshot().codegraph.detail).toBe("init failed");
    expect(host.calls).not.toContain("upsert:codegraph");
    expect(session.getSnapshot().graphify.status).toBe("ready");
  });

  it("reloads graph.html after graphify writes it", async () => {
    const host = memoryHost({
      codegraph: "codegraph",
      graphify: "graphify",
      files: [".codegraph/db", "graphify-out/graph.json", "graphify-out/graph.html", "graphify-out/needs_update"],
      texts: { "graphify-out/graph.html": "<p>one</p>" },
    });
    const session = new CodeIntelSession(host);
    await session.open("p1", "D:\\repo");
    expect(session.getSnapshot().html).toBe("<p>one</p>");
    expect(session.getSnapshot().needsDocUpdate).toBe(true);
    expect(host.calls.some((call) => call.includes("--code-only"))).toBe(false);
    host.texts["graphify-out/graph.html"] = "<p>two</p>";
    vi.useFakeTimers();
    session.notePath("graphify-out/graph.html");
    await vi.advanceTimersByTimeAsync(400);
    vi.useRealTimers();
    expect(session.getSnapshot().html).toBe("<p>two</p>");
  });

  it("extracts documents when the semantic flag is set", async () => {
    const host = memoryHost({
      codegraph: null,
      graphify: "graphify",
      files: ["graphify-out/graph.json", "graphify-out/needs_update"],
    });
    const session = new CodeIntelSession(host);
    await session.open("p1", "D:\\repo");
    expect(session.getSnapshot().needsDocUpdate).toBe(true);
    host.files.delete("graphify-out/needs_update");
    await session.updateDocuments();
    expect(host.calls.some((call) => call.includes("extract .") && !call.includes("--code-only"))).toBe(true);
    expect(session.getSnapshot().needsDocUpdate).toBe(false);
    expect(session.getSnapshot().updatingDocs).toBe(false);
  });

  it("builds codegraph when its directory is empty and skips graphify when graph.json exists", async () => {
    const host = memoryHost({
      codegraph: "codegraph",
      graphify: "graphify",
      files: [".codegraph", "graphify-out/graph.json"],
    });
    const session = new CodeIntelSession(host);
    await session.open("p1", "D:\\repo");
    expect(host.calls.some((call) => call.includes(" init"))).toBe(true);
    expect(host.calls.some((call) => call.includes("--code-only"))).toBe(false);
    expect(host.calls).toContain("upsert:codegraph");
    expect(host.calls).toContain("upsert:graphify");
  });

  it("keeps graphify idle when the project has no source files", async () => {
    const host = memoryHost({
      codegraph: "codegraph",
      graphify: "graphify",
      files: [".codegraph/db"],
      failEmpty: true,
    });
    const session = new CodeIntelSession(host);
    await session.open("p1", "D:\\repo");
    expect(session.getSnapshot().graphify.status).toBe("idle");
    expect(session.getSnapshot().graphify.detail).toBe("No source files yet. The graph builds when code is added.");
    expect(host.calls.some((call) => call.startsWith("start:") && call.includes("watch"))).toBe(true);
    expect(host.calls).not.toContain("upsert:graphify");
  });

  it("searches codegraph when the index is ready", async () => {
    const host = memoryHost({
      codegraph: "codegraph",
      graphify: null,
      files: [".codegraph/db"],
    });
    const session = new CodeIntelSession(host);
    await session.open("p1", "D:\\repo");
    const text = await session.search("AuthService");
    expect(text).toContain("codegraph_search ok");
    expect(text).toContain("codegraph_explore ok");
    expect(await session.search("  ")).toBe("");
  });
});

describe("agent guidance", () => {
  it("tells the coding agent and the explore subagent to query both graphs", () => {
    expect(toolGuidance(true, true)).toContain(CODE_INTEL_GUIDANCE);
    expect(EXPLORE_AGENT.instructions).toContain("mcp__codegraph__codegraph_explore");
    expect(EXPLORE_AGENT.instructions).toContain("mcp__graphify__query_graph");
  });
});
