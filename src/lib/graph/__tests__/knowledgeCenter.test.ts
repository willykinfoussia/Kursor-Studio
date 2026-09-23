import { describe, expect, it } from "vitest";
import { classifyFile, isAccountSpec, isMarkdownSpecFile, isProjectSpec, resolveSpecKind, specDisplayRelative, specKindLabel, specScope } from "../classify";
import { createSpecGroup, listSpecGroups, writeNewSpec } from "../createSpec";
import { extractDescriptor } from "../extract/extractDescriptor";
import { parseSpecFrontmatter } from "../extract/frontmatter";
import { nodeMatchesFilters, toggleGraphFilter } from "../filters";
import { edgeStrokeWidth, nodeRadius, seedPosition, weightedEdgeOpacity, weightedEdgeStrokeWidth } from "../layout";
import { createMergedGraphStore } from "../mergedStore";
import { fileNodeId } from "../ids";
import { ProjectGraph } from "../ProjectGraph";
import { buildSpecTree } from "../specTree";
import type { FileNode } from "../types";
import { MemoryGraphFs } from "./memoryFs";

function node(partial: Partial<FileNode> & { path: string; category: FileNode["category"] }): FileNode {
  return {
    id: fileNodeId(partial.path),
    type: "file",
    hash: "h",
    size: 1,
    modifiedAt: 1,
    basename: partial.path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? partial.path,
    tokens: [],
    metadata: {},
    ...partial,
  };
}

describe("Knowledge Center classify", () => {
  it("classifies account, new project, and legacy spec paths", () => {
    expect(classifyFile("account/specs/preferences.md")).toBe("specifications");
    expect(specScope("account/specs/preferences.md")).toBe("account");
    expect(isAccountSpec("account/specs/preferences.md")).toBe(true);
    expect(isMarkdownSpecFile("account/specs/preferences.md")).toBe(true);
    expect(isMarkdownSpecFile("account/specs/notes.txt")).toBe(false);
    expect(isMarkdownSpecFile("README.md")).toBe(false);
    expect(resolveSpecKind("account/specs/preferences.md")).toBe("preference");

    expect(classifyFile(".kursor/specs/project/technical/auth.md")).toBe("specifications");
    expect(specScope(".kursor/specs/project/technical/auth.md")).toBe("project");
    expect(resolveSpecKind(".kursor/specs/project/technical/auth.md")).toBe("technical");

    expect(classifyFile(".kursor/specs/business/finance/margin.md")).toBe("specifications");
    expect(isProjectSpec(".kursor/specs/business/finance/margin.md")).toBe(true);
    expect(specScope(".kursor/specs/business/finance/margin.md")).toBe("project");
    expect(resolveSpecKind(".kursor/specs/business/finance/margin.md")).toBe("business");

    expect(classifyFile("specs/ui/dashboard.md")).toBe("specifications");
    expect(specScope("specs/ui/dashboard.md")).toBe("project");
    expect(resolveSpecKind("specs/ui/dashboard.md")).toBe("ui");

    expect(resolveSpecKind("account/specs/stack/typescript.md")).toBe("stack");
    expect(resolveSpecKind("account/specs/information/profile.md")).toBe("information");
    expect(resolveSpecKind("account/specs/coding-style/conventions.md")).toBe("coding-style");
    expect(resolveSpecKind("account/specs/coding_style/conventions.md")).toBe("coding-style");
    expect(resolveSpecKind(".kursor/specs/project/database/schema.md")).toBe("database");
    expect(resolveSpecKind(".kursor/specs/project/missions/onboarding.md")).toBe("missions");
    expect(resolveSpecKind(".kursor/specs/project/architecture/overview.md")).toBe("architecture");
  });

  it("strips infrastructure folders from explorer paths", () => {
    expect(specDisplayRelative(".kursor/specs/project/technical/auth.md")).toBe("technical/auth.md");
    expect(specDisplayRelative(".kursor/specs/business/finance/margin.md")).toBe("business/finance/margin.md");
    expect(specDisplayRelative("specs/ui/dashboard.md")).toBe("ui/dashboard.md");
    expect(specDisplayRelative("account/specs/preferred-stack.md")).toBe("preferred-stack.md");
    expect(specDisplayRelative("account/specs/preferences/stack.md")).toBe("preferences/stack.md");
  });
});

describe("optional spec frontmatter", () => {
  it("parses YAML keys without requiring them", () => {
    const parsed = parseSpecFrontmatter("---\nscope: account\ntype: technical\ntitle: Preferred Stack\n---\n\nBody\n");
    expect(parsed.data).toEqual({ scope: "account", type: "technical", title: "Preferred Stack" });
    expect(parsed.body.trim()).toBe("Body");
    expect(parseSpecFrontmatter("# No frontmatter\n").data).toEqual({});
  });

  it("stores title and specType on the descriptor", async () => {
    const files = new MemoryGraphFs();
    files.setText("account/specs/stack.md", "---\ntype: technical\ntitle: Preferred Stack\n---\n\nUse TypeScript.\n");
    const descriptor = await extractDescriptor({ relativePath: "account/specs/stack.md", size: 20, modifiedAt: 1 }, files);
    expect(descriptor.metadata.scope).toBe("account");
    expect(descriptor.metadata.specType).toBe("technical");
    expect(descriptor.metadata.title).toBe("Preferred Stack");
  });
});

describe("account and project spec creation", () => {
  it("writes real markdown files through a graph file store", async () => {
    const files = new MemoryGraphFs();
    const accountPath = await writeNewSpec(files, { scope: "account", fileName: "preferred-stack" });
    const projectPath = await writeNewSpec(files, { scope: "project", kind: "technical", fileName: "auth" });
    const grouped = await writeNewSpec(files, { scope: "project", group: "onboarding", fileName: "flow" });
    const accountGrouped = await writeNewSpec(files, { scope: "account", group: "preferences", fileName: "stack" });
    expect(accountPath).toBe("account/specs/preferred-stack.md");
    expect(projectPath).toBe(".kursor/specs/project/technical/auth.md");
    expect(grouped).toBe(".kursor/specs/project/onboarding/flow.md");
    expect(accountGrouped).toBe("account/specs/preferences/stack.md");
    expect(await files.readFile(accountPath)).toContain("scope: account");
    expect(await files.readFile(accountPath)).toContain("type: preference");
    expect(await files.readFile(projectPath)).toContain("scope: project");
    expect(await files.readFile(projectPath)).toContain("type: technical");
    const accountStack = await writeNewSpec(files, { scope: "account", kind: "stack", fileName: "typescript" });
    expect(accountStack).toBe("account/specs/stack/typescript.md");
    expect(await files.readFile(accountStack)).toContain("type: stack");
    expect(specKindLabel("stack", "account")).toBe("Preferred Stack");
    expect(specKindLabel("stack", "project")).toBe("Stack");
    expect(specKindLabel("information")).toBe("User Information");
    expect(specKindLabel("coding-style")).toBe("Coding Style");
    expect(specKindLabel("ui")).toBe("UI");
    expect(specKindLabel("api")).toBe("API");
    expect(specKindLabel("ci")).toBe("CI");
  });

  it("creates spec groups and lists them without infrastructure folders", async () => {
    const files = new MemoryGraphFs();
    await createSpecGroup(files, "project", "onboarding");
    await createSpecGroup(files, "account", "preferences");
    await writeNewSpec(files, { scope: "project", kind: "business", fileName: "pricing" });
    expect(await listSpecGroups(files, "project")).toEqual(["business", "onboarding"]);
    expect(await listSpecGroups(files, "account")).toEqual(["preferences"]);
  });

  it("builds explorer groups without .kursor or specs wrappers", () => {
    const tree = buildSpecTree([
      node({ path: ".kursor/specs/project/technical/auth.md", category: "specifications" }),
      node({ path: ".kursor/specs/business/finance/margin.md", category: "specifications" }),
    ], ["onboarding"], "project");
    expect(tree.children.map((child) => child.name)).toEqual(["business", "onboarding", "technical"]);
    expect(tree.children.some((child) => child.name === ".kursor" || child.name === "specs" || child.name === "project")).toBe(false);
  });

  it("merges account files into the project graph store", async () => {
    const project = new MemoryGraphFs();
    const account = new MemoryGraphFs();
    project.setText("src/auth.ts", "export const auth = true;\n");
    account.setText("account/specs/auth.md", "# Auth\n");
    const merged = createMergedGraphStore(project, account);
    const walked = await merged.walkFiles();
    expect(walked.map((item) => item.relativePath).sort()).toEqual(["account/specs/auth.md", "src/auth.ts"]);
    await merged.writeFile("account/specs/auth.md", "updated");
    expect(await account.readFile("account/specs/auth.md")).toBe("updated");
    expect(await merged.readFile("src/auth.ts")).toContain("auth");
  });
});

describe("account influences", () => {
  it("adds an account spec node and an influences edge toward a project spec", async () => {
    const files = new MemoryGraphFs();
    files.setText("account/specs/auth.md", "# Auth\nAccount auth preferences for login.\n");
    files.setText(".kursor/specs/project/technical/auth.md", "# Auth\nProject auth specification.\n");
    const project = new ProjectGraph({ files });
    await project.rebuild();
    expect(project.getNode("account/specs/auth.md")?.category).toBe("specifications");
    expect(project.getNode(".kursor/specs/project/technical/auth.md")?.category).toBe("specifications");
    const edge = project.getOutgoingEdges("account/specs/auth.md")
      .find((item) => item.target === fileNodeId(".kursor/specs/project/technical/auth.md"));
    expect(edge?.relation).toBe("influences");
    expect(edge?.evidence.some((item) => item.type === "basename_match" || item.type === "keyword_match")).toBe(true);
  });
});

describe("graph filters and layout helpers", () => {
  it("intersects combinable filters", () => {
    const business = node({
      path: ".kursor/specs/business/margin.md",
      category: "specifications",
      metadata: { specType: "business" },
    });
    const code = node({ path: "src/margin.py", category: "code" });
    const account = node({ path: "account/specs/prefs.md", category: "specifications" });
    expect(nodeMatchesFilters(business, ["project", "business"])).toBe(true);
    expect(nodeMatchesFilters(code, ["project", "business"])).toBe(false);
    expect(nodeMatchesFilters(code, ["project", "code", "tests"])).toBe(true);
    expect(nodeMatchesFilters(account, ["project", "code", "tests"])).toBe(false);
    expect(nodeMatchesFilters(account, ["account"])).toBe(true);
    expect(toggleGraphFilter(["all"], "project")).toEqual(["project"]);
    expect(toggleGraphFilter(["project"], "all")).toEqual(["all"]);
  });

  it("interpolates edge width from confidence", () => {
    expect(edgeStrokeWidth(0)).toBeCloseTo(0.7);
    expect(edgeStrokeWidth(1)).toBeCloseTo(3.7);
    expect(edgeStrokeWidth(0.5)).toBeCloseTo(2.2);
  });

  it("grows node radius with degree and saturates near the ceiling", () => {
    const isolated = nodeRadius(0);
    const leaf = nodeRadius(1);
    const mid = nodeRadius(4);
    const hub = nodeRadius(12);
    const saturated = nodeRadius(40);
    expect(isolated).toBeCloseTo(6);
    expect(leaf).toBeGreaterThan(isolated);
    expect(leaf).toBeCloseTo(8.35, 1);
    expect(mid).toBeGreaterThan(leaf);
    expect(hub).toBeGreaterThan(mid);
    expect(hub).toBeLessThan(26);
    expect(saturated).toBeGreaterThan(hub);
    expect(saturated).toBeLessThanOrEqual(26);
    expect(nodeRadius(80) - saturated).toBeLessThan(0.2);
  });

  it("thickens a link between two hubs more than a link that touches a leaf", () => {
    const leaf = nodeRadius(1);
    const hub = nodeRadius(24);
    const confidence = 0.6;
    const leafLink = weightedEdgeStrokeWidth(confidence, leaf, leaf);
    const mixed = weightedEdgeStrokeWidth(confidence, hub, leaf);
    const hubLink = weightedEdgeStrokeWidth(confidence, hub, hub);
    expect(hubLink).toBeGreaterThan(mixed);
    expect(mixed).toBeGreaterThan(leafLink);
    expect(weightedEdgeOpacity(confidence, hub, hub)).toBeGreaterThan(weightedEdgeOpacity(confidence, leaf, leaf));
    expect(weightedEdgeOpacity(1, hub, hub)).toBeLessThanOrEqual(1);
  });

  it("seeds the same node ids to the same initial positions", () => {
    const first = seedPosition("file:account/specs/auth.md");
    const second = seedPosition("file:account/specs/auth.md");
    const other = seedPosition("file:src/auth.ts");
    expect(first).toEqual(second);
    expect(other).not.toEqual(first);
  });
});
