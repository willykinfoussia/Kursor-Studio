import type { GitCommitInfo } from "../../../types/tauri";

export interface GraphEdge {
  fromLane: number;
  toLane: number;
}

export interface CommitLane {
  sha: string;
  lane: number;
  lanes: number;
  parentLanes: number[];
  merge: boolean;
  edges: GraphEdge[];
}

export function layoutCommitGraph(commits: GitCommitInfo[]): CommitLane[] {
  const pending: (string | null)[] = [];
  const result: CommitLane[] = [];

  const findOrAlloc = (sha: string) => {
    const existing = pending.indexOf(sha);
    if (existing >= 0) return existing;
    const empty = pending.findIndex((item) => item === null);
    if (empty >= 0) {
      pending[empty] = sha;
      return empty;
    }
    pending.push(sha);
    return pending.length - 1;
  };

  const compact = () => {
    while (pending.length > 0 && pending[pending.length - 1] === null) pending.pop();
  };

  for (let index = 0; index < commits.length; index += 1) {
    const commit = commits[index];
    const upcoming = new Set(commits.slice(index + 1).map((item) => item.sha));
    const lane = findOrAlloc(commit.sha);
    const current = pending.slice();
    pending[lane] = null;

    const parentLanes: number[] = [];
    const [first, ...rest] = commit.parents;
    if (first) {
      if (upcoming.has(first)) {
        const existing = pending.indexOf(first);
        if (existing >= 0) parentLanes.push(existing);
        else {
          pending[lane] = first;
          parentLanes.push(lane);
        }
      } else {
        parentLanes.push(lane);
      }
    }
    for (const parent of rest) {
      if (upcoming.has(parent)) parentLanes.push(findOrAlloc(parent));
    }
    for (let slot = 0; slot < pending.length; slot += 1) {
      const sha = pending[slot];
      if (sha && !upcoming.has(sha)) pending[slot] = null;
    }
    compact();

    const edges: GraphEdge[] = [];
    const seen = new Set<string>();
    const pushEdge = (fromLane: number, toLane: number) => {
      const key = `${fromLane}->${toLane}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ fromLane, toLane });
    };
    for (const parentLane of parentLanes) pushEdge(lane, parentLane);
    for (let from = 0; from < current.length; from += 1) {
      const sha = current[from];
      if (!sha || sha === commit.sha) continue;
      const to = pending.indexOf(sha);
      if (to >= 0) pushEdge(from, to);
    }

    result.push({
      sha: commit.sha,
      lane,
      lanes: Math.max(pending.length, current.length, lane + 1, 1),
      parentLanes,
      merge: commit.parents.length > 1,
      edges,
    });
  }
  return result;
}
