import { describe, expect, it } from "vitest";
import { parseUnifiedPatch, patchForHunk } from "../patch";

describe("unified patch parsing", () => {
  it("extracts a hunk that can be reapplied", () => {
    const diff = `diff --git a/src/App.tsx b/src/App.tsx
index 111..222 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1,3 +1,4 @@
 line
-old
+new
 keep
`;
    const files = parseUnifiedPatch(diff);
    expect(files).toHaveLength(1);
    expect(files[0].newFile).toBe("src/App.tsx");
    expect(files[0].hunks).toHaveLength(1);
    expect(patchForHunk(files[0], files[0].hunks[0])).toContain("@@ -1,3 +1,4 @@");
    expect(patchForHunk(files[0], files[0].hunks[0])).toContain("+new");
  });
});
