import { AgentExecution } from "../AgentExecution";
import type { AgentLoop } from "../AgentLoop";
import { buildSystemPrompt } from "../systemPrompt";
import type { ContextBuilder } from "../ContextBuilder";
import { TaskGrantStore } from "../permissions/grants";
import type { PermissionMode, PermissionPrompter } from "../PermissionManager";
import type { PermissionRule } from "../permissions/types";
import type { ToolRegistry } from "../ToolRegistry";
import type { AgentEvent, AgentMessage, AgentStatus, AIModel } from "../types";
import type { HookBus } from "../hooks/HookBus";
import { createSkillTurnSession } from "../skills/session";
import { tryApplySlashSkill } from "../skills/invokeSkill";
import { skillRegistry } from "../skills/SkillRegistry";
import { specialistSkillPrompt } from "../workflow/prompts";
import { buildDelegateReport, formatHandoff } from "./report";
import { deniedToolsFor, resolveDefinitionTools } from "./tools";
import { minPermissionMode, type AgentDefinition, type DelegateReport } from "./types";
import { routeModels } from "../routing";
import type { ModelPolicyConfig } from "../routing/types";
import type { AgentHarnessHooks } from "../workflow/harness";
import type { WorkflowSessionState } from "../workflow/sessionState";

const CHILD_EVENTS = new Set<AgentEvent["type"]>([
  "permission-required",
  "tool-started",
  "tool-completed",
  "hook-denied",
  "hook-warned",
  "hook-fired",
  "fallback",
  "error",
  "cancelled",
  "step-started",
  "step-finished",
  "verification-started",
  "verification-check-started",
  "verification-check-completed",
  "verification-completed",
  "context-assembled",
  "compacted",
  "user-question",
  "skill-check",
  "design-gate",
  "permission-classifier",
  "subagent-task-started",
  "subagent-task-completed",
  "sdd-task-started",
  "sdd-task-completed",
  "llm-started",
  "assistant-message",
]);

export interface AgentInstanceOptions {
  definition: AgentDefinition;
  loop: AgentLoop;
  registry: ToolRegistry;
  contextBuilder: ContextBuilder;
  parentMode: PermissionMode;
  models: readonly AIModel[];
  fallbackEnabled: boolean;
  toolsEnabled: boolean;
  simulateFailureFor?: string[];
  parentSignal: AbortSignal;
  emit: (event: AgentEvent) => void;
  setStatus: (status: AgentStatus) => void;
  setActiveModel: (model: string | null) => void;
  automaticTools?: boolean;
  confirmDestructive?: boolean;
  yoloMode?: boolean;
  allowRules?: PermissionRule[];
  grants?: TaskGrantStore;
  onPermanentGrant?: (rule: PermissionRule) => void;
  getProjectRoot?: () => string | null;
  prompter?: PermissionPrompter;
  hooks?: HookBus;
  beforeToolExecute?: (tool: string, input: unknown) => Promise<void>;
  onRunning?: (running: boolean) => void;
  modelPolicy?: ModelPolicyConfig;
  workflow?: WorkflowSessionState;
  harness?: AgentHarnessHooks;
}

export class AgentInstance {
  readonly definition: AgentDefinition;
  readonly grants: TaskGrantStore;
  readonly messages: AgentMessage[] = [];
  private readonly controller = new AbortController();
  private readonly options: AgentInstanceOptions;
  private running = false;
  private durationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: AgentInstanceOptions) {
    this.definition = options.definition;
    this.options = options;
    this.grants = options.grants ?? new TaskGrantStore();
  }

  get id() {
    return this.definition.id;
  }

  get tools() {
    return resolveDefinitionTools(this.definition, this.options.registry);
  }

  get permissionMode() {
    return minPermissionMode(this.options.parentMode, this.definition.permissionMode);
  }

  get isRunning() {
    return this.running;
  }

  cancel() {
    this.controller.abort("user-cancelled");
  }

  async run(goal: string, handoff: readonly DelegateReport[] = []): Promise<DelegateReport> {
    if (this.running) {
      throw new Error(`Specialist "${this.definition.id}" is already running.`);
    }
    this.running = true;
    this.options.onRunning?.(true);
    const requestId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: formatHandoff(goal, handoff),
      timestamp: Date.now(),
    };
    this.messages.splice(0, this.messages.length, userMessage);

    const timeout = new AbortController();
    this.durationTimer = setTimeout(() => {
      timeout.abort("agent-duration");
    }, this.definition.maxDurationMs);
    const signal = AbortSignal.any([
      this.options.parentSignal,
      this.controller.signal,
      timeout.signal,
    ]);

    try {
      const skillSession = createSkillTurnSession(this.grants, undefined, this.options.workflow);
      userMessage.content = await tryApplySlashSkill(
        userMessage.content,
        skillRegistry,
        skillSession,
        this.options.registry,
        Boolean(this.options.getProjectRoot?.()),
      );
      const context = await this.options.contextBuilder.build(this.messages, this.options.toolsEnabled);
      this.options.emit({
        type: "context-assembled",
        tokensUsed: context.assembled.tokensUsed,
        trace: context.assembled.trace,
        slices: context.assembled.slices.map((slice) => ({
          id: slice.id,
          source: slice.source,
          tokens: slice.tokens,
          included: true,
          meta: slice.meta,
        })),
      });
      skillSession.emit = (event) => this.options.emit(event);
      for (const skill of skillSession.invoked) {
        this.options.emit({
          type: "skill-selected",
          skillId: skill.id,
          name: skill.name,
          reason: `Invoked with /${skill.id}`,
          version: skill.version,
        });
      }
      const extra = specialistSkillPrompt(
        this.definition.id,
        this.options.workflow?.invokedSkillIds ?? [],
      );
      const systemPrompt = [this.definition.instructions, extra, buildSystemPrompt(context.assembled, this.options.toolsEnabled)]
        .filter(Boolean)
        .join("\n\n");
      const execution = new AgentExecution({
        requestId,
        messageId,
        userMessage,
        baseMessages: context.messages,
      });
      const result = await this.options.loop.run({
        execution,
        models: routeModels({
          goal,
          ordered: this.options.models,
          hints: { specialistId: this.definition.id },
          policy: this.options.modelPolicy,
          pin: this.definition.modelPreference,
        }).models,
        fallbackEnabled: this.options.fallbackEnabled,
        systemPrompt,
        toolsEnabled: this.options.toolsEnabled,
        simulateFailureFor: this.options.simulateFailureFor,
        signal,
        emit: (event) => this.forward(event),
        setStatus: (status) => this.forwardStatus(status),
        setActiveModel: this.options.setActiveModel,
        automaticTools: this.options.automaticTools,
        permissionMode: this.permissionMode,
        confirmDestructive: this.options.confirmDestructive,
        yoloMode: this.options.yoloMode,
        allowRules: this.options.allowRules,
        onPermanentGrant: this.options.onPermanentGrant,
        getProjectRoot: this.options.getProjectRoot,
        prompter: this.options.prompter,
        hooks: this.options.hooks,
        beforeToolExecute: this.options.beforeToolExecute,
        allowedTools: this.definition.tools,
        maxSteps: this.definition.maxSteps,
        grants: this.grants,
        deniedTools: deniedToolsFor(this.definition, this.options.registry),
        skillSession,
        isSubagent: true,
        workflow: this.options.workflow,
        harness: this.options.harness,
      });
      this.messages.push({
        id: messageId,
        role: "assistant",
        content: result.content,
        timestamp: Date.now(),
      });
      return buildDelegateReport(this.definition.id, result.content, execution.toolCalls);
    } finally {
      if (this.durationTimer !== null) {
        clearTimeout(this.durationTimer);
        this.durationTimer = null;
      }
      this.running = false;
      this.options.onRunning?.(false);
    }
  }

  private forward(event: AgentEvent) {
    if (CHILD_EVENTS.has(event.type)) this.options.emit(event);
  }

  private forwardStatus(status: AgentStatus) {
    if (status === "completed") return;
    this.options.setStatus(status);
  }
}
