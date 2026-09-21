import { describe, expect, it, vi } from "vitest";
import { ProjectGraph } from "../ProjectGraph";
import { RelationshipAnalyzer } from "../analyze/RelationshipAnalyzer";
import { GRAPH_CACHE_DIR, GRAPH_EDGES_PATH, GRAPH_NODES_PATH } from "../config";
import { createXlsxFixture } from "../extract/spreadsheet";
import { fileNodeId } from "../ids";
import { MemoryGraphFs } from "./memoryFs";
import type { FileDescriptor, GraphEdge, ProjectContext } from "../types";

function graph(files: MemoryGraphFs, analyzer?: { analyze: RelationshipAnalyzer["analyze"] }) {
  return new ProjectGraph({ files, analyzer: analyzer as never });
}

describe("ProjectGraph required cases", () => {
  it("creates an imports edge with confidence 1 when A.py imports B.py", async () => {
    const files = new MemoryGraphFs();
    files.setText("A.py", "from B import helper\n");
    files.setText("B.py", "def helper():\n    return 1\n");
    const project = graph(files);
    await project.rebuild();
    const edges = project.getOutgoingEdges("A.py");
    const imported = edges.find((edge) => edge.target === fileNodeId("B.py"));
    expect(imported?.relation).toBe("imports");
    expect(imported?.confidence).toBe(1);
    expect(imported?.evidence.some((item) => item.type === "import_reference")).toBe(true);
  });

  it("links the same basename as implements with basename evidence", async () => {
    const files = new MemoryGraphFs();
    files.setText("margin.md", "# Margin\nCalculate margin from revenue and costs.\n");
    files.setText("margin.py", "def calculate_margin(revenue, costs):\n    return revenue - costs\n");
    const project = graph(files);
    await project.rebuild();
    const edge = project.getOutgoingEdges("margin.md").find((item) => item.target === fileNodeId("margin.py"));
    expect(edge?.relation).toBe("implements");
    expect(edge?.evidence.some((item) => item.type === "basename_match")).toBe(true);
  });

  it("does not treat a cross-domain basename match as a strong relation", async () => {
    const files = new MemoryGraphFs();
    files.setText("finance/margin.md", "# Finance margin\n");
    files.setText("marketing/margin.py", "def unrelated():\n    return 'ads'\n");
    const project = graph(files);
    await project.rebuild();
    const edge = project.getOutgoingEdges("finance/margin.md").find((item) => item.target === fileNodeId("marketing/margin.py"));
    expect(edge).toBeTruthy();
    expect(edge?.status).not.toBe("active");
    expect(edge?.confidence ?? 0).toBeLessThan(project.getConfig().minConfidence);
  });

  it("creates a references edge for an explicit file path in README.md", async () => {
    const files = new MemoryGraphFs();
    files.setText("README.md", "See src/finance/margin.py for the calculation.\n");
    files.setText("src/finance/margin.py", "def calculate_margin():\n    return 0\n");
    const project = graph(files);
    await project.rebuild();
    const edge = project.getOutgoingEdges("README.md").find((item) => item.target === fileNodeId("src/finance/margin.py"));
    expect(edge?.relation).toBe("references");
    expect(edge?.evidence.some((item) => item.type === "filename_reference")).toBe(true);
  });

  it("relates markdown to Excel using sheet tokens without creating worksheet nodes", async () => {
    const files = new MemoryGraphFs();
    files.setText(".kursor/specs/business/finance/margin.md", "Margin depends on revenue and costs in the finance workbook.");
    files.setBytes("data/finance.xlsx", createXlsxFixture(["Revenue", "Costs", "Margin"]));
    const project = graph(files);
    await project.rebuild();
    const nodes = project.getNodes();
    expect(nodes.some((node) => node.path === "data/finance.xlsx")).toBe(true);
    expect(nodes.every((node) => node.type === "file")).toBe(true);
    expect(nodes.some((node) => node.id.includes("xlsx#") || node.path.includes("#"))).toBe(false);
    const edge = project.getOutgoingEdges(".kursor/specs/business/finance/margin.md")
      .find((item) => item.target === fileNodeId("data/finance.xlsx"));
    expect(edge).toBeTruthy();
    expect(edge?.evidence.some((item) => item.type === "keyword_match" || item.type === "symbol_match" || item.type === "domain_match")).toBe(true);
    const sheets = project.getDescriptor("data/finance.xlsx")?.metadata.sheets;
    expect(sheets).toEqual(["Costs", "Margin", "Revenue"]);
  });

  it("returns backlinks through incoming edges", async () => {
    const files = new MemoryGraphFs();
    files.setText("A.py", "from B import helper\n");
    files.setText("B.py", "def helper():\n    return 1\n");
    const project = graph(files);
    await project.rebuild();
    expect(project.getIncomingEdges("B.py").some((edge) => edge.source === fileNodeId("A.py"))).toBe(true);
  });

  it("removes a node and all incident edges", async () => {
    const files = new MemoryGraphFs();
    files.setText("A.py", "from B import helper\n");
    files.setText("B.py", "def helper():\n    return 1\n");
    const project = graph(files);
    await project.rebuild();
    files.delete("B.py");
    await project.removeFile("B.py");
    expect(project.getNode("B.py")).toBeUndefined();
    expect(project.getAllEdges().some((edge) => edge.source === fileNodeId("B.py") || edge.target === fileNodeId("B.py"))).toBe(false);
  });

  it("recalculates only relations involving a modified file", async () => {
    const files = new MemoryGraphFs();
    files.setText("A.py", "from B import helper\n");
    files.setText("B.py", "def helper():\n    return 1\n");
    files.setText("C.py", "def other():\n    return 2\n");
    const inner = new RelationshipAnalyzer();
    const analyze = vi.fn((source: FileDescriptor, target: FileDescriptor, context: ProjectContext): GraphEdge[] =>
      inner.analyze(source, target, context));
    const project = graph(files, { analyze });
    await project.rebuild();
    analyze.mockClear();
    files.setText("A.py", "from B import helper\nfrom C import other\n", Date.now() + 10);
    await project.updateFile("A.py");
    expect(analyze.mock.calls.length).toBeGreaterThan(0);
    for (const [source, target] of analyze.mock.calls) {
      expect(source.path === "A.py" || target.path === "A.py").toBe(true);
    }
  });

  it("rebuilds the same graph after deleting the cache directory", async () => {
    const files = new MemoryGraphFs();
    files.setText("A.py", "from B import helper\n");
    files.setText("B.py", "def helper():\n    return 1\n");
    const project = graph(files);
    await project.rebuild();
    const first = JSON.stringify(project.snapshot());
    await files.delete(GRAPH_CACHE_DIR);
    expect(files.has(GRAPH_NODES_PATH)).toBe(false);
    expect(files.has(GRAPH_EDGES_PATH)).toBe(false);
    await project.rebuild();
    expect(JSON.stringify(project.snapshot())).toBe(first);
  });

  it("is deterministic across two analyses of the same project", async () => {
    const files = new MemoryGraphFs();
    files.setText("README.md", "See src/finance/margin.py\n");
    files.setText("src/finance/margin.py", "def calculate_margin():\n    return 1\n");
    files.setText("src/finance/test_margin.py", "from margin import calculate_margin\n");
    const first = graph(files);
    const second = graph(files);
    await first.rebuild();
    await second.rebuild();
    expect(JSON.stringify(second.snapshot())).toBe(JSON.stringify(first.snapshot()));
    expect(first.getNodes().map((node) => node.id)).toEqual([...first.getNodes().map((node) => node.id)].sort());
    expect(first.getAllEdges().map((edge) => edge.id)).toEqual([...first.getAllEdges().map((edge) => edge.id)].sort());
  });
});
