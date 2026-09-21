import { useAgentStore } from "../../stores/agentStore";
import { useAccountStore } from "../../stores/accountStore";
import { activePlan, planByPath, usePlanStore } from "../../stores/planStore";
import { bindContinuingProjectPlan } from "./plans/bindProjectPlan";
import { useProjectStore } from "../../stores/projectStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { CustomAIModel } from "../../types/settings";
import { processApi } from "../tauri/processApi";
import { attachConversationPersistence } from "../storage/session";
import type { AIService } from "./AIService";
import { AgentExecution } from "./AgentExecution";
import { AgentLoop } from "./AgentLoop";
import { listAvailableModels } from "./config";
import type { ContextFileStore } from "./context/types";
import { budgetFromChars } from "./context/budget";
import { ContextBuilder } from "./ContextBuilder";
import { ContextManager } from "./ContextManager";
import { AIProviderCancelledError, toUserMessage } from "./errors";
import { FallbackManager } from "./FallbackManager";
import { agentLogger } from "./logger";
import { usageMetrics, type UsageMetrics } from "./metrics";
import { ModelRouter } from "./ModelRouter";
import { GatewayModelProvider } from "./ModelProvider";
import { PermissionManager, sessionModeFromSettings, type ApprovalDecision, type PermissionMode, type PermissionPrompter } from "./PermissionManager";
import { TaskGrantStore } from "./permissions/grants";
import { upsertAllowRule } from "./permissions/policy";
import type { PermissionRule } from "./permissions/types";
import { registerBuiltinTools } from "./registerBuiltinTools";
import { invokedModelPin, tryApplySlashSkill } from "./skills/invokeSkill";
import { createSkillTurnSession } from "./skills/session";
import { skillRegistry } from "./skills/SkillRegistry";
import {
  CompactionManager,
  compactionManager,
  createSessionManager,
  INTERRUPTED_TOOL_ERROR,
  isInterruptedTool,
  MemoryManager,
  memoryManager,
  SESSION_COMPACT_PREFIX,
  SessionManager,
  sessionManager,
  type ProcessJobRef,
  type SessionSnapshot,
} from "./session";
import { HookBus, registerBuiltinHooks } from "./hooks";
import type { HookDecision } from "./hooks/types";
import { fileSystemService } from "../filesystem/FileSystemService";
import { toolRegistry, type ToolRegistry } from "./ToolRegistry";
import type {
  AgentEvent,
  AgentMessage,
  AgentRuntimeSnapshot,
  AgentStatus,
  RuntimeContext,
} from "./types";
import { VercelAIService } from "./VercelAIService";
import { buildSystemPrompt } from "./systemPrompt";
import { WorkflowEngine } from "./workflows/WorkflowEngine";
import {
  VerificationEngine,
  VerificationService,
  commandCheckRunner,
  projectVerifyFiles,
} from "./verification";
import type { VerificationRunInput } from "./verification/types";
import { ToolExecutor } from "./ToolExecutor";
import { classifyPermission } from "./permissionClassifier";
import {
  RecoveryManager,
  nativeRecoveryGit,
  shouldCreateCheckpoint,
} from "./recovery";
import { NestedAgentError } from "./agents/errors";
import { AgentOrchestrator } from "./agents";
import { routeModels } from "./routing";
import { EventTracer } from "./observability";
import { TaskManager, taskManager } from "./tasks";
import {
  ChangeTrackingService,
  createDefaultChangeTracking,
  type TrackingIdentity,
} from "../review";
import type {
  TurnRequest,
  TurnResult,
  TurnRunner,
  WorkflowApprovalDecision,
  WorkflowApprovalRequest,
  WorkflowContext,
} from "./workflows/types";
import type { ModelPolicyConfig } from "./routing/types";
import { gitApi, githubApi } from "../tauri/githubApi";
import { projectApi } from "../tauri/projectApi";
import { ensureBranchForPush, isDetachedGitBranch, sanitizeAgentBranchName } from "./tools/gitBranch";
import { WorkflowSessionState, shouldCloseImplementationCycle } from "./workflow/sessionState";
import { isPlanDocumentWrite, pathFromToolInput } from "./workflow/planPath";
import {
  cycleInteractionMode,
  MODE_LABELS,
  modeSystemOverlay,
  planToAgentBlocked,
  type AgentInteractionMode,
} from "./modes";
import type {
  AgentHarnessHooks,
  AgentSpawnInput,
  FinishBranchInput,
  GitBranchInput,
  GitBranchResult,
  UserQuestionAnswer,
  UserQuestionRequest,
} from "./workflow/harness";
import { COMPACT_SYSTEM } from "./workflow/prompts";
import { KnowledgeReflector } from "./knowledge/KnowledgeReflector";
import { applyProposal } from "./knowledge/applyProposal";
import { graphService } from "../graph/GraphService";

export const MAX_PLAN_NUDGES = 1;
export const MAX_BUILD_NUDGES = 16;
export const PLAN_NUDGE_MESSAGE = "Plan mode requires a structured plan. Dispatch at least two explore subagents (agent, subagent_type explore) in the same response if create_plan failed because explores are required, then call create_plan with the plan name, overview, body, and one todo per implementable task. Same-turn explores then create_plan is allowed. If create_plan failed for another reason, the plan was not created: fix the body so each todo has a matching section, then call create_plan again. Do not tell the user the plan exists. Do not tell them to click Build. Do not end the turn with free text only.";
export const BUILD_NUDGE_MESSAGE = "The plan still has unfinished todos. Continue with the next pending or in_progress todo now. Call update_plan_todo with status in_progress, implement it, then mark it completed. Do not end the turn while plan todos remain pending or in_progress. After completing a todo, start the next one immediately. Stop only if you are blocked.";

export function shouldNudgePlanMode(
  interactionMode: AgentInteractionMode,
  _runToolNames: readonly string[],
  session?: { designApproved?: unknown; planPath?: string | null } | null,
): boolean {
  if (interactionMode !== "plan") return false;
  if (!session?.designApproved) return false;
  if (session.planPath) return false;
  return true;
}

export function planHasUnfinishedTodos(plan?: { status?: string; todos?: { status: string }[] } | null): boolean {
  if (!plan || plan.status === "done") return false;
  return (plan.todos ?? []).some((todo) => todo.status === "pending" || todo.status === "in_progress");
}

export function completedPlanTodoCount(plan?: { todos?: { status: string }[] } | null): number {
  return (plan?.todos ?? []).filter((todo) => todo.status === "completed").length;
}

export function shouldNudgeBuildExecution(
  interactionMode: AgentInteractionMode,
  session?: { planApproved?: boolean } | null,
  plan?: { status?: string; todos?: { status: string }[] } | null,
): boolean {
  if (interactionMode !== "agent") return false;
  if (!session?.planApproved) return false;
  if (plan?.status !== "building") return false;
  return planHasUnfinishedTodos(plan);
}

export function buildMadeProgress(
  before: { completed: number; tools: number },
  after: { completed: number; tools: number },
): boolean {
  return after.completed > before.completed || after.tools > before.tools;
}

export interface AgentRuntimeSettings {
  defaultModel: string;
  fallbackEnabled: boolean;
  modelOrder: string[];
  customModels?: CustomAIModel[];
  simulateFailureFor: string[];
  automaticTools: boolean;
  permissionMode?: PermissionMode;
  confirmDestructive?: boolean;
  yoloMode?: boolean;
  permissionWhitelist?: PermissionRule[];
  modelPolicy?: ModelPolicyConfig;
  maxAgentSteps?: number | null;
  maxToolCalls?: number | null;
}

export interface AgentRuntimeDependencies {
  aiService: AIService;
  modelRouter?: ModelRouter;
  fallbackManager?: FallbackManager;
  contextManager?: ContextManager;
  contextBuilder?: ContextBuilder;
  metrics?: UsageMetrics;
  getSettings?: () => AgentRuntimeSettings;
  getProjectRoot?: () => string | null;
  getProjectId?: () => string | null;
  getConversationId?: () => string;
  getAccountId?: () => string | null;
  sessions?: SessionManager;
  compaction?: CompactionManager;
  memory?: MemoryManager;
  killJob?: (jobId: string) => Promise<void>;
  hooks?: HookBus;
  verification?: import("./verification").VerificationEngine;
  checkRunner?: import("./verification").CheckRunner;
  recovery?: RecoveryManager;
  registry?: ToolRegistry;
  files?: ContextFileStore;
  forceCheckpoint?: boolean;
  tasks?: TaskManager;
  changeTracking?: ChangeTrackingService;
  knowledgeReflector?: KnowledgeReflector;
}

export class AgentRuntime {
  private readonly listeners = new Set<(event: AgentEvent) => void>();
  private readonly messages: AgentMessage[] = [];
  private readonly modelRouter: ModelRouter;
  private readonly contextBuilder: ContextBuilder;
  private readonly getSettings: () => AgentRuntimeSettings;
  private readonly getProjectRoot: () => string | null;
  private readonly getProjectId: () => string | null;
  private readonly getConversationId: () => string;
  private readonly getAccountId: () => string | null;
  private runtimeContext: RuntimeContext | null = null;
  private readonly loop: AgentLoop;
  private readonly verificationEngine: VerificationEngine;
  private readonly verificationService: VerificationService;
  private verifyController: AbortController | null = null;
  private readonly aiService: AIService;
  private readonly sessions: SessionManager;
  private readonly compaction: CompactionManager;
  private readonly memory: MemoryManager;
  private readonly killJob: (jobId: string) => Promise<void>;
  private readonly hooks: HookBus;
  private readonly engine: WorkflowEngine;
  private readonly orchestrator: AgentOrchestrator;
  private readonly metrics: UsageMetrics;
  private readonly permissionWaiters = new Map<string, (decision: ApprovalDecision) => void>();
  private readonly workflowWaiters = new Map<string, (decision: WorkflowApprovalDecision) => void>();
  private readonly prompter: PermissionPrompter = {
    prompt: (request) => new Promise((resolve) => {
      this.permissionWaiters.set(request.id, resolve);
    }),
  };
  private controller: AbortController | null = null;
  private status: AgentStatus = "idle";
  private activeModel: string | null = null;
  private execution: AgentExecution | null = null;
  private processJobs: ProcessJobRef[] = [];
  private activeSessionId: string | null = null;
  private lastRunId: string | null = null;
  private lastMessageId: string | null = null;
  private busy = false;
  private workflowContext: WorkflowContext | null = null;
  private lastGoal: string | null = null;
  private readonly recovery: RecoveryManager;
  private readonly registry: ToolRegistry;
  private readonly files: ContextFileStore;
  private readonly forceCheckpoint: boolean;
  private readonly toolInputs = new Map<string, unknown>();
  private readonly tasks: TaskManager;
  private readonly tracer: EventTracer;
  private activeTaskId: string | null = null;
  private readonly changeTracking: ChangeTrackingService;
  private readonly knowledge: KnowledgeReflector;
  private runToolNames: string[] = [];
  private runFilePaths: string[] = [];
  readonly workflowSession = new WorkflowSessionState();
  private readonly questionWaiters = new Map<string, (answer: UserQuestionAnswer) => void>();

  constructor(dependencies: AgentRuntimeDependencies) {
    this.modelRouter = dependencies.modelRouter ?? new ModelRouter();
    this.contextBuilder = dependencies.contextBuilder
      ?? new ContextBuilder(dependencies.contextManager ?? new ContextManager());
    this.getSettings = dependencies.getSettings ?? (() => {
      const settings = useSettingsStore.getState();
      const override = useProjectStore.getState().projectSettings.defaultModel;
      const defaultModel = typeof override === "string" && override.trim()
        ? override
        : settings.defaultModel;
      return {
        defaultModel,
        fallbackEnabled: settings.fallbackEnabled,
        modelOrder: settings.modelOrder,
        customModels: settings.customModels,
        simulateFailureFor: settings.simulateFailureFor,
        automaticTools: settings.automaticTools,
        permissionMode: settings.permissionMode,
        confirmDestructive: settings.confirmDestructive,
        yoloMode: settings.yoloMode,
        permissionWhitelist: settings.permissionWhitelist,
        modelPolicy: settings.modelPolicy,
        maxAgentSteps: settings.maxAgentSteps,
        maxToolCalls: settings.maxToolCalls,
      };
    });
    const editorRoot = dependencies.getProjectRoot ?? (() => (
      this.runtimeContext?.projectId
        ? useProjectStore.getState().currentProject?.rootPath ?? null
        : useProjectStore.getState().currentProject?.rootPath ?? null
    ));
    this.getProjectRoot = editorRoot;
    this.getProjectId = dependencies.getProjectId ?? (() => (
      this.runtimeContext?.projectId ?? useProjectStore.getState().currentProject?.id ?? null
    ));
    this.getConversationId = dependencies.getConversationId ?? (() => (
      this.runtimeContext?.conversationId ?? useAgentStore.getState().activeConversationId
    ));
    this.getAccountId = dependencies.getAccountId ?? (() => (
      this.runtimeContext?.accountId ?? useAccountStore.getState().currentAccount?.id ?? null
    ));
    this.sessions = dependencies.sessions ?? createSessionManager();
    this.compaction = dependencies.compaction ?? new CompactionManager();
    this.memory = dependencies.memory ?? memoryManager;
    this.killJob = dependencies.killJob ?? ((jobId) => processApi.kill(jobId));
    this.hooks = dependencies.hooks ?? new HookBus();
    this.hooks.observe((trace) => {
      this.emit({
        type: "hook-fired",
        event: trace.event,
        hook: trace.hook,
        result: trace.result,
        message: trace.message,
      });
    });
    registerBuiltinHooks(this.hooks);
    this.metrics = dependencies.metrics ?? usageMetrics;
    this.registry = dependencies.registry ?? toolRegistry;
    this.files = dependencies.files ?? runtimeFiles();
    this.verificationEngine = dependencies.verification ?? new VerificationEngine({ files: this.files });
    this.verificationService = new VerificationService({
      files: projectVerifyFiles(),
      engine: this.verificationEngine,
      getProjectId: () => this.getProjectId(),
      emit: (event) => this.emit(event),
    });
    this.forceCheckpoint = dependencies.forceCheckpoint === true;
    this.engine = new WorkflowEngine({
      onEvent: (event) => this.emit(event),
      id: () => this.lastRunId ?? crypto.randomUUID(),
    });
    this.loop = new AgentLoop({
      aiService: dependencies.aiService,
      fallbackManager: dependencies.fallbackManager ?? new FallbackManager(),
      metrics: this.metrics,
      registry: this.registry,
      verification: this.verificationEngine,
      checkRunner: dependencies.checkRunner,
    });
    this.aiService = dependencies.aiService;
    this.orchestrator = new AgentOrchestrator({
      loop: this.loop,
      contextBuilder: this.contextBuilder,
      registry: this.registry,
    });
    this.recovery = dependencies.recovery ?? new RecoveryManager({
      files: recoveryFiles(),
      git: nativeRecoveryGit,
    });
    this.tasks = dependencies.tasks ?? taskManager;
    this.tracer = new EventTracer(() => ({
      runId: this.lastRunId,
      sessionId: this.activeSessionId,
      taskId: this.activeTaskId,
    }));
    this.changeTracking = dependencies.changeTracking ?? createDefaultChangeTracking();
    this.changeTracking.setEmit((event) => this.emit(event));
    this.knowledge = dependencies.knowledgeReflector ?? new KnowledgeReflector({
      ai: dependencies.aiService,
      emit: (event) => this.emit(event),
      getEnabled: () => useSettingsStore.getState().knowledgeReflectEnabled !== false,
      getModels: () => {
        const settings = this.getSettings();
        return {
          ordered: listAvailableModels(settings.customModels),
          policy: settings.modelPolicy,
        };
      },
      applyProposal: async (proposal) => {
        const projectId = this.getProjectId();
        await applyProposal(proposal, {
          files: graphService.getFiles(),
          onSpecChanged: async (path, kind) => {
            if (!projectId) return;
            await graphService.updateFile(
              projectId,
              path,
              kind === "remove" ? "remove" : kind === "create" ? "create" : "modify",
            );
          },
        });
      },
    });
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getTrace() {
    return this.tracer.list();
  }

  getRunId() {
    return this.lastRunId;
  }

  setTraceSink(sink: import("./observability").EventTraceSink) {
    this.tracer.setSink(sink);
  }

  getTaskId() {
    return this.activeTaskId;
  }

  getChangeTracking() {
    return this.changeTracking;
  }

  private sessionPlan() {
    const path = this.workflowSession.planPath;
    if (!path) return null;
    return planByPath(usePlanStore.getState(), path);
  }

  private async refreshGitPanel() {
    try {
      const { useGitStore } = await import("../../stores/gitStore");
      await useGitStore.getState().refreshStatus();
    } catch {
      /* git panel is optional during tests */
    }
  }

  private scheduleKnowledgeReflect() {
    const plan = this.sessionPlan();
    this.knowledge.schedule({
      runId: this.lastRunId ?? "",
      projectId: this.getProjectId(),
      conversationId: this.getConversationId(),
      goal: this.lastGoal ?? "",
      messages: this.messages.map((message) => ({ role: message.role, content: message.content })),
      toolNames: [...this.runToolNames],
      filesChanged: [...this.runFilePaths],
      planUnfinished: this.workflowSession.skipProcess
        ? false
        : Boolean(this.workflowSession.planPath) && planHasUnfinishedTodos(plan),
    });
  }

  publish(event: AgentEvent) {
    this.emit(event);
  }

  private trackingIdentity(): TrackingIdentity {
    return {
      accountId: this.getAccountId() ?? "local-account",
      projectId: this.getProjectId() ?? "",
      runId: this.lastRunId ?? "",
      conversationId: this.getConversationId(),
      agentId: "coding-agent",
      model: this.activeModel ?? undefined,
    };
  }

  private async beforeMutatingTool(tool: string, input: unknown) {
    await this.recovery.prepareTool(tool, input);
    await this.changeTracking.prepareMutation(this.trackingIdentity(), tool, input);
  }

  private emit(event: AgentEvent) {
    this.tracer.ingest(event);
    this.listeners.forEach((listener) => listener(event));
    const checkpoint = this.recovery.checkpoint;
    if ((event.type === "error" || event.type === "cancelled") && checkpoint) {
      const extra: AgentEvent = { type: "recovery-available", checkpointId: checkpoint.id };
      this.tracer.ingest(extra);
      this.listeners.forEach((listener) => listener(extra));
    }
    void this.persistFromEvent(event);
  }

  private setStatus(status: AgentStatus) {
    this.status = status;
    if (this.execution) this.execution.status = status;
  }

  getState(): AgentRuntimeSnapshot {
    return {
      status: this.status,
      activeModel: this.activeModel,
      isStreaming: this.controller !== null || this.busy,
      messages: this.messages.map((message) => ({ ...message })),
      execution: this.execution?.snapshot(this.status) ?? null,
    };
  }

  reset() {
    this.loadMessages([]);
  }

  stashActiveWorkflow() {
    useAgentStore.getState().saveActiveWorkflow(this.workflowSession.snapshot());
  }

  adoptConversationWorkflow(snapshot?: import("./workflow/sessionState").WorkflowSessionPersist | null) {
    this.workflowSession.reset();
    if (snapshot) this.workflowSession.restore(snapshot);
    useAgentStore.getState().setAgentMode(this.workflowSession.interactionMode);
    useAgentStore.getState().setAgentWorkspace(this.workflowSession.agentBranch?.name ?? null);
  }

  loadMessages(messages: readonly AgentMessage[]) {
    this.cancel();
    this.replaceMessages(messages);
    this.activeModel = null;
    this.execution = null;
    this.processJobs = [];
    this.lastRunId = null;
    this.lastMessageId = null;
    this.lastGoal = null;
    this.busy = false;
    this.workflowContext = null;
    this.toolInputs.clear();
    this.activeTaskId = null;
    this.activeSessionId = null;
    this.tasks.clearActive();
    this.tracer.reset();
    this.recovery.reset();
    this.emit({ type: "recovery-cleared" });
    this.setStatus("idle");
  }

  setContext(context: RuntimeContext) {
    this.runtimeContext = { ...context };
  }

  clearContext() {
    this.runtimeContext = null;
    this.cancel();
  }

  getContext(): RuntimeContext | null {
    const projectId = this.getProjectId();
    const conversationId = this.getConversationId();
    const accountId = this.getAccountId();
    if (!projectId || !conversationId || !accountId) return this.runtimeContext;
    return this.runtimeContext ?? { accountId, projectId, conversationId };
  }

  isBusy() {
    return this.busy || this.controller !== null;
  }

  private replaceMessages(messages: readonly AgentMessage[]) {
    this.messages.splice(0, this.messages.length, ...messages.map((message) => ({ ...message })));
  }

  async sendMessage(content: string, options: { retry?: boolean; resume?: boolean } = {}): Promise<void> {
    const text = content.trim();
    if (!text || this.controller || this.busy) return;
    this.busy = true;
    this.lastGoal = text;
    const resume = options.resume === true;
    if (!options.retry) {
      if (!resume) {
        this.recovery.reset();
        this.emit({ type: "recovery-cleared" });
        this.workflowContext = null;
      }
      const userMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      this.messages.push(userMessage);
    } else {
      this.emit({ type: "recovery-dismissed" });
    }

    try {
      const { session, created } = await this.sessions.ensureActive({
        conversationId: this.getConversationId(),
        projectId: this.getProjectId(),
        goal: text,
      });
      this.activeSessionId = session.id;
      if (!options.retry || !this.activeTaskId) {
        this.tracer.reset();
        this.lastRunId = crypto.randomUUID();
        this.runToolNames = [];
        this.runFilePaths = [];
        const task = await this.tasks.create({
          title: text,
          projectId: this.getProjectId(),
          description: text,
        });
        this.activeTaskId = task.id;
        useAgentStore.getState().setRunTask({
          id: task.id,
          title: task.title,
          status: "running",
          progress: 0,
        });
        this.emit({ type: "task-started", taskId: task.id, title: task.title });
      } else if (!this.lastRunId) {
        this.lastRunId = crypto.randomUUID();
      }
      if (this.getProjectRoot()) {
        await this.hooks.loadProjectHooks(this.files).catch(() => undefined);
      }
      if (created) {
        this.reportHook(await this.hooks.emit({ event: "session_start" }), "session_start");
      }

      const promptDecision = await this.hooks.emit({
        event: "user_prompt_submit",
        prompt: text,
        projectRoot: this.getProjectRoot(),
      });
      this.reportHook(promptDecision, "user_prompt_submit");
      if (promptDecision.action === "deny") {
        this.setStatus("failed");
        await this.finishTask("failed");
        this.emit({
          type: "error",
          requestId: this.lastRunId ?? crypto.randomUUID(),
          message: promptDecision.message ?? "Blocked by hook.",
        });
        return;
      }

      const modeBefore = this.workflowSession.interactionMode;
      bindContinuingProjectPlan(this.workflowSession, text);
      const cycleIdle = shouldCloseImplementationCycle(this.workflowSession, this.sessionPlan(), text);
      const chatApprovals = this.workflowSession.beginUserTurn(text, { cycleIdle });
      if (this.workflowSession.interactionMode !== modeBefore) {
        this.emit({ type: "agent-mode", mode: this.workflowSession.interactionMode });
        this.emit({ type: "plan-mode", enabled: this.workflowSession.interactionMode === "plan" });
      }
      if (chatApprovals.designApproved) {
        const brief = [...this.messages].reverse().find((message) => message.role === "assistant")?.content.trim();
        if (brief) this.workflowSession.setDesignBrief(brief);
        this.emit({ type: "design-gate", reason: "approved", tool: "chat" });
      }

      const context = await this.engine.run(text, this.createRunner(), {
        goalKind: this.workflowSession.goalKind,
        skipProcess: this.workflowSession.skipProcess,
      });
      this.workflowContext = context;
      if (context.status === "rejected") {
        this.setStatus("cancelled");
        this.emit({ type: "cancelled", requestId: this.lastRunId ?? context.runId });
        return;
      }
      if (this.status === "failed" || this.status === "cancelled") {
        await this.finishTask("failed");
        return;
      }
      this.setStatus("completed");
      await this.finishTask("completed");
      this.emit({
        type: "completed",
        requestId: this.lastRunId ?? crypto.randomUUID(),
        messageId: this.lastMessageId ?? crypto.randomUUID(),
        model: this.activeModel ?? "",
      });
      this.scheduleKnowledgeReflect();
    } catch (error) {
      if (!(error instanceof AIProviderCancelledError) && this.status !== "failed" && this.status !== "cancelled") {
        this.setStatus("failed");
        this.emit({ type: "error", requestId: this.lastRunId ?? crypto.randomUUID(), message: toUserMessage(error) });
      }
      if (this.status !== "completed") await this.finishTask("failed");
    } finally {
      this.controller = null;
      this.busy = false;
      if (this.status === "failed" || this.status === "cancelled") {
        this.releaseStalePlanBuild();
      }
    }
  }

  private createRunner(): TurnRunner {
    return {
      runTurn: async (request) => {
        this.workflowContext = request.context;
        return this.runTurn(request);
      },
      waitApproval: (request) => this.waitWorkflowApproval(request),
    };
  }

  private orderedModels(settings: AgentRuntimeSettings) {
    const customModels = settings.customModels ?? [];
    const router = customModels.length > 0
      ? new ModelRouter(listAvailableModels(customModels))
      : this.modelRouter;
    return router.getModels(settings.modelOrder);
  }

  async runTurn(request: TurnRequest): Promise<TurnResult> {
    const settings = this.getSettings();
    const requestId = this.lastRunId ?? request.context.runId ?? crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const userMessage = [...this.messages].reverse().find((message) => message.role === "user");
    if (!userMessage) return { content: "" };
    this.lastRunId = requestId;
    this.lastMessageId = messageId;

    const toolsEnabled = this.registry.listEnabled().length > 0;
    const budget = budgetFromChars(useSettingsStore.getState().maxContextChars);
    if (this.compaction.needsCompact(this.messages, budget)) {
      await this.applyCompact("auto");
    }
    const grants = new TaskGrantStore();
    const skillSession = createSkillTurnSession(grants, (event) => this.emit(event), this.workflowSession);
    if (/^\/compact\b/i.test(userMessage.content.trim())) {
      await this.applyCompact("manual");
      userMessage.content = "Continue after compacting the conversation.";
      this.workflowSession.markSkillCheck();
    } else {
      userMessage.content = await tryApplySlashSkill(
        userMessage.content,
        skillRegistry,
        skillSession,
        this.registry,
        Boolean(this.getProjectRoot()),
      );
    }
    let context = await this.contextBuilder.build(this.messages, toolsEnabled);
    if (context.assembled.tokensUsed > budget.maxTokens) {
      await this.applyCompact("auto");
      context = await this.contextBuilder.build(this.messages, toolsEnabled);
    }
    const systemPrompt = [
      modeSystemOverlay(this.workflowSession.interactionMode, this.workflowSession),
      request.overlay,
      buildSystemPrompt(context.assembled, toolsEnabled),
    ]
      .filter(Boolean)
      .join("\n\n");
    const skillPin = invokedModelPin(skillSession.invoked);
    this.metrics.configure(settings.modelPolicy);
    const models = routeModels({
      goal: userMessage.content,
      ordered: this.orderedModels(settings),
      hints: {
        workflowStepIds: request.steps.map((step) => step.id),
        complexity: request.context.complexity,
      },
      policy: settings.modelPolicy,
      pin: skillPin,
    }).models;
    this.emit({
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
    skillSession.emit = (event) => this.emit(event);
    for (const skill of skillSession.invoked) {
      this.emit({
        type: "skill-selected",
        skillId: skill.id,
        name: skill.name,
        reason: `Invoked with /${skill.id}`,
        version: skill.version,
      });
    }
    if ((shouldCreateCheckpoint(request.context.complexity) || this.forceCheckpoint) && !this.recovery.checkpoint) {
      try {
        const checkpoint = await this.recovery.create();
        this.emit({ type: "recovery-checkpoint", checkpoint });
      } catch (error) {
        agentLogger.warn("Checkpoint failed", { message: toUserMessage(error) });
      }
    }
    this.controller = new AbortController();
    this.execution = new AgentExecution({
      requestId,
      messageId,
      userMessage,
      baseMessages: context.messages,
    });
    agentLogger.info("Request started", { requestId, step: request.steps.map((step) => step.id).join(",") });

    const execution = this.execution;
    const controller = this.controller;
    if (!execution || !controller) return { content: "" };
    const runLoop = () => this.loop.run({
        execution,
        models,
        fallbackEnabled: settings.fallbackEnabled,
        systemPrompt,
        toolsEnabled,
        simulateFailureFor: settings.simulateFailureFor,
        signal: controller.signal,
        emit: (event) => this.emit(event),
        setStatus: (status) => this.setStatus(status),
        setActiveModel: (model) => {
          this.activeModel = model;
        },
        automaticTools: settings.automaticTools,
        permissionMode: settings.permissionMode,
        confirmDestructive: settings.confirmDestructive,
        ...this.permissionSession(settings),
        getProjectRoot: () => this.getProjectRoot(),
        prompter: this.prompter,
        hooks: this.hooks,
        beforeToolExecute: (tool, input) => this.beforeMutatingTool(tool, input),
        grants,
        skillSession,
        workflow: this.workflowSession,
        harness: this.harness(),
        maxSteps: settings.maxAgentSteps ?? undefined,
        maxToolCalls: settings.maxToolCalls ?? undefined,
      });
    try {
      let result = await runLoop();
      let nudges = 0;
      while (
        nudges < MAX_PLAN_NUDGES
        && shouldNudgePlanMode(
          this.workflowSession.interactionMode,
          this.runToolNames,
          this.workflowSession,
        )
        && !controller.signal.aborted
      ) {
        nudges += 1;
        execution.baseMessages.push({
          id: crypto.randomUUID(),
          role: "system",
          content: PLAN_NUDGE_MESSAGE,
          timestamp: Date.now(),
        });
        result = await runLoop();
      }
      let buildNudges = 0;
      while (
        buildNudges < MAX_BUILD_NUDGES
        && shouldNudgeBuildExecution(
          this.workflowSession.interactionMode,
          this.workflowSession,
          activePlan(usePlanStore.getState()),
        )
        && !controller.signal.aborted
      ) {
        const before = {
          completed: completedPlanTodoCount(activePlan(usePlanStore.getState())),
          tools: this.runToolNames.length,
        };
        buildNudges += 1;
        execution.baseMessages.push({
          id: crypto.randomUUID(),
          role: "system",
          content: BUILD_NUDGE_MESSAGE,
          timestamp: Date.now(),
        });
        result = await runLoop();
        const after = {
          completed: completedPlanTodoCount(activePlan(usePlanStore.getState())),
          tools: this.runToolNames.length,
        };
        if (!buildMadeProgress(before, after)) break;
      }
      this.activeModel = result.model;
      this.messages.push({
        id: messageId,
        role: "assistant",
        content: result.content,
        timestamp: Date.now(),
      });
      agentLogger.info("Turn completed", { requestId, model: result.model });
      return { content: result.content, requestId, messageId, model: result.model };
    } finally {
      this.controller = null;
    }
  }

  private waitWorkflowApproval(request: WorkflowApprovalRequest) {
    this.setStatus("waiting_approval");
    this.emit({ type: "workflow-approval-required", ...request });
    return new Promise<WorkflowApprovalDecision>((resolve) => {
      this.workflowWaiters.set(request.id, resolve);
    });
  }

  cancel() {
    for (const job of this.processJobs) {
      void this.killJob(job.jobId).catch(() => undefined);
    }
    this.verifyController?.abort("user-cancelled");
    this.controller?.abort("user-cancelled");
    this.orchestrator.cancel();
    for (const [id, resolve] of this.permissionWaiters) {
      resolve("deny");
      this.permissionWaiters.delete(id);
    }
    for (const [id, resolve] of this.workflowWaiters) {
      resolve("deny");
      this.workflowWaiters.delete(id);
    }
  }

  cancelVerification() {
    this.verifyController?.abort("user-cancelled");
  }

  verification() {
    return this.verificationService;
  }

  async runVerification(filter: {
    kinds?: VerificationRunInput["kinds"];
    customNames?: string[];
    expectedPaths?: string[];
  } = {}) {
    if (!this.getProjectRoot()) throw new Error("No project is currently open.");
    if (this.controller) throw new Error("The agent is already running.");
    if (this.verifyController) throw new Error("Verification is already running.");
    const settings = this.getSettings();
    const grants = new TaskGrantStore();
    const requestId = crypto.randomUUID();
    this.verifyController = new AbortController();
    const signal = this.verifyController.signal;
    this.setStatus("verifying");
    try {
      const permissions = new PermissionManager({
        mode: sessionModeFromSettings(settings.automaticTools !== false, settings.permissionMode),
        confirmDestructive: settings.confirmDestructive !== false,
        registry: this.registry,
        getProjectRoot: () => this.getProjectRoot(),
        prompter: this.prompter,
        grants,
        allowRules: settings.permissionWhitelist,
        yoloMode: settings.yoloMode === true,
        onAsk: (request) => {
          this.setStatus("waiting_approval");
          this.emit({ type: "permission-required", ...request });
        },
        classifier: this.aiService.completeText
          ? async (input) => {
            const model = this.orderedModels(settings)[0]?.id ?? "";
            this.metrics.request("LLM-PERM");
            this.emit({ type: "llm-started", requestId, kind: "perm", model });
            return classifyPermission(this.aiService, { ...input, model }, signal);
          }
          : undefined,
        onClassifier: (event) => {
          this.emit({ type: "permission-classifier", ...event });
        },
        onPermanentGrant: this.permissionSession(settings).onPermanentGrant,
      });
      const executor = new ToolExecutor({
        registry: this.registry,
        permissions,
        getProjectRoot: () => this.getProjectRoot(),
        hooks: this.hooks,
        onHook: (decision, event) => {
          if (decision.action === "deny") {
            this.emit({ type: "hook-denied", event, message: decision.message ?? "Blocked by hook.", metadata: decision.metadata });
          } else if (decision.action === "warn" && decision.message) {
            this.emit({ type: "hook-warned", event, message: decision.message, metadata: decision.metadata });
          }
        },
      });
      const runner = commandCheckRunner((command) => executor.run("run_command", { command }, { signal }));
      return await this.verificationService.run({
        runner,
        requestId,
        trigger: "manual",
        runId: this.lastRunId ?? requestId,
        kinds: filter.kinds,
        customNames: filter.customNames,
        expectedPaths: filter.expectedPaths,
        signal,
        emit: (event) => this.emit(event),
        engine: this.verificationEngine,
      });
    } finally {
      this.verifyController = null;
      if (!this.controller) this.setStatus("idle");
    }
  }

  async recoverSession(projectId?: string | null) {
    const interrupted = await this.sessions.recover(projectId ?? this.getProjectId());
    useAgentStore.getState().setInterruptedSessions(interrupted);
    return interrupted;
  }

  async resumeTask(sessionId: string) {
    if (this.controller) return;
    const restored = await this.sessions.restore(sessionId);
    if (!restored) return;
    const { session, snapshot } = restored;
    this.activeSessionId = session.id;
    this.lastRunId = snapshot.runId ?? null;
    this.processJobs = [];
    this.activeModel = snapshot.currentModel;
    this.replaceMessages(snapshot.messages);
    this.execution = null;
    this.workflowContext = snapshot.workflow ?? null;
    this.workflowSession.restore(snapshot.workflowSession);
    useAgentStore.getState().setAgentMode(this.workflowSession.interactionMode);
    useAgentStore.getState().setAgentWorkspace(this.workflowSession.agentBranch?.name ?? null);
    if (this.workflowSession.planPath) {
      const planPath = this.workflowSession.planPath;
      void import("../../stores/planStore").then(({ usePlanStore }) => usePlanStore.getState().loadPlan(planPath));
    }
    this.lastGoal = session.currentGoal;
    if (snapshot.recovery) {
      this.recovery.restore(snapshot.recovery);
      this.emit({ type: "recovery-checkpoint", checkpoint: this.recovery.snapshot() });
    } else {
      this.recovery.reset();
      this.emit({ type: "recovery-cleared" });
    }
    this.setStatus("idle");
    useAgentStore.getState().syncActiveMessages(snapshot.messages);
    useAgentStore.setState({
      toolCalls: snapshot.toolCalls.map((call) => ({ ...call })),
      filesChanged: [...snapshot.filesChanged],
      tasks: snapshot.currentTask ? [{ ...snapshot.currentTask }] : [],
      status: "idle",
      error: null,
    });
    const remaining = await this.sessions.listInterrupted(this.getProjectId());
    useAgentStore.getState().setInterruptedSessions(remaining);
    this.emit({
      type: "run-resumed",
      sessionId,
      requestId: snapshot.runId ?? sessionId,
    });
    const interrupted = snapshot.toolCalls.filter((call) => isInterruptedTool(call));
    for (const call of interrupted) {
      this.messages.push({
        id: crypto.randomUUID(),
        role: "system",
        content: `Tool ${call.tool} was interrupted (${INTERRUPTED_TOOL_ERROR}) and was not replayed.`,
        timestamp: Date.now(),
      });
    }
    await this.sendMessage("Resume the interrupted task. Do not replay completed tool calls.", { resume: true });
  }

  private permissionSession(settings: AgentRuntimeSettings) {
    const allowRules = [...(settings.permissionWhitelist ?? [])];
    return {
      yoloMode: settings.yoloMode === true,
      allowRules,
      onPermanentGrant: (rule: PermissionRule) => {
        const next = upsertAllowRule(allowRules, rule);
        allowRules.splice(0, allowRules.length, ...next);
        useSettingsStore.getState().update("permissionWhitelist", next);
      },
    };
  }

  resolvePermission(id: string, decision: ApprovalDecision) {
    const waiter = this.permissionWaiters.get(id);
    if (!waiter) return;
    this.permissionWaiters.delete(id);
    this.emit({ type: "approval-resolved", id, kind: "permission", decision });
    this.resumeAfterApproval();
    waiter(decision);
  }

  resolveWorkflowApproval(id: string, decision: WorkflowApprovalDecision) {
    const question = this.questionWaiters.get(id);
    if (question) {
      this.questionWaiters.delete(id);
      this.emit({ type: "approval-resolved", id, kind: "workflow", decision });
      this.resumeAfterApproval();
      question({ selected: decision === "allow" ? "yes" : "no", allow: decision === "allow" });
      return;
    }
    const waiter = this.workflowWaiters.get(id);
    if (!waiter) return;
    this.workflowWaiters.delete(id);
    this.emit({ type: "approval-resolved", id, kind: "workflow", decision });
    this.resumeAfterApproval();
    waiter(decision);
  }

  async retryRecovery() {
    const goal = this.lastGoal;
    if (!goal || this.controller || this.busy) return;
    await this.sendMessage(goal, { retry: true });
  }

  continueRecovery() {
    this.emit({ type: "recovery-dismissed" });
  }

  resolveUserQuestion(id: string, selected: string, allow = true) {
    const waiter = this.questionWaiters.get(id);
    if (!waiter) return;
    this.questionWaiters.delete(id);
    this.emit({ type: "approval-resolved", id, kind: "workflow", decision: allow ? "allow" : "deny", selected });
    this.resumeAfterApproval();
    waiter({ selected, allow });
  }

  setInteractionMode(mode: AgentInteractionMode) {
    if (this.workflowSession.interactionMode === mode) {
      return { ok: true, message: `${MODE_LABELS[mode]} mode already on.` };
    }
    this.workflowSession.setInteractionMode(mode);
    this.emit({ type: "agent-mode", mode });
    this.emit({ type: "plan-mode", enabled: mode === "plan" });
    return { ok: true, message: `${MODE_LABELS[mode]} mode on.` };
  }

  cycleInteractionMode() {
    return this.setInteractionMode(cycleInteractionMode(this.workflowSession.interactionMode));
  }

  switchAgentMode(mode: AgentInteractionMode) {
    if (mode !== "agent" && mode !== "plan") {
      return { ok: false, message: "Ask and Debug can only be selected by the user." };
    }
    const blocked = planToAgentBlocked(this.workflowSession, mode);
    if (blocked) return { ok: false, message: blocked };
    return this.setInteractionMode(mode);
  }

  togglePlanMode() {
    return this.cycleInteractionMode();
  }

  private enterPlanModeInternal() {
    return this.switchAgentMode("plan");
  }

  private harness(): AgentHarnessHooks {
    return {
      workflow: this.workflowSession,
      isSubagent: false,
      askUser: (request) => this.askUser(request),
      spawnAgent: (input) => this.spawnAgent(input),
      enterPlanMode: () => this.enterPlanModeInternal(),
      switchAgentMode: (mode) => this.switchAgentMode(mode),
      ensureAgentBranch: (input) => this.ensureAgentBranch(input),
      finishBranch: (input) => this.finishBranch(input),
      compactNow: () => this.applyCompact("manual"),
    };
  }

  private releaseStalePlanBuild() {
    usePlanStore.getState().releaseBuilding();
  }

  private resumeAfterApproval() {
    if (this.status === "waiting_approval") this.setStatus("tool_result");
  }

  private askUser(request: UserQuestionRequest): Promise<UserQuestionAnswer> {
    this.setStatus("waiting_approval");
    const choices = request.options;
    const labels = choices.map((choice) => choice.label);
    this.emit({
      type: "user-question",
      id: request.id,
      prompt: request.prompt,
      options: labels,
      choices,
      kind: request.kind,
    });
    useAgentStore.getState().setPendingWorkflowApproval({
      id: request.id,
      runId: this.lastRunId ?? request.id,
      stepId: request.kind ?? "question",
      summary: request.prompt,
      options: choices,
    });
    return new Promise((resolve) => {
      this.questionWaiters.set(request.id, resolve);
    });
  }

  private async spawnAgent(input: AgentSpawnInput) {
    const settings = this.getSettings();
    const type = input.subagentType;
    if (this.workflowSession.goalKind === "explain") {
      this.metrics.error("explain-regression", 0);
      this.emit({
        type: "design-gate",
        reason: "Explain prompts should not spawn implement subagents.",
        tool: "agent",
      });
    }
    if (type === "implement" && this.workflowSession.criticalReviewOpen) {
      throw new Error("Critical review is open; the next implement task is blocked.");
    }
    if (type === "implement" && !this.workflowSession.planApproved && !this.workflowSession.skipProcess) {
      throw new Error("Implement subagents require an approved plan.");
    }
    if (type === "implement") this.workflowSession.implementRound += 1;
    const taskId = crypto.randomUUID();
    this.emit({
      type: "subagent-task-started",
      taskId,
      agentId: type,
      title: input.description,
    });
    this.emit({
      type: "agent-started",
      runId: this.lastRunId ?? "",
      agentId: type,
      name: input.description,
      taskId,
    });
    const ordered = this.orderedModels(settings);
    const models = type === "implement" && this.workflowSession.implementRound >= 4 && ordered.length > 1
      ? [ordered[ordered.length - 1]!, ...ordered.slice(0, -1)]
      : ordered;
    const instance = this.orchestrator.getManager().spawn(type, {
      parentKey: `${this.lastRunId ?? "parent"}:${type}:${taskId}`,
      instanceKey: `${this.lastRunId ?? "parent"}:${type}:${taskId}`,
      parentMode: sessionModeFromSettings(settings.automaticTools, settings.permissionMode),
      models,
      fallbackEnabled: settings.fallbackEnabled,
      toolsEnabled: true,
      signal: this.controller?.signal ?? new AbortController().signal,
      emit: (event) => this.emit(tagSubagentToolEvent(event, taskId, type)),
      setStatus: (status) => this.setStatus(status),
      setActiveModel: (model) => {
        this.activeModel = model;
      },
      automaticTools: settings.automaticTools,
      confirmDestructive: settings.confirmDestructive,
      ...this.permissionSession(settings),
      getProjectRoot: () => this.getProjectRoot(),
      prompter: this.prompter,
      hooks: this.hooks,
      beforeToolExecute: (tool, payload) => this.beforeMutatingTool(tool, payload),
      modelPolicy: settings.modelPolicy,
      workflow: this.workflowSession.child(),
      harness: {
        ...this.harness(),
        isSubagent: true,
        spawnAgent: async () => {
          throw new NestedAgentError();
        },
      },
    });
    const report = await instance.run(input.prompt);
    this.emit({
      type: "agent-completed",
      runId: this.lastRunId ?? "",
      agentId: type,
      name: input.description,
      report,
      taskId,
    });
    this.emit({
      type: "subagent-task-completed",
      taskId,
      agentId: type,
    });
    if (type === "review" && report.issues.some((issue) => /critical/i.test(issue))) {
      this.workflowSession.criticalReviewOpen = true;
    } else if (type === "implement") {
      this.workflowSession.criticalReviewOpen = false;
    }
    return report;
  }

  private async ensureAgentBranch(input: GitBranchInput): Promise<GitBranchResult> {
    const current = this.workflowSession.agentBranch;
    const status = await projectApi.gitStatus();
    if (input.action === "status") {
      return {
        message: current
          ? `Implementation branch ${current.name} (base ${current.base}). HEAD is ${status.branch}.`
          : `No implementation branch yet. HEAD is ${status.branch}.`,
        branch: current?.name ?? status.branch,
        base: current?.base,
      };
    }
    if (current && (status.branch === current.name || status.branch === current.name.replace(/^refs\/heads\//, ""))) {
      return {
        message: `Already on implementation branch ${current.name} (base ${current.base}).`,
        branch: current.name,
        base: current.base,
      };
    }
    if (this.workflowSession.goalKind === "explain") {
      this.metrics.error("explain-regression", 0);
      this.emit({
        type: "design-gate",
        reason: "Explain prompts should not create an implementation branch.",
        tool: "git_branch",
      });
    }
    if (!status.clean) {
      const files = status.changedFiles.slice(0, 8).join(", ") || "uncommitted files";
      return {
        message: `Working tree is dirty (${files}). Call git_commit, then git_push if origin exists, then git_branch create. Do not stash. Do not use run_command for git.`,
      };
    }
    const requested = input.branch?.trim() || `kursor-${Date.now().toString(36)}`;
    const name = sanitizeAgentBranchName(requested);
    if (!name) {
      return { message: `Invalid branch name "${requested}".` };
    }
    const base = isDetachedGitBranch(status.branch) ? "HEAD" : status.branch;
    try {
      await gitApi.createBranch(name);
    } catch {
      await gitApi.checkout(name);
    }
    this.workflowSession.agentBranch = { name, base };
    this.emit({ type: "branch-created", branch: name, base });
    useAgentStore.getState().setAgentWorkspace(name);
    await this.refreshGitPanel();
    return {
      message: `Implementation branch ${name} (from ${base}). Editor checkout switched.`,
      branch: name,
      base,
    };
  }

  private async finishBranch(input: FinishBranchInput) {
    const agent = this.workflowSession.agentBranch;
    const feature = agent?.name;
    const base = agent?.base && agent.base !== "HEAD" ? agent.base : "main";

    if (input.choice === "keep") {
      this.emit({ type: "finish-branch", choice: "keep" });
      return { message: `Keeping branch ${feature ?? "current"}. Stay on it for later.` };
    }

    if (input.choice === "pr") {
      try {
        try {
          await ensureBranchForPush({
            status: () => projectApi.gitStatus(),
            checkout: (name) => gitApi.checkout(name),
            createBranch: (name, start) => gitApi.createBranch(name, start),
          }, feature);
        } catch {
          /* still attempt the push */
        }
        await gitApi.push();
        const repo = useProjectStore.getState().currentProject;
        const owner = repo?.githubOwner;
        const name = repo?.githubRepo;
        if (owner && name) {
          const head = feature ?? "HEAD";
          await githubApi.createPull(owner, name, `Kursor: ${head}`, head, base);
        }
        this.emit({ type: "finish-branch", choice: "pr" });
        await this.refreshGitPanel();
        return { message: `Branch finish: pr. Kept ${feature ?? "current"} for review against ${base}.` };
      } catch (error) {
        return { message: toUserMessage(error) };
      }
    }

    if (input.choice === "discard") {
      try {
        await gitApi.mergeAbort();
      } catch {
        /* no merge in progress */
      }
      if (feature) {
        try {
          await gitApi.checkout(base);
        } catch {
          /* base may be missing */
        }
        try {
          await gitApi.deleteBranch(feature, true);
        } catch {
          /* already gone */
        }
      }
      this.workflowSession.agentBranch = null;
      useAgentStore.getState().setAgentWorkspace(null);
      this.emit({ type: "finish-branch", choice: "discard" });
      await this.refreshGitPanel();
      return { message: `Discarded ${feature ?? "branch"} and returned to ${base}.` };
    }

    if (!feature) {
      return { message: "No implementation branch to merge." };
    }

    try {
      let result;
      try {
        result = await gitApi.mergeContinue();
      } catch {
        result = undefined;
      }
      if (!result || (!result.merged && !result.inProgress && result.conflicts.length === 0)) {
        const status = await projectApi.gitStatus();
        if (status.branch !== base) await gitApi.checkout(base);
        result = await gitApi.merge(feature);
      }
      if (!result.merged) {
        this.emit({
          type: "merge-conflicts",
          branch: feature,
          base,
          files: result.conflicts,
        });
        await this.refreshGitPanel();
        return {
          message: result.message || `Merge conflicts. Edit the files, then call finish_development_branch with choice merge again.`,
          conflicts: result.conflicts,
          merged: false,
        };
      }
      try {
        await gitApi.deleteBranch(feature, false);
      } catch {
        /* still exists */
      }
      this.workflowSession.agentBranch = null;
      useAgentStore.getState().setAgentWorkspace(null);
      this.emit({ type: "finish-branch", choice: "merge" });
      await this.refreshGitPanel();
      return { message: `Merged ${feature} into ${base}.`, merged: true };
    } catch (error) {
      return { message: toUserMessage(error), merged: false };
    }
  }

  async rollbackRecovery() {
    if (!this.recovery.checkpoint || this.controller || this.busy) return;
    try {
      const result = await this.recovery.rollback();
      this.emit({
        type: "recovery-rolled-back",
        restored: result.restored,
        skippedExternal: result.skippedExternal,
        deleted: result.deleted,
      });
      this.recovery.reset();
    } catch (error) {
      this.emit({
        type: "error",
        requestId: this.lastRunId ?? crypto.randomUUID(),
        message: toUserMessage(error),
      });
    }
  }

  private captureSnapshot(): SessionSnapshot {
    const store = useAgentStore.getState();
    return {
      messages: this.messages.map((message) => ({ ...message })),
      toolCalls: store.toolCalls.map((call) => ({ ...call })),
      currentTask: store.tasks.find((task) => task.status === "running")
        ?? store.tasks[store.tasks.length - 1]
        ?? null,
      filesChanged: [...store.filesChanged],
      currentModel: this.activeModel,
      agentState: this.status,
      processJobs: this.processJobs.map((job) => ({ ...job })),
      runId: this.lastRunId,
      compactSummary: this.messages.find((message) => message.content.startsWith(SESSION_COMPACT_PREFIX))?.content,
      workflow: this.workflowContext ?? undefined,
      workflowSession: this.workflowSession.snapshot(),
      recovery: this.recovery.checkpoint ? this.recovery.snapshot() : undefined,
    };
  }

  private async writeSnapshot(extras: { currentStep?: string; status?: "running" | "interrupted" | "completed" | "failed" | "cancelled" } = {}) {
    if (!this.activeSessionId) return;
    await this.sessions.snapshot(this.activeSessionId, this.captureSnapshot(), extras);
  }

  private async applyCompact(trigger: "auto" | "manual" = "auto") {
    this.reportHook(await this.hooks.emit({ event: "before_compaction" }), "before_compaction");
    const store = useAgentStore.getState();
    const active = this.sessions.getActive();
    const before = this.messages.length;
    const now = Date.now();
    const recent = this.workflowSession.compactTimes.filter((time) => now - time < 15_000);
    if (recent.length >= 1 && trigger === "auto") {
      this.emit({ type: "compact_boundary", trigger, thrashing: true });
      this.reportHook(await this.hooks.emit({ event: "after_compaction" }), "after_compaction");
      return;
    }
    const result = this.compaction.compact({
      messages: this.messages,
      toolCalls: store.toolCalls,
      currentTask: store.tasks.find((task) => task.status === "running") ?? null,
      filesChanged: store.filesChanged,
      currentModel: this.activeModel,
      currentGoal: active?.currentGoal ?? null,
      currentStep: active?.currentStep ?? this.status,
    });
    this.replaceMessages(result.keptMessages);
    const budget = budgetFromChars(useSettingsStore.getState().maxContextChars);
    if (this.compaction.needsCompact(this.messages, budget)) {
      await this.applyLlmCompact(trigger);
    }
    store.syncActiveMessages(this.messages);
    this.workflowSession.compactTimes.push(now);
    this.emit({ type: "compact_boundary", trigger });
    if (active) {
      await this.memory.persistCompact(active.projectId, active.conversationId, result);
      await this.sessions.snapshot(active.id, {
        ...this.captureSnapshot(),
        compactSummary: this.messages[0]?.content,
      });
    }
    this.emit({
      type: "compacted",
      summary: result.summary,
      kept: this.messages.length,
      dropped: Math.max(0, before - this.messages.length + 1),
    });
    this.reportHook(await this.hooks.emit({ event: "after_compaction" }), "after_compaction");
  }

  private async applyLlmCompact(trigger: "auto" | "manual") {
    const service = this.aiService;
    if (!service?.completeText) return;
    const settings = this.getSettings();
    const model = this.activeModel || this.orderedModels(settings)[0]?.id;
    if (!model) return;
      this.emit({ type: "llm-started", requestId: this.lastRunId ?? "", kind: "cmp", model });
    this.metrics.request("LLM-CMP");
    try {
      const transcript = this.messages
        .slice(0, -4)
        .map((message) => `${message.role}: ${message.content.slice(0, 800)}`)
        .join("\n");
      const extra = [
        this.workflowSession.designApproved ? `designApproved: ${JSON.stringify(this.workflowSession.designApproved)}` : "",
        this.workflowSession.planPath ? `planPath: ${this.workflowSession.planPath}` : "",
        this.workflowSession.agentBranch ? `agentBranch: ${this.workflowSession.agentBranch.name} from ${this.workflowSession.agentBranch.base}` : "",
      ].filter(Boolean).join("\n");
      const result = await service.completeText(
        [{
          id: crypto.randomUUID(),
          role: "user",
          content: `${extra}\n\n${transcript}`,
          timestamp: Date.now(),
        }],
        { model, systemPrompt: COMPACT_SYSTEM },
      );
      const summaryMessage: AgentMessage = {
        id: crypto.randomUUID(),
        role: "system",
        content: `${SESSION_COMPACT_PREFIX}\n${result.text}`,
        timestamp: Date.now(),
      };
      const tail = this.messages.slice(-4);
      this.replaceMessages([summaryMessage, ...tail]);
    } catch {
      this.emit({ type: "compact_boundary", trigger, thrashing: false });
    }
  }


  private async persistFromEvent(event: AgentEvent) {
    if (event.type === "tool-started") {
      this.toolInputs.set(event.id, event.input);
    }
    if (event.type === "tool-completed") {
      this.runToolNames.push(event.tool);
      const input = this.toolInputs.get(event.id) ?? {};
      const path = pathFromToolInput(input);
      if (path && !this.runFilePaths.includes(path)) this.runFilePaths.push(path);
      this.trackProcessJob(event.tool, event.output);
      this.toolInputs.delete(event.id);
      await this.recovery.track(event.tool, input, event.output);
      await this.changeTracking.recordMutation(this.trackingIdentity(), event.tool, event.id, input, event.output);
      if (this.recovery.checkpoint) {
        this.emit({ type: "recovery-checkpoint", checkpoint: this.recovery.snapshot() });
      }
      const written = planPathFromTool(event.tool, input);
      if (written) {
        this.workflowSession.planPath = written;
        this.emit({ type: "plan-written", path: written });
      }
    }
    if (event.type === "workflow-checkpoint") {
      await this.writeSnapshot({ currentStep: event.checkpoint.stepId, status: "running" });
      return;
    }
    if (event.type === "workflow-started") {
      await this.writeSnapshot({ currentStep: event.stepIds[0] ?? "planning", status: "running" });
      return;
    }
    if (event.type === "started") {
      this.lastRunId = event.requestId;
      await this.tasks.attachRun(event.requestId);
      await this.writeSnapshot({ currentStep: "planning", status: "running" });
      return;
    }
    if (event.type === "orchestration-started") {
      this.lastRunId = event.runId;
      await this.tasks.attachRun(event.runId);
      await this.writeSnapshot({ currentStep: event.agentIds[0] ?? "research", status: "running" });
      return;
    }
    if (event.type === "step-started") {
      await this.writeSnapshot({ currentStep: event.kind });
      return;
    }
    if (event.type === "tool-completed") {
      await this.writeSnapshot({ currentStep: "tool_call" });
      return;
    }
    if (event.type === "completed") {
      await this.changeTracking.finalizeRun(this.lastRunId ?? event.requestId);
      await this.writeSnapshot({ currentStep: "completed", status: "running" });
      this.reportHook(await this.hooks.emit({
        event: "session_end",
        projectRoot: this.getProjectRoot(),
        filesChanged: [...this.runFilePaths],
      }), "session_end");
      return;
    }
    if (event.type === "error") {
      await this.changeTracking.finalizeRun(this.lastRunId ?? event.requestId);
      await this.writeSnapshot({ currentStep: "error", status: "failed" });
      this.reportHook(await this.hooks.emit({ event: "session_end" }), "session_end");
      return;
    }
    if (event.type === "cancelled") {
      await this.changeTracking.finalizeRun(this.lastRunId ?? event.requestId);
      await this.writeSnapshot({ currentStep: "cancelled", status: "interrupted" });
      const interrupted = await this.sessions.listInterrupted(this.getProjectId());
      useAgentStore.getState().setInterruptedSessions(interrupted);
      this.reportHook(await this.hooks.emit({ event: "session_end" }), "session_end");
    }
  }

  private async finishTask(status: "completed" | "failed") {
    if (status === "completed") await this.tasks.complete();
    else await this.tasks.fail();
    const active = this.tasks.getActive();
    if (!active) return;
    if (this.status !== "cancelled") {
      this.emit({ type: "task-completed", taskId: active.id, status });
    }
    useAgentStore.getState().setRunTask({
      id: active.id,
      title: active.title,
      status: status === "completed" ? "completed" : "failed",
      progress: status === "completed" ? 100 : active.progress,
    });
  }

  private trackProcessJob(tool: string, output: unknown) {
    if (tool === "kill_process") {
      const jobId = readJobId(output);
      if (jobId) this.processJobs = this.processJobs.filter((job) => job.jobId !== jobId);
      return;
    }
    if (tool !== "start_process") return;
    const job = readProcessJob(output);
    if (!job) return;
    if (!this.processJobs.some((item) => item.jobId === job.jobId)) {
      this.processJobs.push(job);
    }
  }

  private reportHook(decision: HookDecision, event: string) {
    if (decision.action === "deny") {
      this.emit({ type: "hook-denied", event, message: decision.message ?? "Blocked by hook.", metadata: decision.metadata });
    } else if (decision.action === "warn" && decision.message) {
      this.emit({ type: "hook-warned", event, message: decision.message, metadata: decision.metadata });
    }
  }
}

function readJobId(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const record = output as { jobId?: unknown; data?: { jobId?: unknown } };
  if (typeof record.jobId === "string" && record.jobId) return record.jobId;
  if (typeof record.data?.jobId === "string" && record.data.jobId) return record.data.jobId;
  return null;
}

function readProcessJob(output: unknown): ProcessJobRef | null {
  const jobId = readJobId(output);
  if (!jobId) return null;
  const record = output && typeof output === "object"
    ? output as { command?: unknown; data?: { command?: unknown } }
    : {};
  const command = typeof record.command === "string"
    ? record.command
    : typeof record.data?.command === "string"
      ? record.data.command
      : "";
  return { jobId, command };
}

function runtimeFiles() {
  return {
    readFile: (path: string) => fileSystemService.readFile(path),
    listDirectory: async (path: string) => {
      const entries = await fileSystemService.listDirectory(path);
      return entries.map((entry) => ({
        name: entry.name,
        path: entry.relativePath || entry.path,
        kind: entry.kind,
      }));
    },
  };
}

function recoveryFiles() {
  return {
    readFile: (path: string) => fileSystemService.readFile(path),
    writeFile: (path: string, content: string) => fileSystemService.writeFile(path, content),
    delete: (path: string) => fileSystemService.delete(path),
  };
}

registerBuiltinTools(toolRegistry);

function tagSubagentToolEvent(event: AgentEvent, taskId: string, agentId: string): AgentEvent {
  if (event.type === "tool-started" || event.type === "tool-completed") {
    return { ...event, taskId, agentId };
  }
  return event;
}

function planPathFromTool(tool: string, input: unknown): string | null {
  if (!isPlanDocumentWrite(tool, input)) return null;
  return pathFromToolInput(input) || null;
}

export const agentRuntime = new AgentRuntime({
  aiService: new GatewayModelProvider(new VercelAIService()),
  sessions: sessionManager,
  compaction: compactionManager,
  memory: memoryManager,
});
attachConversationPersistence(agentRuntime);
