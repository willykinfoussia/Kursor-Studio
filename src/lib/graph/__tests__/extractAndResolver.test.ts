import { describe, expect, it } from "vitest";
import { classifyFile, testTargetBasename } from "../classify";
import { ContextResolver } from "../ContextResolver";
import { extractDescriptor } from "../extract/extractDescriptor";
import { createXlsxFixture } from "../extract/spreadsheet";
import { ProjectGraph } from "../ProjectGraph";
import { MemoryGraphFs } from "./memoryFs";

describe("classifyFile", () => {
  it("derives display categories from path without changing node type", () => {
    expect(classifyFile(".kursor/specs/business/finance/margin.md")).toBe("specifications");
    expect(classifyFile("account/specs/preferences.md")).toBe("specifications");
    expect(classifyFile(".kursor/specs/project/technical/auth.md")).toBe("specifications");
    expect(classifyFile("specs/ui/dashboard.md")).toBe("specifications");
    expect(classifyFile("src/finance/margin.py")).toBe("code");
    expect(classifyFile("tests/test_margin.py")).toBe("tests");
    expect(classifyFile("src/finance/margin.test.ts")).toBe("tests");
    expect(classifyFile("data/finance.xlsx")).toBe("data");
    expect(classifyFile("README.md")).toBe("documentation");
  });

  it("maps test filenames to their target basename", () => {
    expect(testTargetBasename("tests/test_margin.py")).toBe("margin");
    expect(testTargetBasename("src/margin.test.ts")).toBe("margin");
  });
});

describe("extractDescriptor", () => {
  it("extracts python symbols and imports", async () => {
    const files = new MemoryGraphFs();
    files.setText("src/finance/margin.py", "from .costs import calculate_costs\n\ndef calculate_margin():\n    return 1\n");
    const descriptor = await extractDescriptor({ relativePath: "src/finance/margin.py", size: 20, modifiedAt: 1 }, files);
    expect(descriptor.symbols).toContain("calculate_margin");
    expect(descriptor.metadata.imports).toEqual([".costs"]);
    expect(descriptor.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps excel sheets in metadata", async () => {
    const files = new MemoryGraphFs();
    files.setBytes("data/finance.xlsx", createXlsxFixture(["Revenue", "Costs", "Margin"]));
    const descriptor = await extractDescriptor({ relativePath: "data/finance.xlsx", size: 10, modifiedAt: 1 }, files);
    expect(descriptor.metadata.sheets).toEqual(["Costs", "Margin", "Revenue"]);
    expect(descriptor.content).toBeUndefined();
  });
});

describe("rust module imports", () => {
  it("links mod db in main.rs to src/db.rs as imports", async () => {
    const files = new MemoryGraphFs();
    files.setText("src/main.rs", "mod db;\n\nfn main() {\n    let _ = db::create_pool();\n}\n");
    files.setText("src/db.rs", "pub async fn create_pool() {}\n");
    const project = new ProjectGraph({ files });
    await project.rebuild();
    const edge = project.getOutgoingEdges("src/main.rs").find((item) => item.target === "file:src/db.rs");
    expect(edge?.relation).toBe("imports");
    expect(edge?.evidence.some((item) => item.type === "import_reference")).toBe(true);
  });
});

describe("multi-language imports", () => {
  it("links C# using to a project file", async () => {
    const files = new MemoryGraphFs();
    files.setText("src/Program.cs", "using Project.Orders;\nclass Program {}\n");
    files.setText("src/Orders.cs", "namespace Project { class Orders {} }\n");
    const project = new ProjectGraph({ files });
    await project.rebuild();
    const edge = project.getOutgoingEdges("src/Program.cs").find((item) => item.target === "file:src/Orders.cs");
    expect(edge?.relation).toBe("imports");
    expect(edge?.evidence.some((item) => item.type === "import_reference")).toBe(true);
  });

  it("links a Go import path to db.go", async () => {
    const files = new MemoryGraphFs();
    files.setText("src/main.go", "package main\nimport \"app/db\"\nfunc main() {}\n");
    files.setText("src/db.go", "package db\n");
    const project = new ProjectGraph({ files });
    await project.rebuild();
    const edge = project.getOutgoingEdges("src/main.go").find((item) => item.target === "file:src/db.go");
    expect(edge?.relation).toBe("imports");
  });

  it("links SQL include files", async () => {
    const files = new MemoryGraphFs();
    files.setText("src/schema.sql", "\\i orders.sql\n");
    files.setText("src/orders.sql", "CREATE TABLE orders (id int);\n");
    const project = new ProjectGraph({ files });
    await project.rebuild();
    const edge = project.getOutgoingEdges("src/schema.sql").find((item) => item.target === "file:src/orders.sql");
    expect(edge?.relation).toBe("imports");
  });
});

describe("weak name mentions", () => {
  it("creates an uncertain related_to edge when content mentions another basename", async () => {
    const files = new MemoryGraphFs();
    files.setText("src/OrderService.cs", "class OrderService { Customer customer; }\n");
    files.setText("src/Customer.cs", "class Customer {}\n");
    const project = new ProjectGraph({ files });
    await project.rebuild();
    const edge = project.getOutgoingEdges("src/OrderService.cs").find((item) => item.target === "file:src/Customer.cs");
    expect(edge?.relation).toBe("related_to");
    expect(edge?.status).toBe("uncertain");
    expect(edge?.evidence.some((item) => item.type === "name_mention")).toBe(true);
  });

  it("does not link generic names or substring hits", async () => {
    const files = new MemoryGraphFs();
    files.setText("src/boot.ts", "const main = true; authorize(); index();\n");
    files.setText("src/main.ts", "export const boot = 1;\n");
    files.setText("src/index.ts", "export {};\n");
    files.setText("src/auth.ts", "export const auth = true;\n");
    const project = new ProjectGraph({ files });
    await project.rebuild();
    const outgoing = project.getOutgoingEdges("src/boot.ts");
    expect(outgoing.some((item) => item.target === "file:src/main.ts" && item.evidence.some((ev) => ev.type === "name_mention"))).toBe(false);
    expect(outgoing.some((item) => item.target === "file:src/index.ts" && item.evidence.some((ev) => ev.type === "name_mention"))).toBe(false);
    expect(outgoing.some((item) => item.target === "file:src/auth.ts" && item.evidence.some((ev) => ev.type === "name_mention"))).toBe(false);
  });
});

describe("ContextResolver", () => {
  it("walks related files with depth and size limits", async () => {
    const files = new MemoryGraphFs();
    files.setText("src/ui/dashboard.tsx", "import { calculate_margin } from '../finance/margin'\n");
    files.setText("src/finance/margin.py", "def calculate_margin():\n    return 1\n");
    files.setText(".kursor/specs/business/finance/margin.md", "implements src/finance/margin.py\n");
    const project = new ProjectGraph({ files });
    await project.rebuild();
    const resolver = new ContextResolver();
    const resolved = resolver.resolve(project, { paths: ["src/ui/dashboard.tsx"], query: "Improve the Finance Dashboard UI" }, {
      maxDepth: 3,
      maxFiles: 4,
      minConfidence: 0.2,
    });
    expect(resolved.root).toBe("src/ui/dashboard.tsx");
    expect(resolved.files[0]).toBe("src/ui/dashboard.tsx");
    expect(resolved.files.length).toBeGreaterThan(1);
    expect(resolved.files.length).toBeLessThanOrEqual(4);
  });
});
