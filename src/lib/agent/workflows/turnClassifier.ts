import type { AIService, ChoiceEvaluationAnswer, EvaluateState } from "../AIService";
import type { GoalKind } from "../workflow/sessionState";
import type { ModelTaskType } from "../routing/types";
import type { TaskComplexity } from "./types";

export const TURN_CHOICE_PROBABILITY = 0.55;

export type TurnReply = "design_yes" | "affirmative" | "design_no" | "none";
export type TurnSkip = "skip" | "keep";
export type TurnContinuation = "continue" | "new";

export interface TurnVerdict {
  goalKind: GoalKind;
  complexity: TaskComplexity;
  reply: TurnReply;
  skipProcess: TurnSkip;
  continuation: TurnContinuation;
  modelTask: ModelTaskType;
}

export interface TurnClassifierInput {
  prompt: string;
  previousGoalKind: GoalKind;
  designPending: boolean;
  planOpen: boolean;
}

/** Safe poles: no approval, no skip, no continuation, other, medium, coding. */
export const SAFE_TURN_VERDICT: TurnVerdict = {
  goalKind: "other",
  complexity: "medium",
  reply: "none",
  skipProcess: "keep",
  continuation: "new",
  modelTask: "coding",
};

export function turnVerdict(partial: Partial<TurnVerdict> = {}): TurnVerdict {
  return { ...SAFE_TURN_VERDICT, ...partial };
}

const QUESTIONS = {
  goalKind: {
    type: "choice" as const,
    instructions: "What kind of user request is this? Use the previous goal only when this message continues that same effort.",
    criteria: {
      explain: "A question about existing code or the project. No change is requested.",
      bug: "Something already built is wrong and needs a diagnosis before a patch: a crash, a failing test, incorrect behavior, or a UI that renders without its styles (blank page, raw text, native buttons). A report that CSS or layout is not applied is a bug, not a new design.",
      build: "New behavior or a change whose shape is not fully specified. It needs a design before code. A report that existing behavior is broken is not a build.",
      other: "Anything else, including a direct action that names its target.",
    },
  },
  complexity: {
    type: "choice" as const,
    instructions: "How hard is the request? Weigh how abstract it is, how many distinct tasks it contains, and how much technical design the implementation needs.",
    criteria: {
      simple: "One concrete action with a named target and no design choice. Example: delete a file, rename a symbol, fix a typo. Do it directly.",
      medium: "A few related changes, or one small choice of approach. Brainstorm before coding.",
      complex: "An abstract goal, many tasks, or a technical shape that is not given. Example: improve the UI. Brainstorm, then a plan.",
    },
  },
  reply: {
    type: "choice" as const,
    instructions: "How does this message answer an open design, if it answers one at all? ok, d'accord, sure, and go are not a design yes. A yes that also changes the design is a refusal.",
    criteria: {
      design_yes: "An explicit yes to the design: yes, oui, je valide, c'est bon, I approve. Not ok, d'accord, sure, or go.",
      affirmative: "A soft agreement that does not approve a design: ok, d'accord, sure, go.",
      design_no: "A refusal, including a no that rejects the stack, architecture, or local versus hosted choice.",
      none: "Not an approval or a refusal.",
    },
  },
  skipProcess: {
    type: "choice" as const,
    instructions: "Does the user explicitly ask to skip skills or the design process?",
    criteria: {
      skip: "The user says to skip skills, skip superpowers, skip the process, or work without skills.",
      keep: "The user does not ask to skip the process.",
    },
  },
  continuation: {
    type: "choice" as const,
    instructions: "Is this message resuming work already in progress, or starting something new?",
    criteria: {
      continue: "Finish, verify, or otherwise resume the current plan or implementation. Not a new feature.",
      new: "A new request, or a message that is not resuming current work.",
    },
  },
  modelTask: {
    type: "choice" as const,
    instructions: "Which model task fits the text of this message?",
    criteria: {
      "simple-edit": "A tiny local edit such as a rename or a typo.",
      summarization: "Summarize, recap, or synthesize existing material.",
      review: "Review, audit, or reread code.",
      research: "Look up documentation, an API, or facts outside the repo.",
      planning: "Plan, architecture, or a large design.",
      coding: "Write or change code, or anything that is not one of the other tasks.",
    },
  },
};

const GOAL_KINDS = ["explain", "bug", "build", "other"] as const;
const COMPLEXITIES = ["simple", "medium", "complex"] as const;
const REPLIES = ["design_yes", "affirmative", "design_no", "none"] as const;
const SKIPS = ["skip", "keep"] as const;
const CONTINUATIONS = ["continue", "new"] as const;
const MODEL_TASKS = ["simple-edit", "summarization", "review", "research", "planning", "coding"] as const;

export function routeGoalKind(verdict: TurnVerdict, mode: "ask" | "debug" | "agent" | "plan"): GoalKind {
  if (mode === "ask") return "explain";
  if (mode === "debug") return "bug";
  if (verdict.goalKind === "explain" || verdict.goalKind === "bug") return verdict.goalKind;
  if (verdict.complexity === "simple") return "other";
  return "build";
}

export async function classifyTurn(
  ai: AIService,
  input: TurnClassifierInput,
  signal?: AbortSignal,
): Promise<TurnVerdict> {
  if (!input.prompt.trim()) return SAFE_TURN_VERDICT;
  if (!ai.evaluate) return SAFE_TURN_VERDICT;
  const state = classifierState(input);
  if (!state) return SAFE_TURN_VERDICT;
  try {
    const result = await ai.evaluate({ state, questions: QUESTIONS, signal });
    return verdictFromAnswers(result.answers);
  } catch {
    return SAFE_TURN_VERDICT;
  }
}

function verdictFromAnswers(answers: Record<string, ChoiceEvaluationAnswer>): TurnVerdict {
  return {
    goalKind: readChoice(answers.goalKind, GOAL_KINDS, SAFE_TURN_VERDICT.goalKind),
    complexity: readChoice(answers.complexity, COMPLEXITIES, SAFE_TURN_VERDICT.complexity),
    reply: readChoice(answers.reply, REPLIES, SAFE_TURN_VERDICT.reply),
    skipProcess: readChoice(answers.skipProcess, SKIPS, SAFE_TURN_VERDICT.skipProcess),
    continuation: readChoice(answers.continuation, CONTINUATIONS, SAFE_TURN_VERDICT.continuation),
    modelTask: readChoice(answers.modelTask, MODEL_TASKS, SAFE_TURN_VERDICT.modelTask),
  };
}

function readChoice<T extends string>(
  answer: ChoiceEvaluationAnswer | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const choice = answer?.choice;
  if (!choice || !allowed.includes(choice as T)) return fallback;
  const probability = answer.probabilities?.[choice];
  if (typeof probability !== "number" || probability < TURN_CHOICE_PROBABILITY) return fallback;
  return choice as T;
}

function classifierState(input: TurnClassifierInput): EvaluateState | null {
  try {
    const parsed: unknown = JSON.parse(JSON.stringify({
      prompt: input.prompt,
      previousGoalKind: input.previousGoalKind,
      designPending: input.designPending,
      planOpen: input.planOpen,
    }));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as EvaluateState;
  } catch {
    return null;
  }
}
