import { usePlanStore } from "../../../stores/planStore";
import {
  migrateInteractionMode,
  type AgentInteractionMode,
} from "../modes";
import { isAffirmativeReply, isDesignApprovalReply, isDesignRejectionReply } from "./approvalLanguage";

const TRIVIAL_DESIGN_NOTE = /^(?:yes|no|oui|non|ok|okay|deny)[.!]*$/i;
const YES_NO_PREFIX = /^(?:yes|y|oui|ouais|no|non)\b/i;
const CATEGORY_PREFIX = /^(?:[\p{L}\d][\p{L}\d\s/]*)\s+[—–-]\s+/u;

export function normalizeDesignNote(label: string): string {
  const trimmed = label.trim();
  const stripped = trimmed.replace(CATEGORY_PREFIX, "").trim();
  return stripped || trimmed;
}

export function isRecordableDesignNote(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return false;
  if (TRIVIAL_DESIGN_NOTE.test(trimmed)) return false;
  if (isDesignApprovalReply(trimmed)) return false;
  if (YES_NO_PREFIX.test(trimmed)) return false;
  return true;
}

export type GoalKind = "explain" | "build" | "bug" | "other";

export type ChatApprovalResult = {
  designApproved: boolean;
  planApproved: boolean;
};

export type BeginUserTurnOptions = {
  cycleIdle?: boolean;
};

export interface DesignApproval {
  scope: string;
  path?: string;
  at: number;
}

export interface AgentBranchState {
  name: string;
  base: string;
}

/** @deprecated Restored from older session snapshots only. */
export interface WorktreeState {
  path: string;
  branch: string;
}

function restoreAgentBranch(data: WorkflowSessionPersist): AgentBranchState | null {
  if (data.agentBranch?.name) {
    return { name: data.agentBranch.name, base: data.agentBranch.base || "main" };
  }
  if (data.worktree?.branch) {
    return { name: data.worktree.branch, base: "main" };
  }
  return null;
}

const SKIP_PROCESS = /\b(skip (?:skills?|superpowers|process)|no skills?|sans skill)\b/i;
const BUILD = /\b(let'?s (?:make|build|create)|ajoute|add(?:e)?(?:r)?|create|cr[eé]e[er]?|implement|new feature|build|feature|construis(?:e|er)?|d[eé]veloppe(?:r)?)\b/i;
const CONTINUE = /\b(finalis(?:e|er|é)?|finish(?:ing|ed)?|complete(?:d|ing)?|termin(?:e|er|é)?|v[eé]rif(?:ie(?:r)?|ication)?|verify|verification|smoke(?:\s*-?\s*test)?|continue)\b/i;
const EXPLAIN = /\b(explain|explique|what does|how does this (?:file|code)|à quoi sert)\b/i;
const BUG = /\b(bug|crash|failing test|tests? (?:auth )?échou|fix this|broken)\b/i;

export function isContinuationPrompt(prompt: string): boolean {
  return CONTINUE.test(prompt.trim());
}

export function classifyGoalKind(prompt: string): GoalKind {
  const text = prompt.trim();
  if (!text) return "other";
  if (EXPLAIN.test(text) && !BUILD.test(text) && !CONTINUE.test(text)) return "explain";
  if (BUG.test(text) && !CONTINUE.test(text)) return "bug";
  if (BUILD.test(text) || CONTINUE.test(text)) return "build";
  return "other";
}

export function explicitSkipProcess(prompt: string) {
  return SKIP_PROCESS.test(prompt);
}

function planStillOpen(plan?: { status?: string; todos?: { status: string }[] } | null): boolean {
  if (!plan || plan.status === "done") return false;
  return (plan.todos ?? []).some((todo) => todo.status === "pending" || todo.status === "in_progress");
}

export function shouldCloseImplementationCycle(
  session: {
    planApproved: boolean;
    planPath: string | null;
    skipProcess?: boolean;
    planTodosComplete?: boolean;
  },
  plan?: { status?: string; todos?: { status: string }[] } | null,
  prompt?: string,
): boolean {
  if (session.skipProcess) return false;
  if (prompt && isContinuationPrompt(prompt)) return false;
  if (session.planApproved) {
    if (session.planTodosComplete) return true;
    if (!plan && session.planPath) return false;
    return !planStillOpen(plan);
  }
  return plan?.status === "done" && Boolean(session.planPath);
}

export class WorkflowSessionState {
  skillCheckThisTurn = false;
  skipProcess = false;
  designApproved: DesignApproval | null = null;
  planApproved = false;
  planPath: string | null = null;
  planMode = false;
  interactionMode: AgentInteractionMode = "agent";
  agentBranch: AgentBranchState | null = null;
  designNotes: string[] = [];
  designBrief: string | null = null;
  criticalReviewOpen = false;
  lastUserPrompt = "";
  goalKind: GoalKind = "other";
  subagent = false;
  compactTimes: number[] = [];
  invokedSkillIds: string[] = [];
  brainstormExploreDone = false;
  planExploreDone = false;
  implementRound = 0;
  activeTodoId: string | null = null;
  planTodosComplete = false;
  private exploreStartedThisTurn = 0;
  private exploreMarkedResolvers: Array<() => void> = [];
  private agentStartedThisTurn = 0;
  private agentPairResolvers: Array<() => void> = [];
  private skillCheckStartedThisTurn = 0;
  private skillCheckMarkedResolvers: Array<() => void> = [];

  beginUserTurn(prompt: string, options?: BeginUserTurnOptions): ChatApprovalResult {
    if (options?.cycleIdle) this.closeImplementationCycle();
    this.resetExploreStepBarrier();
    this.resetAgentPairBarrier();
    this.resetSkillCheckStepBarrier();
    const previousGoal = this.goalKind;
    const previousSkillCheck = this.skillCheckThisTurn;
    const affirmative = isAffirmativeReply(prompt);
    const rejected = isDesignRejectionReply(prompt);
    this.lastUserPrompt = prompt;
    if (rejected && previousGoal === "build") {
      this.goalKind = "build";
      this.rejectDesign();
    } else if (affirmative && previousGoal !== "other") {
      this.goalKind = previousGoal;
    } else {
      this.goalKind = classifyGoalKind(prompt);
    }
    if (this.interactionMode === "ask") this.goalKind = "explain";
    if (this.interactionMode === "debug") this.goalKind = "bug";
    const continues = affirmative && this.goalKind === previousGoal && previousGoal !== "other";
    this.skillCheckThisTurn = continues
      ? previousSkillCheck || this.invokedSkillIds.length > 0
      : false;
    if (explicitSkipProcess(prompt)) this.skipProcess = true;
    const result = affirmative
      ? this.applyAffirmativeApprovals(prompt)
      : { designApproved: false, planApproved: false };
    this.ensurePlanModeForBuild();
    return result;
  }

  setInteractionMode(mode: AgentInteractionMode) {
    this.interactionMode = mode;
    this.planMode = mode === "plan";
  }

  ensurePlanModeForBuild() {
    if (this.skipProcess) return;
    if (this.goalKind !== "build" || this.planApproved || !this.designApproved) return;
    if (this.interactionMode === "agent") this.setInteractionMode("plan");
  }

  markSkillCheck(skillId?: string) {
    this.skillCheckThisTurn = true;
    if (skillId && !this.invokedSkillIds.includes(skillId)) {
      this.invokedSkillIds.push(skillId);
    }
  }

  resetExploreStepBarrier() {
    this.exploreStartedThisTurn = 0;
    this.flushExploreWaiters();
  }

  resetAgentPairBarrier() {
    this.agentStartedThisTurn = 0;
    this.flushAgentPairWaiters();
  }

  resetSkillCheckStepBarrier() {
    this.skillCheckStartedThisTurn = 0;
    const waiters = this.skillCheckMarkedResolvers;
    this.skillCheckMarkedResolvers = [];
    for (const resolve of waiters) resolve();
  }

  noteAgentStarting() {
    this.agentStartedThisTurn += 1;
    if (this.agentStartedThisTurn >= 2) this.flushAgentPairWaiters();
  }

  async waitForAgentPair(): Promise<boolean> {
    await Promise.resolve();
    if (this.agentStartedThisTurn >= 2) return true;
    await Promise.race([
      new Promise<void>((resolve) => {
        this.agentPairResolvers.push(resolve);
      }),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      }),
    ]);
    return this.agentStartedThisTurn >= 2;
  }

  rejectSoloAgent(wasExplore: boolean) {
    this.agentStartedThisTurn = Math.max(0, this.agentStartedThisTurn - 1);
    if (wasExplore) {
      this.exploreStartedThisTurn = Math.max(0, this.exploreStartedThisTurn - 1);
    }
    this.flushAgentPairWaiters();
    this.flushExploreWaiters();
  }

  noteExploreStarting() {
    this.exploreStartedThisTurn += 1;
    if (this.exploreStartedThisTurn >= 2) this.markExploreDone();
    this.flushExploreWaiters();
  }

  noteSkillCheckStarting(skillId?: string) {
    this.skillCheckStartedThisTurn += 1;
    this.markSkillCheck(skillId);
    const waiters = this.skillCheckMarkedResolvers;
    this.skillCheckMarkedResolvers = [];
    for (const resolve of waiters) resolve();
  }

  async waitForSiblingExploreMark(): Promise<void> {
    await Promise.resolve();
    if (this.planExploreDone) return;
    if (this.exploreStartedThisTurn === 0) return;
    if (this.planExploreDone) return;
    await new Promise<void>((resolve) => {
      this.exploreMarkedResolvers.push(resolve);
    });
  }

  private flushExploreWaiters() {
    const waiters = this.exploreMarkedResolvers;
    this.exploreMarkedResolvers = [];
    for (const resolve of waiters) resolve();
  }

  private flushAgentPairWaiters() {
    const waiters = this.agentPairResolvers;
    this.agentPairResolvers = [];
    for (const resolve of waiters) resolve();
  }

  async waitForSiblingSkillCheck(): Promise<void> {
    await Promise.resolve();
    if (this.skillCheckThisTurn || this.invokedSkillIds.length > 0) return;
    if (this.skillCheckStartedThisTurn === 0) return;
    if (this.skillCheckThisTurn || this.invokedSkillIds.length > 0) return;
    await new Promise<void>((resolve) => {
      this.skillCheckMarkedResolvers.push(resolve);
    });
  }

  markExploreDone() {
    if (!this.designApproved) this.brainstormExploreDone = true;
    if (this.planApproved) return;
    const planResearch = Boolean(this.designApproved)
      || this.interactionMode === "plan"
      || this.invokedSkillIds.includes("writing-plans")
      || this.invokedSkillIds.includes("subagent-driven-planning");
    if (planResearch) this.planExploreDone = true;
  }

  rejectDesign() {
    this.designApproved = null;
    this.planApproved = false;
    this.planPath = null;
    this.agentBranch = null;
    this.planExploreDone = false;
    this.designNotes = [];
    this.designBrief = null;
    this.activeTodoId = null;
    this.planTodosComplete = false;
    this.setInteractionMode("agent");
    usePlanStore.getState().demoteOpenPlansToDraft();
  }

  approveDesign(scope: string, path?: string) {
    this.designApproved = { scope, path, at: Date.now() };
    this.ensurePlanModeForBuild();
  }

  approvePlan() {
    this.planApproved = true;
  }

  setActiveTodo(todoId: string | null) {
    this.activeTodoId = todoId;
    if (todoId) this.planTodosComplete = false;
  }

  setPlanTodosComplete(complete: boolean) {
    this.planTodosComplete = complete;
    if (complete) this.activeTodoId = null;
  }

  closeImplementationCycle() {
    this.designApproved = null;
    this.planApproved = false;
    this.planPath = null;
    this.activeTodoId = null;
    this.planTodosComplete = false;
    this.invokedSkillIds = [];
    this.brainstormExploreDone = false;
    this.planExploreDone = false;
    this.implementRound = 0;
    this.agentBranch = null;
    this.designNotes = [];
    this.designBrief = null;
    this.setInteractionMode("agent");
    this.resetExploreStepBarrier();
    this.resetAgentPairBarrier();
    this.resetSkillCheckStepBarrier();
  }

  recordDesignChoice(label: string) {
    if (this.planApproved) return;
    const trimmed = label.trim();
    if (!isRecordableDesignNote(trimmed)) return;
    const note = normalizeDesignNote(trimmed);
    if (!note || !isRecordableDesignNote(note)) return;
    if (this.designNotes.some((item) => item.toLowerCase() === note.toLowerCase())) return;
    this.designNotes = [...this.designNotes, note];
  }

  setDesignBrief(brief: string) {
    const trimmed = brief.trim();
    if (!trimmed) return;
    this.designBrief = trimmed;
  }

  /** Chat / free-text yes while waiting on design. Plans are approved only via Build. */
  applyAffirmativeApprovals(prompt: string): ChatApprovalResult {
    const result: ChatApprovalResult = { designApproved: false, planApproved: false };
    if (!isDesignApprovalReply(prompt)) return result;
    const needsDesign = !this.designApproved && this.invokedSkillIds.includes("brainstorming");
    if (needsDesign) {
      this.approveDesign(prompt);
      result.designApproved = true;
    }
    return result;
  }

  child(): WorkflowSessionState {
    const next = new WorkflowSessionState();
    next.subagent = true;
    next.skipProcess = true;
    next.skillCheckThisTurn = true;
    next.designApproved = this.designApproved;
    next.planApproved = this.planApproved;
    next.planPath = this.planPath;
    next.agentBranch = this.agentBranch;
    next.designNotes = [...this.designNotes];
    next.designBrief = this.designBrief;
    next.goalKind = this.goalKind;
    next.lastUserPrompt = this.lastUserPrompt;
    next.invokedSkillIds = [...this.invokedSkillIds];
    next.brainstormExploreDone = this.brainstormExploreDone;
    next.planExploreDone = this.planExploreDone;
    next.implementRound = this.implementRound;
    next.activeTodoId = this.activeTodoId;
    next.planTodosComplete = this.planTodosComplete;
    return next;
  }

  snapshot(): WorkflowSessionPersist {
    return {
      skipProcess: this.skipProcess,
      designApproved: this.designApproved,
      planApproved: this.planApproved,
      planPath: this.planPath,
      planMode: this.planMode,
      interactionMode: this.interactionMode,
      agentBranch: this.agentBranch,
      designNotes: [...this.designNotes],
      designBrief: this.designBrief,
      criticalReviewOpen: this.criticalReviewOpen,
      lastUserPrompt: this.lastUserPrompt,
      goalKind: this.goalKind,
      invokedSkillIds: [...this.invokedSkillIds],
      brainstormExploreDone: this.brainstormExploreDone,
      planExploreDone: this.planExploreDone,
      implementRound: this.implementRound,
      activeTodoId: this.activeTodoId,
      planTodosComplete: this.planTodosComplete,
    };
  }

  restore(data?: WorkflowSessionPersist | null) {
    if (!data) return;
    this.skipProcess = data.skipProcess;
    this.designApproved = data.designApproved;
    this.planApproved = data.planApproved;
    this.planPath = data.planPath;
    this.setInteractionMode(migrateInteractionMode(data));
    this.agentBranch = restoreAgentBranch(data);
    this.designNotes = [...(data.designNotes ?? [])];
    this.designBrief = data.designBrief ?? null;
    this.criticalReviewOpen = data.criticalReviewOpen;
    this.lastUserPrompt = data.lastUserPrompt;
    this.goalKind = data.goalKind;
    this.invokedSkillIds = [...(data.invokedSkillIds ?? [])];
    this.brainstormExploreDone = data.brainstormExploreDone ?? false;
    this.planExploreDone = data.planExploreDone ?? false;
    this.implementRound = data.implementRound ?? data.sddRound ?? 0;
    this.activeTodoId = data.activeTodoId ?? null;
    this.planTodosComplete = data.planTodosComplete ?? false;
  }

  reset() {
    this.skillCheckThisTurn = false;
    this.skipProcess = false;
    this.designApproved = null;
    this.planApproved = false;
    this.planPath = null;
    this.setInteractionMode("agent");
    this.agentBranch = null;
    this.designNotes = [];
    this.designBrief = null;
    this.criticalReviewOpen = false;
    this.lastUserPrompt = "";
    this.goalKind = "other";
    this.subagent = false;
    this.compactTimes = [];
    this.invokedSkillIds = [];
    this.brainstormExploreDone = false;
    this.planExploreDone = false;
    this.implementRound = 0;
    this.activeTodoId = null;
    this.planTodosComplete = false;
    this.resetExploreStepBarrier();
    this.resetAgentPairBarrier();
    this.resetSkillCheckStepBarrier();
  }
}

export interface WorkflowSessionPersist {
  skipProcess: boolean;
  designApproved: DesignApproval | null;
  planApproved: boolean;
  planPath: string | null;
  planMode: boolean;
  interactionMode?: AgentInteractionMode;
  agentBranch?: AgentBranchState | null;
  worktree?: WorktreeState | null;
  designNotes?: string[];
  designBrief?: string | null;
  criticalReviewOpen: boolean;
  lastUserPrompt: string;
  goalKind: GoalKind;
  invokedSkillIds: string[];
  brainstormExploreDone?: boolean;
  planExploreDone?: boolean;
  implementRound?: number;
  /** @deprecated Restored as implementRound */
  sddEnabled?: boolean;
  /** @deprecated Restored as implementRound */
  sddRound?: number;
  activeTodoId?: string | null;
  planTodosComplete?: boolean;
}

export const SKILL_CHECK_TOOLS = new Set([
  "load_skill",
  "check_skills",
  "ask_user_question",
  "enter_plan_mode",
  "switch_agent_mode",
  "create_plan",
  "update_plan_todo",
]);

/** Structured plan tools allowed to write while interactionMode is Plan. */
export const PLAN_WRITE_TOOLS = new Set(["create_plan", "update_plan_todo"]);

export const SUPERPOWERS_PROCESS_SKILL_IDS = [
  "using-superpowers",
  "brainstorming",
  "using-git-worktrees",
  "using-kursor-shell",
  "writing-plans",
  "executing-plans",
  "subagent-driven-brainstorming",
  "subagent-driven-planning",
  "dispatching-parallel-agents",
  "test-driven-development",
  "systematic-debugging",
  "verification-before-completion",
  "requesting-code-review",
  "receiving-code-review",
  "finishing-a-development-branch",
  "writing-skills",
] as const;
