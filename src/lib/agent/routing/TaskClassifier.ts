import type { ModelTaskType } from "./types";

export interface ClassifyHints {
  specialistId?: string;
  workflowStepIds?: readonly string[];
  /** Model task from the turn's JEV verdict. Free text is not classified here. */
  modelTask?: ModelTaskType;
}

export function classifyModelTask(_goal: string, hints: ClassifyHints = {}): ModelTaskType {
  const fromSpecialist = specialistTaskType(hints.specialistId);
  if (fromSpecialist) return fromSpecialist;
  const fromWorkflow = workflowTaskType(hints.workflowStepIds);
  if (fromWorkflow) return fromWorkflow;
  return hints.modelTask ?? "coding";
}

function specialistTaskType(id?: string): ModelTaskType | undefined {
  if (id === "explore" || id === "research") return "research";
  if (id === "implement" || id === "coding" || id === "testing") return "coding";
  if (id === "review") return "review";
  return undefined;
}

function workflowTaskType(stepIds?: readonly string[]): ModelTaskType | undefined {
  if (!stepIds?.length) return undefined;
  const steps = new Set(stepIds);
  if ((steps.has("plan") || steps.has("specify")) && !steps.has("implement")) return "planning";
  if (steps.has("review") && !steps.has("implement")) return "review";
  if (steps.has("implement")) return "coding";
  return undefined;
}

export class TaskClassifier {
  classify(goal: string, hints?: ClassifyHints) {
    return classifyModelTask(goal, hints);
  }
}
