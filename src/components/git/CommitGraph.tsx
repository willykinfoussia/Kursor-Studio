import type { MouseEvent } from "react";
import { layoutCommitGraph, type CommitLane } from "../../lib/git/graph/layout";
import type { GitCommitInfo } from "../../types/tauri";
import { useGitStore } from "../../stores/gitStore";

export const GRAPH_COLORS = ["#8b7cf6", "#5cc8ff", "#39d98a", "#e7b85c", "#f0737f", "#c4b5f5"];
export const GRAPH_ROW = 36;
export const GRAPH_COL = 14;
const PAD_X = 10;
const PAD_Y = GRAPH_ROW / 2;

export function CommitGraph({
  commits,
  lanes,
  onCommitContextMenu,
}: {
  commits: GitCommitInfo[];
  lanes: CommitLane[];
  onCommitContextMenu?: (event: MouseEvent, sha: string) => void;
}) {
  const selectedSha = useGitStore((state) => state.selectedSha);
  const selectCommit = useGitStore((state) => state.selectCommit);
  const layout = lanes.length === commits.length ? lanes : layoutCommitGraph(commits);
  const maxLanes = Math.max(1, ...layout.map((item) => item.lanes), 1);
  const width = Math.max(28, PAD_X * 2 + Math.max(0, maxLanes - 1) * GRAPH_COL);

  return (
    <div className="git-graph" style={{ width }}>
      <svg
        width={width}
        height={Math.max(commits.length * GRAPH_ROW + PAD_Y, GRAPH_ROW)}
        className="git-graph-svg"
      >
        {layout.map((node, index) => {
          const x = PAD_X + node.lane * GRAPH_COL;
          const y = PAD_Y + index * GRAPH_ROW;
          const nextY = PAD_Y + (index + 1) * GRAPH_ROW;
          return (
            <g key={node.sha}>
              {node.edges.map((edge, edgeIndex) => {
                const x1 = PAD_X + edge.fromLane * GRAPH_COL;
                const x2 = PAD_X + edge.toLane * GRAPH_COL;
                const color = GRAPH_COLORS[edge.fromLane % GRAPH_COLORS.length];
                const d = edge.fromLane === edge.toLane
                  ? `M ${x1} ${y} L ${x2} ${nextY}`
                  : `M ${x1} ${y} C ${x1} ${y + 12}, ${x2} ${nextY - 12}, ${x2} ${nextY}`;
                return (
                  <path
                    key={`${node.sha}-${edge.fromLane}-${edge.toLane}-${edgeIndex}`}
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={node.merge && edge.fromLane !== edge.toLane ? 1.5 : 1.2}
                    opacity={0.9}
                    pointerEvents="none"
                  />
                );
              })}
              <circle
                cx={x}
                cy={y}
                r={selectedSha === node.sha ? 5 : 3.5}
                fill={node.merge ? "transparent" : GRAPH_COLORS[node.lane % GRAPH_COLORS.length]}
                stroke={GRAPH_COLORS[node.lane % GRAPH_COLORS.length]}
                strokeWidth={1.4}
                onClick={() => void selectCommit(node.sha)}
                onContextMenu={(event) => onCommitContextMenu?.(event, node.sha)}
                style={{ cursor: "pointer" }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
