import { describe, expect, it } from "vitest";
import { ensureGfmTables, normalizeStreamingMarkdown } from "../streamingMarkdown";

describe("ensureGfmTables", () => {
  it("inserts a blank line before a glued GFM table", () => {
    expect(ensureGfmTables("Stack\n| A | B |\n| - | - |\n| 1 | 2 |")).toBe(
      "Stack\n\n| A | B |\n| - | - |\n| 1 | 2 |",
    );
  });

  it("does not insert a blank line between table rows", () => {
    expect(ensureGfmTables("| A | B |\n| - | - |")).toBe("| A | B |\n| - | - |");
  });
});

describe("normalizeStreamingMarkdown", () => {
  it("closes an open fence and still fixes tables", () => {
    expect(normalizeStreamingMarkdown("Hi\n| A | B |\n```ts")).toContain("\n\n| A | B |");
    expect(normalizeStreamingMarkdown("Hi\n```ts").endsWith("```")).toBe(true);
  });
});
