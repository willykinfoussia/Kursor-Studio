import { formatDuration } from "../../lib/agent/conversation";
import type { AgentRun, ProjectedGraph } from "../../lib/workflow/types";

export function WorkflowSummary({ run, graph }: { run: AgentRun | null; graph: ProjectedGraph }) {
  if (!run?.id) {
    return (
      <section className="wf-summary">
        <h3>Harness</h3>
        <p>Idle map of how a discussion flows through the agent. A live or past run lights these stages.</p>
      </section>
    );
  }
  const files = new Set(
    graph.nodes.flatMap((node) => typeof node.metadata?.filePath === "string" ? [node.metadata.filePath] : []),
  );
  const verification = [...graph.nodes].reverse().find((node) => node.type === "verification");
  const duration = formatDuration(run.startedAt, run.finishedAt ?? (run.status === "running" ? Date.now() : undefined));
  const mcpUsage = graph.nodes.filter((node) => node.type === "mcp_tool");
  return (
    <section className="wf-summary">
      <h3>Result</h3>
      <p>{run.status === "completed" ? "Completed" : run.status}</p>
      <p>Files changed: {files.size}</p>
      <p>Tools: {run.totalToolCalls || graph.nodes.filter((node) => node.type === "tool" || node.type === "file" || node.type === "command" || node.type === "mcp_tool").length}</p>
      {verification && <p>Verification: {verification.status === "completed" && verification.metadata?.ok !== false ? "passed" : verification.status}</p>}
      {duration && <p>Duration: {duration}</p>}
      {run.model && <p>Model: {run.model}</p>}
      <p>Fallbacks: {run.fallbackCount ?? 0}</p>
      {mcpUsage.length > 0 && (
        <p>MCP calls: {mcpUsage.length}</p>
      )}
    </section>
  );
}
