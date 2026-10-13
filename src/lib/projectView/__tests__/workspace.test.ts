import { describe, expect, it } from "vitest";
import { buildArtifacts, artifactCursor, withRuntimeArtifact } from "../artifacts";
import { detectProject } from "../detector";
import { loadWorkspace, saveWorkspace, type KeyValueStorage } from "../persistence";
import { clampSplit, extractLocalUrl, previewFrameUrl } from "../runtime";
import { parseDelimited } from "../table";
import { initialWorkspace, reduceWorkspace, type WorkspaceSnapshot } from "../transitions";

function memoryStorage(): KeyValueStorage & { raw: string | null } {
  const box = { raw: null as string | null };
  return {
    get raw() { return box.raw; },
    set raw(value: string | null) { box.raw = value; },
    getItem: () => box.raw,
    setItem: (key, value) => {
      void key;
      box.raw = value;
    },
  };
}

function file(path: string, modifiedAt = 1) {
  return { relativePath: path, modifiedAt };
}

describe("project detection", () => {
  it("stays unknown for an empty folder", () => {
    expect(detectProject({ paths: [] })).toEqual({ category: "unknown", launchCommand: null });
  });

  it("does not launch a node library just because it has a dev script", () => {
    expect(detectProject({
      paths: ["package.json", "src/index.ts"],
      scripts: { dev: "tsc -w" },
      dependencyNames: ["typescript"],
    })).toEqual({ category: "unknown", launchCommand: null });
  });

  it("resolves a React dev server from the lockfile", () => {
    expect(detectProject({
      paths: ["package.json", "pnpm-lock.yaml", "src/App.tsx"],
      scripts: { dev: "vite" },
      dependencyNames: ["react", "vite"],
    })).toEqual({ category: "software", launchCommand: "pnpm dev --host 127.0.0.1" });
  });

  it("uses npm run when no other lockfile is present", () => {
    expect(detectProject({
      paths: ["package.json", "package-lock.json"],
      scripts: { start: "next start" },
      dependencyNames: ["next"],
    }).launchCommand).toBe("npm run start -- --hostname 127.0.0.1");
  });

  it("does not add a host flag for create react app", () => {
    expect(detectProject({
      paths: ["package.json", "package-lock.json"],
      scripts: { start: "react-scripts start" },
      dependencyNames: ["react", "react-scripts"],
    }).launchCommand).toBe("npm run start");
  });

  it("classifies a presentation, a spreadsheet, and a mixed delivery", () => {
    expect(detectProject({ paths: ["Deck.pptx"] }).category).toBe("presentation");
    expect(detectProject({ paths: ["Budget.xlsx"] }).category).toBe("spreadsheet");
    expect(detectProject({ paths: ["Notes.docx", "Budget.xlsx", "Deck.pptx"] }).category).toBe("multi");
  });
});

describe("artifact registry", () => {
  it("keeps agent deliverables in production order and skips dependencies", () => {
    const artifacts = buildArtifacts({
      projectId: "p1",
      now: 10,
      agentPaths: ["Rapport.pdf", "Analyse.xlsx", "Presentation.pptx"],
      files: [
        file("node_modules/left-pad/readme.md", 50),
        file("src/App.tsx", 40),
        file("package.json", 30),
        file("Presentation.pptx", 3),
        file("Analyse.xlsx", 2),
        file("Rapport.pdf", 1),
        file("README.md", 9),
      ],
    });
    expect(artifacts.map((artifact) => artifact.path)).toEqual([
      "Rapport.pdf",
      "Analyse.xlsx",
      "Presentation.pptx",
      "README.md",
    ]);
    expect(artifacts[0]).toMatchObject({ source: "agent", kind: "pdf", previewCapability: "native" });
  });

  it("does not treat source files as previewable deliverables", () => {
    const artifacts = buildArtifacts({
      projectId: "p1",
      agentPaths: ["src/App.tsx", "notes/result.bin"],
      files: [file("src/App.tsx"), file("src/logo.png"), file("notes/result.bin")],
    });
    expect(artifacts.map((artifact) => artifact.path)).toEqual(["notes/result.bin"]);
    expect(artifacts[0].previewCapability).toBe("external");
    expect(artifacts[0].kind).toBe("unsupported");
  });

  it("keeps the running application and drops its shell files", () => {
    const artifacts = buildArtifacts({
      projectId: "p1",
      agentPaths: ["index.html", "public/vite.svg", "src/assets/react.svg", "Rapport.pdf"],
      files: [
        file("index.html"),
        file("public/vite.svg"),
        file("src/assets/react.svg"),
        file("public/notes.md"),
        file("Rapport.pdf"),
        file("README.md"),
      ],
    });
    const visible = withRuntimeArtifact(artifacts, "pnpm dev --host 127.0.0.1", "p1");
    expect(visible.map((artifact) => artifact.name)).toEqual(["Application", "Rapport.pdf", "README.md"]);
  });

  it("still previews a static page when nothing launches", () => {
    const artifacts = buildArtifacts({
      projectId: "p1",
      agentPaths: [],
      files: [file("index.html"), file("public/vite.svg")],
    });
    expect(artifacts.map((artifact) => artifact.path)).toEqual(["index.html"]);
    expect(withRuntimeArtifact(artifacts, null, "p1").map((artifact) => artifact.path)).toEqual(["index.html"]);
  });

  it("disables navigation at the ends", () => {
    const artifacts = [{ artifactId: "a" }, { artifactId: "b" }, { artifactId: "c" }];
    expect(artifactCursor(artifacts, "a")).toMatchObject({ canPrev: false, canNext: true, index: 0, count: 3 });
    expect(artifactCursor(artifacts, "c")).toMatchObject({ canPrev: true, canNext: false });
  });
});

describe("workspace transitions", () => {
  const report = buildArtifacts({
    projectId: "p1",
    agentPaths: ["Rapport.pdf"],
    files: [file("Rapport.pdf")],
  });
  const three = buildArtifacts({
    projectId: "p1",
    agentPaths: ["Analyse.xlsx", "Presentation.pptx", "Rapport.pdf"],
    files: [file("Analyse.xlsx"), file("Presentation.pptx"), file("Rapport.pdf")],
  });

  it("keeps a new project in chat until a result exists", () => {
    const opened = reduceWorkspace(initialWorkspace(), {
      type: "hydrate",
      projectId: "p1",
      persisted: null,
      artifacts: [],
      category: "unknown",
      launchCommand: null,
    });
    expect(opened.state.surface).toBe("chat");
    expect(opened.state.phase).toBe("chat-only");
    expect(opened.notices).toEqual([]);
  });

  it("opens the shared layout on the first deliverable and does not replace it", () => {
    let state = reduceWorkspace(initialWorkspace(), {
      type: "hydrate",
      projectId: "p1",
      persisted: null,
      artifacts: [],
      category: "unknown",
      launchCommand: null,
    }).state;
    const first = reduceWorkspace(state, {
      type: "sync-artifacts",
      artifacts: report,
      category: "document",
      launchCommand: null,
    });
    expect(first.state.surface).toBe("split");
    expect(first.state.activeArtifactId).toBe("Rapport.pdf");
    expect(first.notices).toEqual([]);
    const next = reduceWorkspace(first.state, {
      type: "sync-artifacts",
      artifacts: three,
      category: "multi",
      launchCommand: null,
    });
    expect(next.state.activeArtifactId).toBe("Rapport.pdf");
    expect(next.state.surface).toBe("split");
    expect(next.notices.map((notice) => notice.artifactId)).toEqual(["Analyse.xlsx", "Presentation.pptx"]);
  });

  it("does not reopen the project view after the user hides it", () => {
    let state = hydrated(three);
    state = reduceWorkspace(state, { type: "hide" }).state;
    expect(state.surface).toBe("chat");
    expect(state.control).toBe("manual");
    const extra = buildArtifacts({
      projectId: "p1",
      agentPaths: ["Analyse.xlsx", "Presentation.pptx", "Rapport.pdf", "Notes.docx"],
      files: [file("Analyse.xlsx"), file("Presentation.pptx"), file("Rapport.pdf"), file("Notes.docx")],
    });
    const next = reduceWorkspace(state, {
      type: "sync-artifacts",
      artifacts: extra,
      category: "multi",
      launchCommand: null,
    });
    expect(next.state.surface).toBe("chat");
    expect(next.notices.map((notice) => notice.artifactId)).toEqual(["Notes.docx"]);
    const opened = reduceWorkspace(next.state, { type: "focus", artifactId: "Notes.docx" });
    expect(opened.state.surface).toBe("split");
    expect(opened.state.activeArtifactId).toBe("Notes.docx");
    expect(opened.state.control).toBe("manual");
  });

  it("pins manual navigation and steps through deliverables", () => {
    let state = hydrated(three);
    state = reduceWorkspace(state, { type: "step", direction: 1 }).state;
    expect(state.pinned).toBe(true);
    expect(state.activeArtifactId).toBe("Presentation.pptx");
    const blocked = reduceWorkspace(state, {
      type: "sync-artifacts",
      artifacts: [...three, ...buildArtifacts({ projectId: "p1", agentPaths: ["Extra.pdf"], files: [file("Extra.pdf")] })],
      category: "multi",
      launchCommand: null,
    });
    expect(blocked.state.activeArtifactId).toBe("Presentation.pptx");
    const start = reduceWorkspace(state, { type: "step", direction: -1 });
    expect(start.state.activeArtifactId).toBe("Analyse.xlsx");
    expect(reduceWorkspace(start.state, { type: "step", direction: -1 }).state.activeArtifactId).toBe("Analyse.xlsx");
  });

  it("shows a runtime failure unless the user hid the view", () => {
    const state = hydrated([]);
    const withCommand = reduceWorkspace(state, {
      type: "sync-artifacts",
      artifacts: [],
      category: "software",
      launchCommand: "pnpm dev",
    }).state;
    const failed = reduceWorkspace(withCommand, {
      type: "runtime",
      runtime: { status: "error", error: "Port 5173 is already in use.", log: "error log" },
    });
    expect(failed.state.surface).toBe("split");
    expect(failed.state.phase).toBe("runtime-error");
    expect(failed.state.runtime.error).toBe("Port 5173 is already in use.");
    const hidden = reduceWorkspace(failed.state, { type: "hide" }).state;
    const again = reduceWorkspace(hidden, {
      type: "runtime",
      runtime: { status: "error", error: "Still broken.", log: "error log" },
    });
    expect(again.state.surface).toBe("chat");
    expect(again.notices[0]?.text).toContain("Still broken.");
  });

  it("does not replace the file the user is reading when the server becomes ready", () => {
    let state = hydrated(report);
    state = reduceWorkspace(state, { type: "step", direction: 1 }).state;
    const ready = reduceWorkspace({ ...state, launchCommand: "pnpm dev" }, {
      type: "runtime",
      runtime: { status: "ready", url: "http://localhost:5173", command: "pnpm dev", jobId: "job-1" },
    });
    expect(ready.state.activeArtifactId).toBe("Rapport.pdf");
    expect(ready.notices[0]?.text).toContain("ready");
    expect(ready.state.runtime.url).toBe("http://localhost:5173");
  });

  it("keeps the code editor mounted across artifact updates", () => {
    let state = hydrated(report);
    state = reduceWorkspace(state, { type: "open-code" }).state;
    const next = reduceWorkspace(state, {
      type: "sync-artifacts",
      artifacts: three,
      category: "multi",
      launchCommand: null,
    });
    expect(next.state.surface).toBe("code");
    const back = reduceWorkspace(next.state, { type: "open-project" });
    expect(back.state.surface).toBe("split");
    expect(back.state.activeArtifactId).toBe("Rapport.pdf");
  });

  it("shows a plan in the project stage without replacing the active artifact", () => {
    const state = hydrated(report);
    const opened = reduceWorkspace(state, { type: "show-plan", path: ".kursor/plans/demo.plan.md" });
    expect(opened.state.surface).toBe("split");
    expect(opened.state.planPath).toBe(".kursor/plans/demo.plan.md");
    expect(opened.state.activeArtifactId).toBe("Rapport.pdf");
    const back = reduceWorkspace(opened.state, { type: "open-project" });
    expect(back.state.planPath).toBeNull();
    expect(back.state.surface).toBe("split");
    expect(back.state.activeArtifactId).toBe("Rapport.pdf");
  });

  it("opens the split from chat when a plan is requested", () => {
    const state = reduceWorkspace(initialWorkspace(), {
      type: "hydrate",
      projectId: "p1",
      persisted: null,
      artifacts: [],
      category: "unknown",
      launchCommand: null,
    }).state;
    const opened = reduceWorkspace(state, { type: "show-plan", path: ".kursor/plans/demo.plan.md" });
    expect(opened.state.surface).toBe("split");
    expect(opened.state.planPath).toBe(".kursor/plans/demo.plan.md");
    const dismissed = reduceWorkspace(opened.state, { type: "open-project" });
    expect(dismissed.state.planPath).toBeNull();
    expect(dismissed.state.surface).toBe("chat");
  });
});

describe("preview runtime helpers", () => {
  it("extracts a localhost url with a port", () => {
    expect(extractLocalUrl("ready on http://localhost:5173/\n")).toBe("http://localhost:5173/");
    expect(extractLocalUrl("Local: http://localhost:5173/\nLocal: http://localhost:5174/\n")).toBe("http://localhost:5174/");
    expect(extractLocalUrl("\u001b[32m\u001b[1m➜\u001b[22m  Local:   \u001b[36mhttp://127.0.0.1:5174/\u001b[39m\n")).toBe("http://127.0.0.1:5174/");
    expect(extractLocalUrl("no server here")).toBeNull();
    expect(previewFrameUrl("http://localhost:5174/")).toBe("http://127.0.0.1:5174/");
    expect(previewFrameUrl("http://127.0.0.1:5174/")).toBe("http://127.0.0.1:5174/");
  });

  it("keeps both panes usable", () => {
    expect(clampSplit(1, 1200)).toBeGreaterThan(20);
    expect(clampSplit(99, 1200)).toBeLessThan(80);
  });

  it("parses quoted spreadsheet cells", () => {
    expect(parseDelimited('Name,Note\n"A, B","line"\n', ",")).toEqual([
      ["Name", "Note"],
      ["A, B", "line"],
    ]);
  });
});

describe("workspace persistence", () => {
  it("restores a manual chat preference for the same project", () => {
    const storage = memoryStorage();
    saveWorkspace("p1", { control: "manual", surface: "chat", activeArtifactId: "Rapport.pdf", splitPercent: 48 }, storage);
    expect(loadWorkspace("p1", storage)).toMatchObject({ control: "manual", surface: "chat", splitPercent: 48 });
    expect(loadWorkspace("p2", storage)).toBeNull();
    const restored = reduceWorkspace(initialWorkspace(), {
      type: "hydrate",
      projectId: "p1",
      persisted: loadWorkspace("p1", storage),
      artifacts: buildArtifacts({ projectId: "p1", agentPaths: ["Rapport.pdf"], files: [file("Rapport.pdf")] }),
      category: "document",
      launchCommand: null,
    });
    expect(restored.state.surface).toBe("chat");
    expect(restored.state.control).toBe("manual");
    expect(restored.state.activeArtifactId).toBe("Rapport.pdf");
  });
});

function hydrated(artifacts: WorkspaceSnapshot["artifacts"]) {
  return reduceWorkspace(initialWorkspace(), {
    type: "hydrate",
    projectId: "p1",
    persisted: null,
    artifacts,
    category: artifacts.length > 1 ? "multi" : artifacts.length === 1 ? "document" : "unknown",
    launchCommand: null,
  }).state;
}
