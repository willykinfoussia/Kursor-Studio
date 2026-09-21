import { sessionModeFromSettings, type PermissionMode } from "../PermissionManager";
import type { TaskComplexity } from "../workflows/types";
import { NestedAgentError } from "./errors";
import { AgentManager, type AgentManagerDependencies, type SpawnOptions } from "./AgentManager";
import { formatReportsForParent } from "./report";
import { PIPELINE_AGENT_IDS, type DelegateReport, type SpecialistId } from "./types";

export interface OrchestratorRunOptions extends Omit<SpawnOptions, "parentKey" | "parentMode"> {
  goal: string;
  runId: string;
  parentKey?: string;
  complexity: TaskComplexity;
  permissionMode?: PermissionMode;
}

export interface OrchestratorResult {
  reports: DelegateReport[];
  content: string;
}

export class AgentOrchestrator {
  private readonly manager: AgentManager;
  private running = false;

  constructor(dependencies: AgentManagerDependencies | { manager: AgentManager }) {
    this.manager = "manager" in dependencies
      ? dependencies.manager
      : new AgentManager(dependencies);
  }

  getManager() {
    return this.manager;
  }

  cancel(parentKey?: string) {
    this.manager.cancel(parentKey);
  }

  async run(options: OrchestratorRunOptions): Promise<OrchestratorResult> {
    if (this.running) throw new NestedAgentError();
    this.running = true;
    const parentKey = options.parentKey ?? options.runId;
    const parentMode = sessionModeFromSettings(
      options.automaticTools !== false,
      options.permissionMode,
    );
    const reports: DelegateReport[] = [];
    const spawnOptions: SpawnOptions = {
      ...options,
      parentKey,
      parentMode,
    };

    try {
      options.emit({
        type: "orchestration-started",
        runId: options.runId,
        goal: options.goal,
        complexity: options.complexity,
        agentIds: [...PIPELINE_AGENT_IDS],
      });

      for (const agentId of PIPELINE_AGENT_IDS) {
        options.emit({
          type: "agent-started",
          runId: options.runId,
          agentId,
          name: this.manager.get(agentId)?.name ?? agentId,
        });
        const instance = this.manager.spawn(agentId, spawnOptions);
        const report = await instance.run(options.goal, reports);
        reports.push(report);
        options.emit({
          type: "agent-completed",
          runId: options.runId,
          agentId,
          name: this.manager.get(agentId)?.name ?? agentId,
          report,
        });
      }

      const content = formatReportsForParent(reports);
      options.emit({
        type: "orchestration-completed",
        runId: options.runId,
        agentIds: [...PIPELINE_AGENT_IDS],
        reports,
      });
      return { reports, content };
    } finally {
      this.running = false;
      this.manager.cancel(parentKey);
    }
  }
}

export function shouldOrchestrate(_complexity?: TaskComplexity) {
  return false;
}

export type { SpecialistId };
