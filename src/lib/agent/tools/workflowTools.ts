import { toolPermission } from "../permissions/meta";
import type { AgentTool, ToolContext } from "../ToolRegistry";
import { asRecord, toolSchema } from "./schema";
import { failResult, okResult } from "./result";
import { SUBAGENT_TOOL_TIMEOUT_MS } from "../config";
import {
  isSwitchableAgentMode,
  type SwitchableAgentMode,
} from "../modes";
import { isAffirmativeReply } from "../workflow/approvalLanguage";
import {
  matchedQuestionChoice,
  normalizeAskUserQuestionInput,
  parseQuestionOptions,
  questionChoiceLabels,
  shouldApproveDesignFromQuestion,
} from "../workflow/questionOptions";

export const ASK_USER_OPTIONS_REQUIRED =
  "ask_user_question requires a non-empty options array of clickable choices (strings or {id, label, description}). Do not put XML or JSON inside prompt. Call again with prompt as the question text only and options as a JSON array.";

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

export function createCheckSkillsTool(): AgentTool {
  return {
    name: "check_skills",
    description: "Record that you checked the skill catalog for this turn (1% rule). Pass considered skill ids. Set noneApply true when no skill should be loaded.",
    ...toolPermission("filesystem.read", "low"),
    timeoutMs: 4_000,
    mutate: false,
    parameters: toolSchema({
      considered: { type: "array", items: { type: "string" }, description: "Skill ids you considered" },
      noneApply: { type: "boolean", description: "True when no listed skill applies" },
    }, []),
    async execute(input, ctx) {
      const record = asRecord(input);
      const considered = stringList(record.considered);
      const noneApply = record.noneApply === true;
      ctx.skillSession?.workflow?.markSkillCheck();
      ctx.harness?.workflow.markSkillCheck();
      ctx.skillSession?.emit?.({ type: "skill-check", considered, noneApply });
      return okResult({ considered, noneApply, skillCheck: true });
    },
  };
}

export function createAskUserQuestionTool(): AgentTool {
  return {
    name: "ask_user_question",
    description: "Ask the human a question with clickable choices. Pass prompt as the question text only. Pass options as a JSON array of strings or {id, label, description} — never XML or JSON inside prompt. Use kind design only for a yes/no on the presented design. Multiple-choice questions are not a design approval. Do not use this to approve an implementation plan; the human clicks Build after create_plan writes a file.",
    ...toolPermission("filesystem.read", "low"),
    timeoutMs: 10 * 60_000,
    mutate: false,
    parameters: toolSchema({
      prompt: { type: "string", description: "Question for the user. Question text only — do not embed XML or a JSON options array." },
      options: {
        type: ["array", "string"],
        description: "JSON array of clickable choices: strings or {id, label, description}. Never put this inside prompt.",
      },
      kind: { type: "string", description: "question | design | plan | finish-branch" },
    }, ["prompt"]),
    async execute(input, ctx) {
      const record = asRecord(normalizeAskUserQuestionInput(input));
      const prompt = String(record.prompt ?? "").trim();
      if (!prompt) return failResult("invalid_input", "prompt is required.");
      const options = parseQuestionOptions(record.options);
      if (options.length === 0) return failResult("invalid_input", ASK_USER_OPTIONS_REQUIRED);
      const kind: "question" | "design" | "plan" | "finish-branch" =
        record.kind === "design" || record.kind === "plan" || record.kind === "finish-branch"
          ? record.kind
          : "question";
      const id = crypto.randomUUID();
      ctx.skillSession?.emit?.({
        type: "user-question",
        id,
        prompt,
        options: questionChoiceLabels(options),
        choices: options,
        kind,
      });
      const harness = ctx.harness;
      if (!harness) {
        return failResult("no_harness", "Cannot ask the user outside the agent harness.");
      }
      const answer = await harness.askUser({ id, prompt, options, kind });
      const allowed = answer.allow || isAffirmativeReply(answer.selected);
      if (!harness.workflow.planApproved && kind !== "finish-branch") {
        const choice = matchedQuestionChoice(options, answer.selected);
        harness.workflow.recordDesignChoice(choice?.label ?? answer.selected);
      }
      if (
        shouldApproveDesignFromQuestion(kind, options, answer.selected)
        && !harness.workflow.designApproved
      ) {
        const modeBefore = harness.workflow.interactionMode;
        harness.workflow.approveDesign(prompt);
        ctx.skillSession?.emit?.({ type: "design-gate", reason: "approved", tool: "ask_user_question" });
        if (harness.workflow.interactionMode !== modeBefore) {
          ctx.skillSession?.emit?.({ type: "agent-mode", mode: harness.workflow.interactionMode });
          ctx.skillSession?.emit?.({
            type: "plan-mode",
            enabled: harness.workflow.interactionMode === "plan",
          });
        }
      }
      return okResult({ selected: answer.selected, allow: allowed });
    },
  };
}

function resolveSwitchableMode(input: unknown): { ok: true; mode: SwitchableAgentMode } | { ok: false; message: string } {
  const record = asRecord(input);
  const raw = record.mode;
  if (raw === "ask" || raw === "debug") {
    return { ok: false, message: "Ask and Debug can only be selected by the user." };
  }
  if (isSwitchableAgentMode(raw)) return { ok: true, mode: raw };
  if (record.enabled === false) return { ok: true, mode: "agent" };
  return { ok: true, mode: "plan" };
}

async function executeSwitchAgentMode(input: unknown, ctx: ToolContext) {
  const requested = resolveSwitchableMode(input);
  if (!requested.ok) return failResult("mode_locked", requested.message);
  const harness = ctx.harness;
  if (!harness) return failResult("no_harness", "Mode switching requires the agent harness.");
  const result = harness.switchAgentMode(requested.mode);
  if (!result.ok) return failResult("mode_blocked", result.message);
  const mode = harness.workflow.interactionMode;
  return okResult({ mode, planMode: mode === "plan" });
}

export function createEnterPlanModeTool(): AgentTool {
  return {
    name: "enter_plan_mode",
    description: "Switch between Agent and Plan mode. Plan is read-only. Ask and Debug can only be selected by the user.",
    ...toolPermission("filesystem.read", "low"),
    timeoutMs: 4_000,
    mutate: false,
    parameters: toolSchema({
      enabled: { type: "boolean", description: "true to enter Plan, false to return to Agent" },
      mode: { type: "string", description: "agent | plan" },
    }, []),
    async execute(input, ctx) {
      return executeSwitchAgentMode(input, ctx);
    },
  };
}

export function createSwitchAgentModeTool(): AgentTool {
  return {
    name: "switch_agent_mode",
    description: "Request a switch between Agent and Plan mode. Ask and Debug can only be selected by the user.",
    ...toolPermission("filesystem.read", "low"),
    timeoutMs: 4_000,
    mutate: false,
    parameters: toolSchema({
      mode: { type: "string", description: "agent | plan" },
    }, ["mode"]),
    async execute(input, ctx) {
      return executeSwitchAgentMode(input, ctx);
    },
  };
}

export function createGitBranchTool(): AgentTool {
  return {
    name: "git_branch",
    description: "Create or report the in-place implementation branch in the open editor checkout (create | status). Does not copy the repo. Dirty trees are refused — git_commit, then git_push if origin exists, then create. Do not stash. If HEAD is detached, pass branch to git_push.",
    ...toolPermission("git.write", "high"),
    timeoutMs: 60_000,
    mutate: true,
    parameters: toolSchema({
      action: { type: "string", description: "create | status" },
      branch: { type: "string", description: "Branch name for create" },
    }, ["action"]),
    async execute(input, ctx) {
      const record = asRecord(input);
      const action = String(record.action ?? "").trim();
      if (action !== "create" && action !== "status") {
        return failResult("invalid_input", "action must be create or status.");
      }
      const harness = ctx.harness;
      if (!harness) return failResult("no_harness", "git_branch requires the agent harness.");
      const result = await harness.ensureAgentBranch({
        action,
        branch: typeof record.branch === "string" ? record.branch : undefined,
      });
      return okResult(result);
    },
  };
}

export function createAgentTool(): AgentTool {
  return {
    name: "agent",
    description: "Spawn an isolated subagent. subagent_type is explore (read-only), implement (after plan approval), or review. Dispatch at least two in the same response; a single spawn is rejected. Returns a summary to the parent, not the child transcript.",
    ...toolPermission("filesystem.read", "medium"),
    timeoutMs: SUBAGENT_TOOL_TIMEOUT_MS,
    mutate: false,
    parameters: toolSchema({
      description: { type: "string", description: "Short title for the subagent" },
      prompt: { type: "string", description: "Task for the subagent" },
      subagent_type: { type: "string", description: "explore | implement | review" },
      model: { type: "string", description: "Optional model id" },
    }, ["description", "prompt", "subagent_type"]),
    async execute(input, ctx) {
      const record = asRecord(input);
      const subagentType = String(record.subagent_type ?? "").trim();
      if (subagentType !== "explore" && subagentType !== "implement" && subagentType !== "review") {
        return failResult("invalid_input", "subagent_type must be explore, implement, or review.");
      }
      const harness = ctx.harness;
      if (!harness) return failResult("no_harness", "agent requires the parent harness.");
      if (harness.isSubagent) return failResult("nested_agent", "Subagents cannot spawn subagents.");
      const report = await harness.spawnAgent({
        description: String(record.description ?? "subagent"),
        prompt: String(record.prompt ?? ""),
        subagentType,
        model: typeof record.model === "string" ? record.model : undefined,
      });
      return okResult(report);
    },
  };
}

export function createFinishBranchTool(): AgentTool {
  return {
    name: "finish_development_branch",
    description: "Merge the implementation branch into its base after every plan todo is complete. Checkouts the base branch, lists conflicts, and continues an in-progress merge.",
    ...toolPermission("git.write", "high"),
    timeoutMs: 10 * 60_000,
    mutate: true,
    parameters: toolSchema({
      choice: { type: "string", description: "Ignored. The tool always merges locally into the base branch." },
    }, []),
    async execute(_input, ctx) {
      const harness = ctx.harness;
      if (!harness) return failResult("no_harness", "finish_development_branch requires the harness.");
      ctx.skillSession?.emit?.({ type: "finish-branch", choice: "merge" });
      const result = await harness.finishBranch({ choice: "merge" });
      return okResult(result);
    },
  };
}
