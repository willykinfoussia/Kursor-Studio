import { agentRuntime } from "../../agent/AgentRuntime";
import { toRunEvent } from "../events";
import { projectRun } from "../RunGraphProjector";
import type { AgentGraphEdge, AgentGraphNode, AgentRun, RunDataSource } from "../types";

export class LiveRunDataSource implements RunDataSource {
  async getRun(runId: string): Promise<AgentRun> {
    const events = agentRuntime.getTrace().filter((trace) => (trace.runId ?? "") === runId).map(toRunEvent);
    return projectRun(events).run;
  }

  async getNodes(runId: string): Promise<AgentGraphNode[]> {
    const events = agentRuntime.getTrace().filter((trace) => (trace.runId ?? "") === runId).map(toRunEvent);
    return projectRun(events).nodes;
  }

  async getEdges(runId: string): Promise<AgentGraphEdge[]> {
    const events = agentRuntime.getTrace().filter((trace) => (trace.runId ?? "") === runId).map(toRunEvent);
    return projectRun(events).edges;
  }
}
