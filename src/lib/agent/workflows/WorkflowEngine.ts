import type { AgentEvent } from "../types";
import type { GoalKind } from "../workflow/sessionState";
import { FEATURE_DEVELOPMENT } from "./builtin/feature-development";
import { DEBUG_WORKFLOW } from "./builtin/debug";
import { classifyTask, isDebugGoal } from "./classify";
import {
  COMPLEXITY_RANK,
  type TaskComplexity,
  type TurnRunner,
  type Workflow,
  type WorkflowArtifact,
  type WorkflowArtifactKind,
  type WorkflowCheckpoint,
  type WorkflowContext,
  type WorkflowStep,
  type WorkflowStepStatus,
} from "./types";

export interface WorkflowEngineOptions {
  onEvent?: (event: AgentEvent) => void;
  now?: () => number;
  id?: () => string;
}

export function selectWorkflow(goal: string): Workflow {
  return isDebugGoal(goal) ? DEBUG_WORKFLOW : FEATURE_DEVELOPMENT;
}

export function activeSteps(workflow: Workflow, complexity: TaskComplexity): WorkflowStep[] {
  const rank = COMPLEXITY_RANK[complexity];
  return workflow.steps.filter((step) => rank >= COMPLEXITY_RANK[step.minComplexity]);
}

export function groupSteps(steps: readonly WorkflowStep[], complexity: TaskComplexity): WorkflowStep[][] {
  if (complexity !== "complex") return [steps.slice()];
  const groups: WorkflowStep[][] = [];
  let current: WorkflowStep[] = [];
  let batch: string | null = null;
  for (const step of steps) {
    if (batch !== null && step.batch !== batch) {
      groups.push(current);
      current = [];
    }
    batch = step.batch;
    current.push(step);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export class WorkflowEngine {
  constructor(private readonly options: WorkflowEngineOptions = {}) {}

  classify(goal: string) {
    return classifyTask(goal);
  }

  select(goal: string) {
    return selectWorkflow(goal);
  }

  async run(goal: string, runner: TurnRunner, gates?: { goalKind?: GoalKind; skipProcess?: boolean }): Promise<WorkflowContext> {
    const runId = this.options.id?.() ?? crypto.randomUUID();
    const complexity = classifyTask(goal);
    const step: WorkflowStep = {
      id: "act",
      title: "Act",
      minComplexity: "simple",
      requiresApproval: false,
      batch: "act",
      prompt: goal,
    };
    const context: WorkflowContext = {
      runId,
      workflowId: "agent-loop",
      goal,
      complexity,
      currentStepId: "act",
      status: "running",
      steps: [{ id: "act", status: "running" }],
      checkpoints: [],
      artifacts: [],
    };

    this.emit({
      type: "workflow-started",
      runId,
      workflowId: "agent-loop",
      complexity,
      stepIds: ["act"],
      ...(gates?.goalKind ? { goalKind: gates.goalKind } : {}),
      ...(gates?.skipProcess ? { skipProcess: true } : {}),
    });
    this.emit({ type: "workflow-step", runId, stepId: "act", status: "running" });

    const startedAt = this.now();
    const result = await runner.runTurn({
      goal,
      overlay: "",
      steps: [step],
      context,
    });
    const finishedAt = this.now();
    const artifact = artifactFor(step, result.content);
    context.artifacts.push(artifact);
    const checkpoint: WorkflowCheckpoint = {
      stepId: "act",
      status: "completed",
      artifacts: [artifact],
      startedAt,
      finishedAt,
    };
    context.checkpoints.push(checkpoint);
    this.setStep(context, "act", "completed");
    this.emit({ type: "workflow-checkpoint", runId, checkpoint });
    this.emit({ type: "workflow-step", runId, stepId: "act", status: "completed" });

    context.status = "completed";
    this.emit({
      type: "workflow-completed",
      runId,
      workflowId: "agent-loop",
      complexity,
      status: "completed",
    });
    return context;
  }

  private setStep(context: WorkflowContext, id: string, status: WorkflowStepStatus) {
    const step = context.steps.find((item) => item.id === id);
    if (step) step.status = status;
  }

  private emit(event: AgentEvent) {
    this.options.onEvent?.(event);
  }

  private now() {
    return this.options.now?.() ?? Date.now();
  }
}

export function formatOverlay(workflow: Workflow, steps: readonly WorkflowStep[], context: WorkflowContext): string {
  const previous = context.artifacts.length > 0
    ? `\nPrior artifacts:\n${context.artifacts.map((artifact) => `- ${artifact.kind} (${artifact.stepId}): ${clip(artifact.text, 400)}`).join("\n")}`
    : "";
  return `Workflow: ${workflow.name} (${context.complexity})
Goal: ${context.goal}
Active steps:
${steps.map((step) => `- ${step.title}: ${step.prompt}`).join("\n")}${previous}`;
}

function artifactFor(step: WorkflowStep, text: string): WorkflowArtifact {
  return {
    stepId: step.id,
    kind: artifactKind(step.id),
    text,
  };
}

function artifactKind(stepId: string): WorkflowArtifactKind {
  if (stepId === "understand" || stepId === "reproduce") return "notes";
  if (stepId === "specify") return "spec";
  if (stepId === "plan" || stepId === "locate") return "plan";
  return "summary";
}

function clip(text: string, max: number) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
