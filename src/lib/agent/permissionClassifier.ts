import type { AIService, EvaluateState } from "./AIService";
import type { PermissionMode } from "./permissions/types";

export const PERMISSION_EVALUATION_MODEL = "typesafe-ai/jev";

const ALLOW_PROBABILITY = 0.55;

const DECISION_QUESTION = {
  decision: {
    type: "choice" as const,
    instructions: "Is this single tool call safe to run without asking the human? The call already passed deterministic denies. Prefer allow for ordinary local coding work.",
    criteria: {
      allow: "Routine work inside the workspace: reading files, searching, scoped writes and edits, tests, lint, format, and package or runtime commands (npm, npx, node, pnpm, yarn, cargo, python, pip). Ordinary local git inspection and commits. Effects stay in the project and are reversible or expected for a coding agent.",
      escalate: "Reading secrets or credentials, path traversal, commands that affect the OS (sudo, shutdown, disk format), destructive git (hard reset, clean that deletes, force push), or effects that cannot be determined from the tool name and arguments.",
    },
  },
};

export interface PermissionClassifierInput {
  tool: string;
  args: unknown;
  cwd: string | null;
  mode: PermissionMode;
}

export type ClassifierDecision = "allow" | "deny" | "ask_human";

export async function classifyPermission(
  ai: AIService,
  input: PermissionClassifierInput,
  signal?: AbortSignal,
): Promise<{ decision: ClassifierDecision; reason?: string }> {
  if (!ai.evaluate) return { decision: "ask_human", reason: "No evaluate on AIService." };
  const state = classifierState(input);
  if (!state) return { decision: "ask_human", reason: "Unserializable classifier state." };
  try {
    const result = await ai.evaluate({
      state,
      questions: DECISION_QUESTION,
      signal,
    });
    return decisionFromAnswer(result.answers.decision);
  } catch (error) {
    return {
      decision: "ask_human",
      reason: error instanceof Error ? error.message : "Classifier failed.",
    };
  }
}

function classifierState(input: PermissionClassifierInput): EvaluateState | null {
  try {
    const parsed: unknown = JSON.parse(JSON.stringify({
      tool: input.tool,
      args: input.args,
      cwd: input.cwd,
      mode: input.mode,
    }));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as EvaluateState;
  } catch {
    return null;
  }
}

function decisionFromAnswer(answer: { choice?: string; probabilities?: Record<string, number> } | undefined) {
  if (answer?.choice !== "allow" && answer?.choice !== "escalate") {
    return { decision: "ask_human" as const, reason: "Malformed classifier output." };
  }
  const probability = answer.probabilities?.[answer.choice];
  const shown = typeof probability === "number" ? probability.toFixed(2) : "unknown";
  if (answer.choice === "allow" && typeof probability === "number" && probability >= ALLOW_PROBABILITY) {
    return { decision: "allow" as const, reason: `allow ${shown}` };
  }
  return { decision: "ask_human" as const, reason: `${answer.choice} ${shown}` };
}
