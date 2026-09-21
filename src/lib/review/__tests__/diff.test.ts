import { describe, expect, it } from "vitest";
import { diffLines, diffTexts, joinLines, splitLines } from "../diff";
import { applyForward, applyReverse } from "../patch";
import { toAiHunks } from "../diff";

describe("diff and patch", () => {
  it("splits LF and CRLF without losing content", () => {
    const lf = splitLines("a\nb\n");
    expect(lf.lines).toEqual(["a", "b"]);
    expect(lf.eol).toBe("\n");
    expect(joinLines(lf)).toBe("a\nb\n");
    const crlf = splitLines("a\r\nb\r\n");
    expect(crlf.eol).toBe("\r\n");
    expect(joinLines(crlf)).toBe("a\r\nb\r\n");
  });

  it("treats an empty file as no lines", () => {
    expect(splitLines("").lines).toEqual([]);
    const created = diffTexts("new.ts", "", "hello\n");
    expect(created.additions).toBeGreaterThan(0);
    expect(created.deletions).toBe(0);
  });

  it("produces two hunks for distant edits", () => {
    const original = ["keep", "old-a", "keep", "keep", "keep", "keep", "keep", "keep", "keep", "keep", "old-b", "keep"].join("\n");
    const proposed = ["keep", "new-a", "keep", "keep", "keep", "keep", "keep", "keep", "keep", "keep", "new-b", "keep"].join("\n");
    const diff = diffTexts("file.ts", original, proposed);
    expect(diff.hunks.length).toBeGreaterThanOrEqual(2);
    expect(diff.additions).toBe(2);
    expect(diff.deletions).toBe(2);
  });

  it("merges adjacent edits into one hunk", () => {
    const original = "one\ntwo\nthree\n";
    const proposed = "one\nTWO\nTHREE\n";
    const diff = diffTexts("file.ts", original, proposed);
    expect(diff.hunks).toHaveLength(1);
  });

  it("reverses a hunk back to the original text", () => {
    const original = "export const a = 1;\nexport const b = 2;\n";
    const proposed = "export const a = 1;\nexport const b = 3;\n";
    const diff = diffTexts("a.ts", original, proposed);
    const hunks = toAiHunks("f1", diff.hunks, "t1", 1, () => "h1");
    const reversed = applyReverse(proposed, hunks[0]!);
    expect(reversed.ok).toBe(true);
    if (reversed.ok) expect(reversed.content).toBe(original);
    const forward = applyForward(original, hunks[0]!);
    expect(forward.ok).toBe(true);
    if (forward.ok) expect(forward.content).toBe(proposed);
  });

  it("fails when the patch context no longer matches", () => {
    const original = "alpha\nbeta\n";
    const proposed = "alpha\ngamma\n";
    const diff = diffTexts("a.ts", original, proposed);
    const hunks = toAiHunks("f1", diff.hunks, "t1", 1, () => "h1");
    const result = applyReverse("totally different\n", hunks[0]!);
    expect(result.ok).toBe(false);
  });

  it("diffs a full-file delete as only deletions", () => {
    const diff = diffTexts("gone.ts", "hello\n", "");
    expect(diff.additions).toBe(0);
    expect(diff.deletions).toBeGreaterThan(0);
  });

  it("diffs equal lines without edits", () => {
    expect(diffLines(["a"], ["a"])).toEqual([{ type: "eq", line: "a" }]);
  });
});
