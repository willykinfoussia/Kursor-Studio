import { usePlanStore } from "../../stores/planStore";

export const AGENT_INTERACTION_MODES = ["agent", "plan", "debug", "ask"] as const;

export type AgentInteractionMode = (typeof AGENT_INTERACTION_MODES)[number];

export const SWITCHABLE_AGENT_MODES = ["agent", "plan"] as const;

export type SwitchableAgentMode = (typeof SWITCHABLE_AGENT_MODES)[number];

export const MODE_LABELS: Record<AgentInteractionMode, string> = {
  agent: "Agent",
  plan: "Plan",
  debug: "Debug",
  ask: "Ask",
};

export function isAgentInteractionMode(value: unknown): value is AgentInteractionMode {
  return value === "agent" || value === "plan" || value === "ask" || value === "debug";
}

export function isSwitchableAgentMode(value: unknown): value is SwitchableAgentMode {
  return value === "agent" || value === "plan";
}

export function isReadOnlyInteraction(session?: {
  interactionMode?: AgentInteractionMode;
  planMode?: boolean;
} | null): boolean {
  if (!session) return false;
  if (session.interactionMode === "plan" || session.interactionMode === "ask") return true;
  return session.planMode === true;
}

export function cycleInteractionMode(mode: AgentInteractionMode): AgentInteractionMode {
  const index = AGENT_INTERACTION_MODES.indexOf(mode);
  return AGENT_INTERACTION_MODES[(index + 1) % AGENT_INTERACTION_MODES.length] ?? "agent";
}

export function migrateInteractionMode(data: {
  interactionMode?: unknown;
  planMode?: boolean;
}): AgentInteractionMode {
  if (data.planMode === true) return "plan";
  if (isAgentInteractionMode(data.interactionMode)) return data.interactionMode;
  return "agent";
}

export const PLAN_TO_AGENT_BLOCKED = "Implementation starts when the human clicks Build.";

export function planToAgentBlocked(
  session: { interactionMode: AgentInteractionMode; planMode?: boolean; planApproved: boolean },
  requested: AgentInteractionMode,
): string | null {
  if (requested !== "agent") return null;
  if (session.interactionMode !== "plan" && session.planMode !== true) return null;
  if (session.planApproved) return null;
  return PLAN_TO_AGENT_BLOCKED;
}

export type ModeOverlaySession = {
  goalKind?: string;
  designApproved?: unknown;
  planPath?: string | null;
  planApproved?: boolean;
  planTodosComplete?: boolean;
  agentBranch?: { name: string; base?: string } | null;
  designNotes?: string[];
  designBrief?: string | null;
};

const PLAN_READ_ONLY = `You are in Plan mode (read-only, except structured plans).
Do not edit, create, or delete source files. Do not run mutating commands. write_file and apply_patch are blocked.`;

const PLAN_FINISH_CREATE = `Never present the plan as free text only. The plan file under .kursor/plans/ is the deliverable.
When the plan is created, tell the user to review it and press Build to implement it. Do not switch to Agent mode to start coding.`;

const AGENT_STALE_DISK_PLAN = `A plan file on disk is marked approved, but this session has not approved a plan (the human has not clicked Build). That file was not created in this conversation. Do not read it as the plan to implement. Do not load_skill executing-plans. Do not implement that plan. Do not call git_commit or git_branch for it. After the human approves the design with yes, call create_plan for this conversation. Ask whether to continue that old plan (they click Build) or start a new design.`;

const PLAN_FOREIGN_DISK_PLAN = `A .plan.md file on disk was not created in this conversation. Do not read it as the plan to implement. Do not load_skill executing-plans. Call create_plan for the agreed design from this conversation.`;

function planWriteFromDesign(session?: ModeOverlaySession | null): string {
  const notes = (session?.designNotes ?? []).map((note) => note.trim()).filter(Boolean);
  const brief = session?.designBrief?.trim() ?? "";
  const constraints = [
    notes.length > 0 ? `Approved design choices (MUST appear in create_plan overview and body): ${notes.join("; ")}.` : "",
    brief ? `Approved design brief (MUST follow):\n${brief.slice(0, 2500)}` : "",
  ].filter(Boolean).join("\n");
  return `${PLAN_READ_ONLY}
The design is already approved. Do not reload brainstorming. Do not re-ask the same design questions.
You MUST call load_skill with skill writing-plans, then load_skill subagent-driven-planning and dispatch at least two explore subagents in the same response, then create_plan this turn. Do not skip the skills.
Call create_plan now using the agreed design from this conversation: a name, an overview, and a detailed markdown body (at least 6000 characters besides mermaid) with Problem, Architecture, KEEP/EXTEND impact, mermaid diagrams, short contract excerpts, and a section per todo that names files and how to verify. Outline-only bodies (diagrams + a file table + a bullet list) are rejected. Do not dump full implementations.
${constraints || "Follow the agreed design from this conversation. Do not invent a different stack, storage, or product scope."}
If create_plan returns success false, the plan was not created. Fix the body and call create_plan again. Do not tell the user the plan exists.
Do not tell the user to click Build. There is no plan file yet. Do not end the turn without create_plan.`;
}

const PLAN_WAIT_FOR_DESIGN = `You are in Plan mode (read-only).
Do not edit, create, or delete source files. Do not run mutating commands. write_file and apply_patch are blocked.
Complete brainstorming in chat: inspect the project, ask clarifying questions, and present a design.
Do not call create_plan until the human approves the design with yes/oui.`;

const PLAN_PRESS_BUILD = `${PLAN_READ_ONLY}
The implementation plan is already written. Tell the user to review it and press Build to implement it. Do not call create_plan again. Do not switch to Agent mode to start coding.`;

const PLAN_DEFAULT = `${PLAN_READ_ONLY}
Explore the codebase, ask clarifying questions with ask_user_question when needed, then you MUST call load_skill writing-plans, then load_skill subagent-driven-planning and dispatch at least two explore subagents in the same response, and finish by calling create_plan with a concrete implementation plan: a name, an overview, and a detailed markdown body (at least 6000 characters besides mermaid) with Problem, Architecture, KEEP/EXTEND impact, mermaid diagrams, short contract excerpts, and a section per todo with files and how to verify, one todo per implementable task. Outline-only plans are rejected. Do not dump full implementations.
${PLAN_FINISH_CREATE}`;

const AGENT_BRAINSTORM = `This is a build. Stay in Agent mode for brainstorming.
Load the brainstorming skill first. Then load_skill subagent-driven-brainstorming and dispatch at least two explore subagents in the same response before presenting a design.
Inspect the project, ask clarifying questions, and present a design.
Wait for the human to approve the design with yes/oui in chat (or ask_user_question).
Do not call create_plan yet. Do not edit source files. After that yes, the session enters Plan to write the implementation plan. Implementation starts only when the human clicks Build.`;

const AGENT_EXECUTE_PLAN = `The plan is approved. You MUST call load_skill executing-plans first.
Then load_skill test-driven-development before writing implementation code.
Then load_skill using-git-worktrees. Call git_status. If the working tree is dirty, git_commit the uncommitted files, then git_push if origin exists (if push fails, continue). Then git_branch create before any source mutation. Work in the open editor checkout — do not create .worktrees/. Do not stash. Do not use run_command for git.
Before any run_command or start_process you MUST load_skill using-kursor-shell. Commands run in Windows cmd, not bash — one command per call, no pipes.
Work one todo at a time. Call update_plan_todo with status in_progress on that todo before any file mutation. Mark it completed after the task is done.
Do not end the turn while plan todos remain pending or in_progress. After completing a todo, start the next one immediately.`;

function agentVerifyPlan(path: string | null | undefined): string {
  const where = path?.trim() || ".kursor/plans";
  return `The project plan at ${where} is complete. Do not brainstorm. Do not call create_plan.
You MUST load_skill verification-before-completion first.
Before any run_command or start_process you MUST load_skill using-kursor-shell. Commands run in Windows cmd, not bash — one command per call, no pipes.
After verification is green, you MUST load_skill finishing-a-development-branch and call finish_development_branch with no choice so the human can pick merge, pr, keep, or discard.
If merge returns conflicts, edit the conflict markers, then call finish_development_branch with choice merge again. Do not stop after tests without finishing the branch.`;
}

function staleApprovedDiskPlan(session?: ModeOverlaySession | null): boolean {
  if (!session || session.planApproved) return false;
  return Object.values(usePlanStore.getState().plans).some(
    (plan) => plan.status === "approved" || plan.status === "building",
  );
}

export function modeSystemOverlay(
  mode: AgentInteractionMode,
  session?: ModeOverlaySession | null,
): string {
  if (mode === "ask") {
    return `You are in Ask mode (read-only Q&A).
Answer questions about the code and project. Do not edit files, run mutating commands, or write implementation plans unless asked.
Read tools are allowed. Keep answers concise.`;
  }
  if (mode === "debug") {
    return `You are in Debug mode.
Investigate bugs with runtime evidence before changing source.
Load the systematic-debugging skill first. Reproduce with run_command if needed.
Do not patch files until you have a root cause. Then apply a minimal fix and verify.`;
  }
  if (mode === "agent") {
    if (session?.planApproved && session.planTodosComplete) return agentVerifyPlan(session.planPath);
    if (session?.planApproved) return AGENT_EXECUTE_PLAN;
    if (staleApprovedDiskPlan(session)) {
      if (session?.goalKind === "build" && !session.designApproved) {
        return `${AGENT_STALE_DISK_PLAN}\n${AGENT_BRAINSTORM}`;
      }
      return AGENT_STALE_DISK_PLAN;
    }
    if (session?.goalKind === "build" && !session.designApproved) return AGENT_BRAINSTORM;
    return "";
  }
  if (session) {
    if (!session.designApproved) return PLAN_WAIT_FOR_DESIGN;
    if (session.planPath) return PLAN_PRESS_BUILD;
    const write = planWriteFromDesign(session);
    if (staleApprovedDiskPlan(session)) {
      return `${PLAN_FOREIGN_DISK_PLAN}\n${write}`;
    }
    return write;
  }
  return PLAN_DEFAULT;
}

export function modeNoticeText(mode: AgentInteractionMode): string {
  switch (mode) {
    case "plan":
      return "Plan mode (read-only). Research and write a plan; edits are blocked.";
    case "ask":
      return "Ask mode (read-only). Answers only; no file changes.";
    case "debug":
      return "Debug mode. Investigate with evidence before patching.";
    default:
      return "Agent mode. Full tools are available.";
  }
}

export function modePlaceholder(mode: AgentInteractionMode): string {
  switch (mode) {
    case "plan":
      return "Plan mode — describe what to design...";
    case "ask":
      return "Ask a question (read-only)...";
    case "debug":
      return "Describe the bug to investigate...";
    default:
      return "Ask Kursor...";
  }
}
