import { describe, expect, it } from "vitest";
import { layoutCommitGraph } from "../graph/layout";
import type { GitCommitInfo } from "../../../types/tauri";

function commit(sha: string, parents: string[]): GitCommitInfo {
  return {
    sha,
    shortSha: sha,
    parents,
    author: "A",
    email: "a@x",
    timestamp: 1,
    subject: sha,
    body: "",
    refs: [],
    insertions: 0,
    deletions: 0,
    filesChanged: 0,
  };
}

describe("commit graph layout", () => {
  it("keeps first-parent history on a lane", () => {
    const lanes = layoutCommitGraph([
      commit("c", ["b"]),
      commit("b", ["a"]),
      commit("a", []),
    ]);
    expect(lanes.map((item) => item.lane)).toEqual([0, 0, 0]);
    expect(lanes.every((item) => !item.merge)).toBe(true);
    expect(lanes[0]?.edges).toEqual([{ fromLane: 0, toLane: 0 }]);
    expect(lanes[1]?.edges).toEqual([{ fromLane: 0, toLane: 0 }]);
    expect(lanes[2]?.edges).toEqual([]);
  });

  it("puts a side branch on a second lane and marks merges", () => {
    const lanes = layoutCommitGraph([
      commit("m", ["c", "f"]),
      commit("c", ["b"]),
      commit("f", ["b"]),
      commit("b", ["a"]),
      commit("a", []),
    ]);
    const bySha = Object.fromEntries(lanes.map((item) => [item.sha, item]));
    expect(bySha.m?.merge).toBe(true);
    expect(bySha.m?.parentLanes).toHaveLength(2);
    expect(bySha.m?.edges).toEqual(expect.arrayContaining([
      { fromLane: 0, toLane: 0 },
      { fromLane: 0, toLane: 1 },
    ]));
    expect(bySha.c?.merge).toBe(false);
    expect(bySha.c?.edges).toEqual(expect.arrayContaining([
      { fromLane: 0, toLane: 0 },
      { fromLane: 1, toLane: 1 },
    ]));
    expect(bySha.f?.merge).toBe(false);
    expect(new Set(lanes.map((item) => item.lane)).size).toBeGreaterThan(1);
    expect(bySha.f?.lane).not.toBe(bySha.c?.lane);
  });

  it("frees a side lane after the branch merges back", () => {
    const lanes = layoutCommitGraph([
      commit("m", ["c", "f"]),
      commit("c", ["b"]),
      commit("f", ["b"]),
      commit("b", ["a"]),
      commit("a", []),
    ]);
    const bySha = Object.fromEntries(lanes.map((item) => [item.sha, item]));
    expect(bySha.f?.lane).toBe(1);
    expect(bySha.f?.edges).toEqual(expect.arrayContaining([{ fromLane: 1, toLane: 0 }]));
    expect(bySha.b?.lane).toBe(0);
    expect(bySha.a?.lane).toBe(0);
    expect(bySha.b?.lanes).toBe(1);
  });
});
