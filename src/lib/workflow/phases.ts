import type { RunPhase } from "./types";

const STEP_PHASES: Record<string, RunPhase> = {
  understand: "understanding",
  reproduce: "understanding",
  locate: "understanding",
  specify: "planning",
  plan: "planning",
  implement: "implementation",
  fix: "recovery",
  test: "verification",
  review: "verification",
  verify: "verification",
  complete: "completion",
};

export function phaseFromWorkflowStep(stepId: string): RunPhase {
  return STEP_PHASES[stepId] ?? "implementation";
}

export function phaseLabel(phase: RunPhase) {
  if (phase === "understanding") return "Understanding";
  if (phase === "planning") return "Planning";
  if (phase === "implementation") return "Implementation";
  if (phase === "verification") return "Verification";
  if (phase === "recovery") return "Recovery";
  return "Completion";
}
