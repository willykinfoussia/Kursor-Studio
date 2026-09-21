import type { TaskComplexity } from "../workflows/types";
import type { ModelTaskType } from "./types";

export interface ClassifyHints {
  specialistId?: string;
  workflowStepIds?: readonly string[];
  complexity?: TaskComplexity;
}

const SIMPLE_SIGNAL = /\b(renomm(?:e|er)|rename|typo|variable)\b/i;
const SUMMARIZE_SIGNAL = /\b(summar(?:y|ize)|résum(?:é|er)|resume|recap|synthèse)\b/i;
const RESEARCH_SIGNAL = /\b(docs?|documentation|api\b|web_search|cherche|search the web|fetch_url)\b/i;
const REVIEW_SIGNAL = /\b(review|audit|relecture|relis)\b/i;
const PLANNING_SIGNAL = /\b(plan(?:ning)?|architecture|oauth|raisonn|reason)\b/i;

export function classifyModelTask(goal: string, hints: ClassifyHints = {}): ModelTaskType {
  const fromSpecialist = specialistTaskType(hints.specialistId);
  if (fromSpecialist) return fromSpecialist;
  const fromWorkflow = workflowTaskType(hints.workflowStepIds);
  if (fromWorkflow) return fromWorkflow;
  return fromText(goal, hints.complexity);
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

function fromText(goal: string, complexity?: TaskComplexity): ModelTaskType {
  const text = goal.trim();
  const lowered = text.toLowerCase();
  if (!text) return "coding";
  if (SIMPLE_SIGNAL.test(lowered)) return "simple-edit";
  if (SUMMARIZE_SIGNAL.test(lowered)) return "summarization";
  if (REVIEW_SIGNAL.test(lowered)) return "review";
  if (RESEARCH_SIGNAL.test(lowered)) return "research";
  if (PLANNING_SIGNAL.test(lowered) || complexity === "complex") return "planning";
  return "coding";
}

export class TaskClassifier {
  classify(goal: string, hints?: ClassifyHints) {
    return classifyModelTask(goal, hints);
  }
}
