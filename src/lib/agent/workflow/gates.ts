import { isMutatingToolName, isProcessToolName } from "../AgentStep";
import { normalizeSkillId } from "../skills/ids";
import { usePlanStore } from "../../../stores/planStore";
import {
  PLAN_WRITE_TOOLS,
  SKILL_CHECK_TOOLS,
  type WorkflowSessionState,
} from "./sessionState";

function skillIdFromInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const skill = (input as { skill?: unknown }).skill;
  return typeof skill === "string" ? skill.trim() : "";
}

export function skillCheckDenied(tool: string, session: WorkflowSessionState): string | null {
  if (session.subagent || session.skipProcess || session.skillCheckThisTurn) return null;
  if (session.invokedSkillIds.length > 0) return null;
  if (session.interactionMode === "ask") return null;
  if (SKILL_CHECK_TOOLS.has(tool)) return null;
  return "invoke a skill first (1% rule)";
}

export const WAIT_FOR_BUILD_REASON = "The plan is written. Ask the human to click Build.";
export const WAIT_FOR_DESIGN_PLAN_REASON = "HARD-GATE: wait for design approval before writing the plan.";
export const RELOAD_BRAINSTORMING_REASON = "Design is approved. Load writing-plans instead of brainstorming.";
export const LOAD_WRITING_PLANS_REASON = "Load writing-plans with load_skill before create_plan.";
export const LOAD_KURSOR_SHELL_REASON = "Load using-kursor-shell with load_skill before run_command.";
export const LOAD_EXECUTING_PLANS_REASON = "Load executing-plans with load_skill before implementing the plan.";
export const LOAD_TDD_REASON = "Load test-driven-development with load_skill before implementing the plan.";
export const LOAD_BRAINSTORM_RESEARCH_REASON = "Load subagent-driven-brainstorming with load_skill before presenting a design.";
export const LOAD_PLAN_RESEARCH_REASON = "Load subagent-driven-planning with load_skill before create_plan.";
export const BRAINSTORM_EXPLORE_REASON = "Dispatch at least two explore subagents before presenting a design.";
export const PLAN_EXPLORE_REASON = "Dispatch at least two explore subagents before create_plan.";
export const MIN_SUBAGENTS_REASON = "Dispatch at least two subagents in the same response; a single spawn is rejected.";
export const LOAD_VERIFICATION_REASON = "Load verification-before-completion with load_skill before finishing the branch.";
export const TODO_IN_PROGRESS_REASON = "Call update_plan_todo in_progress on the next todo before mutating files.";
export const WAIT_FOR_AGENT_BRANCH_REASON = "Create the implementation branch with git_branch before mutating files.";

function boundPlanBlocksBrainstorming(session: WorkflowSessionState): boolean {
  if (sessionHasCompletedPlan(session)) return false;
  return Boolean(session.designApproved || session.planApproved);
}

export function brainstormingReloadDenied(
  tool: string,
  input: unknown,
  session: WorkflowSessionState,
): string | null {
  if (tool !== "load_skill") return null;
  if (session.skipProcess) return null;
  if (normalizeSkillId(skillIdFromInput(input)) !== "brainstorming") return null;
  if (!boundPlanBlocksBrainstorming(session)) return null;
  return RELOAD_BRAINSTORMING_REASON;
}

function questionKind(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const kind = (input as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind.trim() : "";
}

function subagentType(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const type = (input as { subagent_type?: unknown }).subagent_type;
  return typeof type === "string" ? type.trim() : "";
}

export function writingPlansRequiredDenied(tool: string, session: WorkflowSessionState): string | null {
  if (tool !== "create_plan") return null;
  if (session.skipProcess || session.subagent) return null;
  if (!session.invokedSkillIds.includes("writing-plans")) return LOAD_WRITING_PLANS_REASON;
  return null;
}

export function planResearchRequiredDenied(tool: string, session: WorkflowSessionState): string | null {
  if (tool !== "create_plan") return null;
  if (session.skipProcess || session.subagent) return null;
  if (!session.invokedSkillIds.includes("subagent-driven-planning")) return LOAD_PLAN_RESEARCH_REASON;
  if (!session.planExploreDone) return PLAN_EXPLORE_REASON;
  return null;
}

export function brainstormResearchDenied(
  tool: string,
  input: unknown,
  session: WorkflowSessionState,
): string | null {
  if (session.skipProcess || session.subagent) return null;
  if (!session.invokedSkillIds.includes("brainstorming") || session.designApproved) return null;
  if (tool !== "ask_user_question" || questionKind(input) !== "design") return null;
  if (!session.invokedSkillIds.includes("subagent-driven-brainstorming")) return LOAD_BRAINSTORM_RESEARCH_REASON;
  if (!session.brainstormExploreDone) return BRAINSTORM_EXPLORE_REASON;
  return null;
}

export function exploreResearchDenied(
  tool: string,
  input: unknown,
  session: WorkflowSessionState,
): string | null {
  if (tool !== "agent") return null;
  if (session.skipProcess || session.subagent) return null;
  if (subagentType(input) !== "explore") return null;
  if (!session.designApproved && (session.invokedSkillIds.includes("brainstorming") || session.goalKind === "build")) {
    if (!session.invokedSkillIds.includes("subagent-driven-brainstorming")) return LOAD_BRAINSTORM_RESEARCH_REASON;
  }
  if (session.designApproved && !session.planApproved) {
    if (!session.invokedSkillIds.includes("subagent-driven-planning")) return LOAD_PLAN_RESEARCH_REASON;
  }
  return null;
}

export function verificationRequiredDenied(tool: string, session: WorkflowSessionState): string | null {
  if (tool !== "finish_development_branch") return null;
  if (session.skipProcess || session.subagent) return null;
  if (!sessionHasCompletedPlan(session)) return null;
  if (session.invokedSkillIds.includes("verification-before-completion")) return null;
  return LOAD_VERIFICATION_REASON;
}

export function kursorShellRequiredDenied(tool: string, session: WorkflowSessionState): string | null {
  if (tool !== "run_command" && tool !== "start_process") return null;
  if (session.skipProcess || session.subagent) return null;
  if (session.invokedSkillIds.includes("using-kursor-shell")) return null;
  return LOAD_KURSOR_SHELL_REASON;
}

export function planWriteBeforeDesignDenied(tool: string, session: WorkflowSessionState): string | null {
  if (!PLAN_WRITE_TOOLS.has(tool)) return null;
  if (session.skipProcess) return null;
  if (session.goalKind === "build" && !session.designApproved) {
    return WAIT_FOR_DESIGN_PLAN_REASON;
  }
  return null;
}

export function sessionHasCompletedPlan(session: WorkflowSessionState): boolean {
  if (session.planTodosComplete) return true;
  const path = session.planPath;
  if (!path) return false;
  const state = usePlanStore.getState();
  const plan = state.plans[path]
    ?? Object.values(state.plans).find((item) => item.path === path || item.id === path);
  if (!plan) return false;
  if (plan.status === "done") return true;
  const todos = plan.todos ?? [];
  return todos.length > 0 && todos.every((todo) => todo.status === "completed" || todo.status === "cancelled");
}

export function planExecutionDenied(
  tool: string,
  mutate: boolean | undefined,
  session: WorkflowSessionState,
): string | null {
  if (session.skipProcess || session.subagent) return null;
  if (!session.planApproved) return null;
  if (tool === "update_plan_todo" || tool === "git_branch" || SKILL_CHECK_TOOLS.has(tool) || tool === "load_skill") return null;
  if (!session.agentBranch && PRE_BRANCH_GIT_TOOLS.has(tool)) return null;
  if (!isMutatingToolName(tool, mutate)) return null;
  if (sessionHasCompletedPlan(session)) return null;
  if (!session.invokedSkillIds.includes("executing-plans")) return LOAD_EXECUTING_PLANS_REASON;
  if (!session.invokedSkillIds.includes("test-driven-development")) return LOAD_TDD_REASON;
  if (session.activeTodoId) return null;
  return TODO_IN_PROGRESS_REASON;
}

const PRE_BRANCH_GIT_TOOLS = new Set(["git_commit", "git_push"]);

const BRANCH_EXEMPT = new Set([
  "git_branch",
  "git_status",
  "git_commit",
  "git_push",
  "load_skill",
  "ask_user_question",
  "finish_development_branch",
  ...SKILL_CHECK_TOOLS,
]);

export function agentBranchRequiredDenied(
  tool: string,
  mutate: boolean | undefined,
  session: WorkflowSessionState,
  input?: unknown,
): string | null {
  if (session.skipProcess || session.subagent) return null;
  if (!session.planApproved) return null;
  if (sessionHasCompletedPlan(session)) return null;
  if (session.agentBranch) return null;
  if (BRANCH_EXEMPT.has(tool)) return null;
  if (tool === "agent") {
    const record = input && typeof input === "object" ? input as { subagent_type?: unknown } : {};
    if (record.subagent_type !== "implement") return null;
  } else if (!isMutatingToolName(tool, mutate)) {
    return null;
  }
  return WAIT_FOR_AGENT_BRANCH_REASON;
}

export function mutationDenied(
  tool: string,
  mutate: boolean | undefined,
  session: WorkflowSessionState,
  _input?: unknown,
): string | null {
  void _input;
  if (!isMutatingToolName(tool, mutate)) return null;
  if (PLAN_WRITE_TOOLS.has(tool)) return null;
  if (session.planMode || session.interactionMode === "plan") {
    return "Plan mode is read-only. Use create_plan to write the plan, then Build to implement.";
  }
  if (session.interactionMode === "ask" || session.goalKind === "explain") return "Read-only question: mutations are denied.";
  if (session.goalKind === "build" && !session.designApproved) {
    return "HARD-GATE: wait for design approval before mutating (brainstorming).";
  }
  if (session.goalKind === "bug" || session.interactionMode === "debug") {
    if (isProcessToolName(tool)) return null;
    const debugged = session.invokedSkillIds.includes("systematic-debugging");
    if (!debugged && !session.designApproved) {
      return "Load systematic-debugging before patching a bug.";
    }
  }
  if (session.invokedSkillIds.includes("brainstorming") && !session.designApproved && session.goalKind !== "bug" && session.interactionMode !== "debug") {
    return "HARD-GATE: brainstorming is loaded; wait for a yes on the design.";
  }
  if (!session.planApproved && !session.skipProcess && (session.goalKind === "build" || Boolean(session.planPath))) {
    return WAIT_FOR_BUILD_REASON;
  }
  return null;
}

export function planModeDenied(
  tool: string,
  mutate: boolean | undefined,
  session: WorkflowSessionState,
  _input?: unknown,
): string | null {
  void _input;
  if (!session.planMode && session.interactionMode !== "plan") return null;
  if (SKILL_CHECK_TOOLS.has(tool) || tool === "enter_plan_mode" || tool === "switch_agent_mode" || tool === "load_skill") return null;
  if (isMutatingToolName(tool, mutate)) {
    if (PLAN_WRITE_TOOLS.has(tool)) return null;
    return "Plan mode blocks mutating tools.";
  }
  return null;
}

export function askModeDenied(tool: string, mutate: boolean | undefined, session: WorkflowSessionState): string | null {
  if (session.interactionMode !== "ask") return null;
  if (SKILL_CHECK_TOOLS.has(tool) || tool === "enter_plan_mode" || tool === "switch_agent_mode" || tool === "load_skill") return null;
  if (isMutatingToolName(tool, mutate)) {
    return "Ask mode is read-only. Switch to Agent or Debug before mutating files.";
  }
  return null;
}

export function implementBlocked(tool: string, input: unknown, session: WorkflowSessionState): string | null {
  if (tool !== "agent") return null;
  if (subagentType(input) !== "implement") return null;
  if (session.criticalReviewOpen) {
    return "Critical review is open; the next implement task is blocked.";
  }
  if (!session.planApproved && !session.skipProcess) {
    return "Implement subagents require an approved plan.";
  }
  if (!session.skipProcess && !session.invokedSkillIds.includes("test-driven-development")) {
    return LOAD_TDD_REASON;
  }
  return null;
}

/** @deprecated Use implementBlocked */
export const sddBlocked = implementBlocked;

export function evaluateWorkflowGate(
  tool: string,
  input: unknown,
  mutate: boolean | undefined,
  session: WorkflowSessionState,
): { decision: "allow" } | { decision: "deny"; reason: string } {
  const skill = skillCheckDenied(tool, session);
  if (skill) return { decision: "deny", reason: skill };
  const reload = brainstormingReloadDenied(tool, input, session);
  if (reload) return { decision: "deny", reason: reload };
  const beforeDesign = planWriteBeforeDesignDenied(tool, session);
  if (beforeDesign) return { decision: "deny", reason: beforeDesign };
  const writing = writingPlansRequiredDenied(tool, session);
  if (writing) return { decision: "deny", reason: writing };
  const planResearch = planResearchRequiredDenied(tool, session);
  if (planResearch) return { decision: "deny", reason: planResearch };
  const brainstormResearch = brainstormResearchDenied(tool, input, session);
  if (brainstormResearch) return { decision: "deny", reason: brainstormResearch };
  const explore = exploreResearchDenied(tool, input, session);
  if (explore) return { decision: "deny", reason: explore };
  const plan = planModeDenied(tool, mutate, session, input);
  if (plan) return { decision: "deny", reason: plan };
  const ask = askModeDenied(tool, mutate, session);
  if (ask) return { decision: "deny", reason: ask };
  const execution = planExecutionDenied(tool, mutate, session);
  if (execution) return { decision: "deny", reason: execution };
  const branch = agentBranchRequiredDenied(tool, mutate, session, input);
  if (branch) return { decision: "deny", reason: branch };
  const mutation = mutationDenied(tool, mutate, session, input);
  if (mutation) return { decision: "deny", reason: mutation };
  const implement = implementBlocked(tool, input, session);
  if (implement) return { decision: "deny", reason: implement };
  const verification = verificationRequiredDenied(tool, session);
  if (verification) return { decision: "deny", reason: verification };
  const shell = kursorShellRequiredDenied(tool, session);
  if (shell) return { decision: "deny", reason: shell };
  return { decision: "allow" };
}
