import { describe, expect, it } from "vitest";
import { ABSENT_HASH } from "../types";
import { classifyContent, relationFromHashes, resolveConflictContent } from "../ConflictDetectionService";
import type { AiFileChange } from "../types";

function file(partial: Partial<AiFileChange> = {}): AiFileChange {
  return {
    id: "f1",
    changeSetId: "cs1",
    path: "a.ts",
    kind: "modified",
    baseHash: "base",
    proposedHash: "ai",
    currentHash: "ai",
    baseContent: "old\n",
    proposedContent: "new\n",
    additions: 1,
    deletions: 1,
    status: "pending",
    binary: false,
    tooLarge: false,
    hunks: [],
    toolCallIds: ["t1"],
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe("conflict detection", () => {
  it("classifies matching proposed, base, missing, and human hashes", () => {
    expect(relationFromHashes("ai", file())).toBe("matches-proposed");
    expect(relationFromHashes("base", file())).toBe("matches-base");
    expect(relationFromHashes(ABSENT_HASH, file())).toBe("missing");
    expect(relationFromHashes("human", file())).toBe("human");
  });

  it("treats a deleted AI proposal as matching when the path is gone", async () => {
    const deleted = file({ kind: "deleted", proposedHash: ABSENT_HASH, proposedContent: null });
    expect(await classifyContent(null, deleted)).toBe("matches-proposed");
  });

  it("resolves keep-current, use-ai, and use-original without rewriting blindly", () => {
    const current = "human\n";
    expect(resolveConflictContent(file(), current, "keep-current")).toEqual({ content: current, deleteFile: false });
    expect(resolveConflictContent(file(), current, "use-ai")).toEqual({ content: "new\n", deleteFile: false });
    expect(resolveConflictContent(file(), current, "use-original")).toEqual({ content: "old\n", deleteFile: false });
    expect(resolveConflictContent(file({ kind: "created" }), current, "use-original")).toEqual({ content: null, deleteFile: true });
    expect(resolveConflictContent(file(), current, "open-merge")).toMatchObject({ conflict: true });
  });
});
