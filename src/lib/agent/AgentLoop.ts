import { AIProviderCancelledError, AIProviderError, classifyError, toUserMessage } from "./errors";
import { estimateTokens } from "./context/tokens";
import { FallbackManager } from "./FallbackManager";
import { agentLogger } from "./logger";
import { usageMetrics, type UsageMetrics } from "./metrics";
import type { AIService } from "./AIService";
import type { AgentExecution } from "./AgentExecution";
import { AgentExecutionContext } from "./AgentExecutionContext";
import { isMutatingToolName, toolOutputOk } from "./AgentStep";
import type { PermissionGate } from "./PermissionGate";
import {
  createManagerFromGate,
  PermissionManager,
  permissionManagerAsGate,
  sessionModeFromSettings,
  type PermissionMode,
  type PermissionPrompter,
} from "./PermissionManager";
import type { TaskGrantStore } from "./permissions/grants";
import { BASELINE_ALLOW_RULES } from "./permissions/policy";
import type { PermissionRule } from "./permissions/types";
import type { SkillTurnSession } from "./skills/session";
import { ToolExecutor } from "./ToolExecutor";
import { toolRegistry, type AgentTool, type ToolRegistry } from "./ToolRegistry";
import { resolveAgentTools } from "../capabilities/CapabilityResolver";
import { readDisabledCapabilityIds } from "../capabilities/overlay";
import { type HookBus, readPath } from "./hooks/HookBus";
import type { HookDecision } from "./hooks/types";
import { toolChangedPath } from "./tools/result";
import type {
  AgentEvent,
  AgentStatus,
  AIModel,
  AIRequestOptions,
} from "./types";
import { classifyPermission, PERMISSION_EVALUATION_MODEL } from "./permissionClassifier";
import type { AgentHarnessHooks } from "./workflow/harness";
import type { WorkflowSessionState } from "./workflow/sessionState";
import { ensureUsingSuperpowers } from "./workflow/prompts";
import { isReadOnlyInteraction } from "./modes";
import { commandCheckRunner, formatForModel, VerificationEngine } from "./verification/VerificationEngine";
import { MAX_VERIFICATION_ATTEMPTS, type CheckRunner } from "./verification/types";
import { planVerificationRun, type VerificationKinds } from "./verification/whenToRun";
import { mergeTestingFailure, mergeTestingReport, testingCoversHarnessTest, testingLevelsFor, verificationKindsWithoutTest } from "../testing/bridge";
import type { TestRun, TestStrategyDecision } from "../testing/domain";

export interface AgentLoopDependencies {
  aiService: AIService;
  fallbackManager?: FallbackManager;
  metrics?: UsageMetrics;
  registry?: ToolRegistry;
  gate?: PermissionGate;
  verification?: VerificationEngine;
  checkRunner?: CheckRunner;
  testing?: {
    run(input: {
      levels: Array<"unit" | "integration" | "e2e">;
      requestId: string;
      signal?: AbortSignal;
      runner: CheckRunner;
    }): Promise<{ run: TestRun; strategy: TestStrategyDecision } | null>;
  };
}

export interface AgentLoopRunOptions {
  execution: AgentExecution;
  models: readonly AIModel[];
  fallbackEnabled: boolean;
  systemPrompt: string;
  toolsEnabled: boolean;
  simulateFailureFor?: string[];
  signal: AbortSignal;
  emit: (event: AgentEvent) => void;
  setStatus: (status: AgentStatus) => void;
  setActiveModel: (model: string | null) => void;
  automaticTools?: boolean;
  permissionMode?: PermissionMode;
  confirmDestructive?: boolean;
  yoloMode?: boolean;
  allowRules?: PermissionRule[];
  onPermanentGrant?: (rule: PermissionRule) => void;
  getProjectRoot?: () => string | null;
  prompter?: PermissionPrompter;
  hooks?: HookBus;
  beforeToolExecute?: (tool: string, input: unknown) => Promise<void>;
  allowedTools?: string[];
  maxSteps?: number;
  maxToolCalls?: number;
  grants?: TaskGrantStore;
  deniedTools?: string[];
  skillSession?: SkillTurnSession;
  harness?: AgentHarnessHooks;
  workflow?: WorkflowSessionState;
  isSubagent?: boolean;
}

export interface AgentLoopResult {
  content: string;
  model: string;
  usedTools: boolean;
}

export class AgentLoop {
  private readonly aiService: AIService;
  private readonly fallbackManager: FallbackManager;
  private readonly metrics: UsageMetrics;
  private readonly registry: ToolRegistry;
  private readonly defaultGate: PermissionGate | undefined;
  private readonly verification: VerificationEngine;
  private readonly checkRunner?: CheckRunner;
  private readonly testing?: AgentLoopDependencies["testing"];

  constructor(dependencies: AgentLoopDependencies) {
    this.aiService = dependencies.aiService;
    this.fallbackManager = dependencies.fallbackManager ?? new FallbackManager();
    this.metrics = dependencies.metrics ?? usageMetrics;
    this.registry = dependencies.registry ?? toolRegistry;
    this.defaultGate = dependencies.gate;
    this.verification = dependencies.verification ?? new VerificationEngine();
    this.checkRunner = dependencies.checkRunner;
    this.testing = dependencies.testing;
  }

  async run(options: AgentLoopRunOptions): Promise<AgentLoopResult> {
    const { execution, emit, setStatus, setActiveModel } = options;
    const skipSuperpowers = options.isSubagent === true || options.workflow?.interactionMode === "ask";
    const systemPrompt = ensureUsingSuperpowers(options.systemPrompt, skipSuperpowers);
    const context = new AgentExecutionContext(execution);
    const allowedTools = options.allowedTools;
    const visibleTools = resolveAgentTools(this.registry, {
      allowedTools,
      deniedTools: options.deniedTools,
      disabledCapabilityIds: readDisabledCapabilityIds(),
    });
    const deniedTools = [
      ...(options.deniedTools ?? []),
      ...this.registry.listEnabled()
        .map((tool) => tool.name)
        .filter((name) => !visibleTools.some((tool) => tool.name === name)),
    ];
    const effectiveMode = isReadOnlyInteraction(options.workflow)
      ? "read-only" as const
      : sessionModeFromSettings(options.automaticTools !== false, options.permissionMode);
    const inPlanMode = options.workflow?.interactionMode === "plan" || options.workflow?.planMode === true;
    // Structured plan tools must bypass the read-only permission mode in Plan mode.
    // Workflow gates still deny every other mutating tool.
    const planAllowRules: PermissionRule[] = inPlanMode
      ? [
        { action: "allow", tool: "create_plan" },
        { action: "allow", tool: "update_plan_todo" },
      ]
      : [];
    const permissions = this.defaultGate
      ? createManagerFromGate(this.defaultGate, this.registry)
      : new PermissionManager({
        mode: effectiveMode,
        confirmDestructive: options.confirmDestructive !== false,
        registry: this.registry,
        getProjectRoot: options.getProjectRoot ?? (() => null),
        prompter: options.prompter,
        grants: options.grants,
        deniedTools,
        allowRules: [...BASELINE_ALLOW_RULES, ...(options.allowRules ?? []), ...planAllowRules],
        yoloMode: options.yoloMode === true,
        onPermanentGrant: options.onPermanentGrant,
        onAsk: (request) => {
          setStatus("waiting_approval");
          execution.status = "waiting_approval";
          emit({ type: "permission-required", ...request });
        },
        classifier: this.aiService.evaluate
          ? async (input) => {
            this.metrics.request("LLM-PERM");
            emit({ type: "llm-started", requestId: execution.requestId, kind: "perm", model: PERMISSION_EVALUATION_MODEL });
            return classifyPermission(this.aiService, input, options.signal);
          }
          : undefined,
        onClassifier: (event) => {
          emit({ type: "permission-classifier", ...event });
        },
      });
    const gate = this.defaultGate ?? permissionManagerAsGate(permissions);
    const reportHook = (decision: HookDecision, event: string) => {
      if (decision.action === "deny") {
        emit({ type: "hook-denied", event, message: decision.message ?? "Blocked by hook.", metadata: decision.metadata });
      } else if (decision.action === "warn" && decision.message) {
        emit({ type: "hook-warned", event, message: decision.message, metadata: decision.metadata });
      }
    };
    const executor = new ToolExecutor({
      registry: this.registry,
      permissions,
      getProjectRoot: options.getProjectRoot ?? (() => null),
      hooks: options.hooks,
      onHook: (decision, event) => reportHook(decision, event),
      beforeExecute: options.beforeToolExecute,
      skillSession: options.skillSession,
      workflow: options.workflow,
      harness: options.harness,
    });
    const tools = visibleTools;
    const maxSteps = options.maxSteps;
    const maxToolCalls = options.maxToolCalls;

    execution.status = "planning";
    setStatus("planning");

    if (options.signal.aborted) throw new AIProviderCancelledError();

    setStatus("thinking");
    execution.status = "thinking";

    try {
      const result = await this.fallbackManager.execute(
        async (model, signal) => {
          setActiveModel(model.id);
          setStatus("thinking");
          execution.status = "thinking";
          const attemptStartedAt = performance.now();
          this.metrics.request(model.id);
          emit({
            type: "started",
            requestId: execution.requestId,
            messageId: execution.messageId,
            model: model.id,
            userMessage: execution.userMessage,
          });
          agentLogger.info("Model selected", { model: model.id });

          try {
            const outcome = await this.consumeAttempt({
              execution,
              context,
              modelId: model.id,
              systemPrompt,
              toolsEnabled: options.toolsEnabled,
              simulateFailureFor: options.simulateFailureFor,
              signal,
              emit,
              setStatus,
              tools,
              gate,
              executor,
              getProjectRoot: options.getProjectRoot,
              hooks: options.hooks,
              reportHook,
              maxSteps,
              maxToolCalls,
              skillSession: options.skillSession,
              llmKind: options.isSubagent ? "sub" : "001",
            });
            this.metrics.success(
              model.id,
              performance.now() - attemptStartedAt,
              outcome.usage ?? tokenUsage(systemPrompt, execution, outcome.content),
            );
            return outcome;
          } catch (error) {
            this.metrics.error(
              model.id,
              performance.now() - attemptStartedAt,
              tokenUsage(systemPrompt, execution, ""),
            );
            throw error;
          }
        },
        {
          models: options.models,
          fallbackEnabled: options.fallbackEnabled,
          signal: options.signal,
          onModelError: (model) => {
            agentLogger.warn("Model failed", { model: model.id });
          },
          onFallback: (fromModel, toModel, reason) => {
            this.metrics.fallback(fromModel.id);
            setStatus("fallback");
            execution.status = "fallback";
            emit({
              type: "fallback",
              fromModel: fromModel.id,
              toModel: toModel.id,
              reason,
            });
            agentLogger.warn("Fallback", { fromModel: fromModel.id, toModel: toModel.id });
          },
        },
      );

      setActiveModel(result.model.id);
      const verified = await this.verifyAndRepair({
        execution,
        context,
        modelId: result.model.id,
        systemPrompt,
        toolsEnabled: options.toolsEnabled,
        simulateFailureFor: options.simulateFailureFor,
        signal: options.signal,
        emit,
        setStatus,
        tools,
        gate,
        executor,
        getProjectRoot: options.getProjectRoot,
        hooks: options.hooks,
        reportHook,
        maxSteps,
        maxToolCalls,
        workflow: options.workflow,
        isSubagent: options.isSubagent,
        outcome: result.value,
      });
      const stopContext = completionContext(execution, this.registry);
      if (options.hooks) {
        const before = await options.hooks.emit({
          event: "before_completion",
          mutated: stopContext.mutated,
          verificationOk: !verified.blocked,
          filesChanged: stopContext.filesChanged,
          projectRoot: options.getProjectRoot?.() ?? null,
        });
        reportHook(before, "before_completion");
        if (before.action === "deny") {
          throw new AIProviderError(
            verified.blocked
              ? (verified.reason ?? before.message ?? "Required checks failed.")
              : (before.message ?? "Blocked by hook."),
            { retryable: false },
          );
        }
      }
      if (verified.blocked) {
        throw new AIProviderError(verified.reason ?? "Required checks failed.", { retryable: false });
      }

      let content = verified.content;
      if (!content.trim() && result.value.usedTools) {
        content = "Applied the requested file changes.";
      }
      if (!content.trim()) {
        throw new AIProviderError("The model returned an empty response.", { retryable: true });
      }

      execution.status = "completed";
      setStatus("completed");
      if (options.hooks) {
        const after = await options.hooks.emit({ event: "after_completion" });
        reportHook(after, "after_completion");
      }
      agentLogger.info("Request completed", { requestId: execution.requestId, model: result.model.id });
      return { content, model: result.model.id, usedTools: verified.usedTools };
    } catch (error) {
      if (error instanceof AIProviderCancelledError || options.signal.aborted) {
        if (options.signal.reason === "agent-duration") {
          execution.status = "failed";
          setStatus("failed");
          emit({
            type: "error",
            requestId: execution.requestId,
            message: toUserMessage(classifyError(error, options.signal)),
          });
          throw error;
        }
        execution.status = "cancelled";
        setStatus("cancelled");
        emit({ type: "cancelled", requestId: execution.requestId });
        agentLogger.info("Request cancelled", { requestId: execution.requestId });
        throw error;
      }
      execution.status = "failed";
      setStatus("failed");
      emit({ type: "error", requestId: execution.requestId, message: toUserMessage(error) });
      agentLogger.error("Request failed", { requestId: execution.requestId });
      throw error;
    }
  }

  private async consumeAttempt(input: {
    execution: AgentExecution;
    context: AgentExecutionContext;
    modelId: string;
    systemPrompt: string;
    toolsEnabled: boolean;
    simulateFailureFor?: string[];
    signal?: AbortSignal;
    emit: (event: AgentEvent) => void;
    setStatus: (status: AgentStatus) => void;
    tools: AgentTool[];
    gate: PermissionGate;
    executor: ToolExecutor;
    getProjectRoot?: () => string | null;
    hooks?: HookBus;
    reportHook: (decision: HookDecision, event: string) => void;
    maxSteps?: number;
    maxToolCalls?: number;
    skillSession?: SkillTurnSession;
    llmKind?: "001" | "sub" | "vrp";
  }): Promise<{ content: string; usedTools: boolean; usage?: { inputTokens?: number; outputTokens?: number } }> {
    const maxToolCalls = input.maxToolCalls;
    const request: AIRequestOptions = {
      model: input.modelId,
      systemPrompt: input.systemPrompt,
      signal: input.signal,
      simulateFailureFor: input.simulateFailureFor,
      toolsEnabled: input.toolsEnabled,
      maxSteps: input.maxSteps,
      maxToolCalls,
      tools: input.toolsEnabled ? input.tools : [],
      gate: input.gate,
      executor: input.executor,
      onStatus: input.setStatus,
      onEvent: input.emit,
      getProjectRoot: input.getProjectRoot,
      skillSession: input.skillSession,
    };

    const stream = await this.aiService.streamChat(input.context.messagesForModel(), request);
    if (input.signal?.aborted) throw new AIProviderCancelledError();
    input.emit({ type: "llm-started", requestId: input.execution.requestId, kind: input.llmKind ?? "001", model: input.modelId });
    let assistantContent = "";
    let flushedThrough = 0;
    let usedTools = false;
    let toolCallsThisAttempt = 0;

    const flushAssistantMessage = () => {
      const text = assistantContent.slice(flushedThrough).trim();
      if (!text) return;
      input.emit({
        type: "assistant-message",
        messageId: input.execution.messageId,
        text,
      });
      flushedThrough = assistantContent.length;
    };

    for await (const event of stream.events) {
      if (input.signal?.aborted) throw new AIProviderCancelledError();

      if (event.type === "step-started") {
        if (input.hooks) {
          const decision = await input.hooks.emit({ event: "before_agent_step", stepKind: event.kind });
          input.reportHook(decision, "before_agent_step");
        }
        if (event.kind === "model") {
          const step = input.execution.startModelStep();
          input.emit({ type: "step-started", stepId: step.id, index: step.index, kind: "model" });
        }
        input.setStatus("thinking");
        input.execution.status = "thinking";
        continue;
      }

      if (event.type === "step-finished") {
        if (input.hooks) {
          const decision = await input.hooks.emit({ event: "after_agent_step", stepKind: event.kind });
          input.reportHook(decision, "after_agent_step");
        }
        const finished = input.execution.finishLatestModelStep();
        if (finished) {
          input.emit({ type: "step-finished", stepId: finished.id, index: finished.index, kind: "model" });
        }
        continue;
      }

      if (event.type === "text-delta") {
        input.setStatus("streaming");
        input.execution.status = "streaming";
        assistantContent += event.text;
        input.emit({ ...event, messageId: input.execution.messageId });
        continue;
      }

      if (event.type === "permission-required") {
        input.setStatus("waiting_approval");
        input.execution.status = "waiting_approval";
        input.emit(event);
        continue;
      }

      if (event.type === "tool-started") {
        if (typeof maxToolCalls === "number" && maxToolCalls >= 1 && toolCallsThisAttempt >= maxToolCalls) continue;
        flushAssistantMessage();
        usedTools = true;
        toolCallsThisAttempt += 1;
        input.setStatus("tool_call");
        input.execution.status = "tool_call";
        const step = input.execution.startToolStep(event.id, event.tool, event.input);
        input.emit({ type: "step-started", stepId: step.id, index: step.index, kind: "tool" });
        input.emit(event);
        continue;
      }

      if (event.type === "tool-completed") {
        input.setStatus("tool_result");
        input.execution.status = "tool_result";
        const step = input.execution.finishToolStep(event.id, event.tool, event.output);
        if (step) {
          input.emit({ type: "step-finished", stepId: step.id, index: step.index, kind: "tool" });
        }
        input.emit(event);
        continue;
      }

      input.emit(event);
    }

    const usage = stream.usage ? await stream.usage.catch(() => undefined) : undefined;
    if (!assistantContent.trim() && usedTools) {
      assistantContent = "Applied the requested file changes.";
    }
    if (
      !assistantContent.trim()
      && input.execution.toolCalls.some((call) => toolOutputOk(call.output))
    ) {
      assistantContent = "Applied the requested file changes.";
    }
    if (!assistantContent.trim()) {
      throw new AIProviderError("The model returned an empty response.", { retryable: true });
    }
    flushAssistantMessage();
    return { content: assistantContent, usedTools, usage };
  }

  private async verifyAndRepair(input: {
    execution: AgentExecution;
    context: AgentExecutionContext;
    modelId: string;
    systemPrompt: string;
    toolsEnabled: boolean;
    simulateFailureFor?: string[];
    signal?: AbortSignal;
    emit: (event: AgentEvent) => void;
    setStatus: (status: AgentStatus) => void;
    tools: AgentTool[];
    gate: PermissionGate;
    executor: ToolExecutor;
    getProjectRoot?: () => string | null;
    hooks?: HookBus;
    reportHook: (decision: HookDecision, event: string) => void;
    maxSteps?: number;
    maxToolCalls?: number;
    workflow?: WorkflowSessionState;
    isSubagent?: boolean;
    outcome: { content: string; usedTools: boolean };
  }): Promise<{ content: string; usedTools: boolean; blocked?: boolean; reason?: string }> {
    const planned = planVerificationRun({
      session: input.workflow,
      isSubagent: input.isSubagent,
      toolCalls: input.execution.toolCalls,
    });
    if (!planned) return input.outcome;

    const runner = this.checkRunner ?? commandCheckRunner((command) => input.executor.run("run_command", { command }));
    const levels = this.testing ? testingLevelsFor(planned) : null;
    let outcome = input.outcome;

    for (let attempt = 1; attempt <= MAX_VERIFICATION_ATTEMPTS; attempt += 1) {
      const step = input.execution.startVerifyStep();
      input.execution.status = "verifying";
      input.setStatus("verifying");
      input.emit({ type: "step-started", stepId: step.id, index: step.index, kind: "verify" });
      input.emit({
        type: "verification-started",
        requestId: input.execution.requestId,
        trigger: "agent",
      });

      let tested: { run: TestRun; strategy: TestStrategyDecision } | null = null;
      let testingError: unknown = null;
      if (levels && this.testing) {
        try {
          tested = await this.testing.run({
            levels,
            requestId: input.execution.requestId,
            signal: input.signal,
            runner,
          });
        } catch (error) {
          testingError = error;
        }
      }
      const covers = Boolean(tested && levels && testingCoversHarnessTest(tested.strategy, levels));
      const narrowed = covers ? verificationKindsWithoutTest(planned) : null;

      const harness = await this.verification.run({
        runner,
        attempt,
        signal: input.signal,
        kinds: narrowed ? narrowed.kinds as VerificationKinds : planned.kinds,
        customNames: narrowed?.customNames,
        onCheckStart: (check) => {
          input.emit({
            type: "verification-check-started",
            requestId: input.execution.requestId,
            kind: check.kind,
            name: check.name,
            command: check.command,
            expectedFile: check.expectedFile,
          });
        },
        onCheckEnd: (result) => {
          input.emit({
            type: "verification-check-completed",
            requestId: input.execution.requestId,
            result,
          });
        },
      });
      let report = harness;
      if (testingError) {
        report = mergeTestingFailure(harness, testingError);
      } else if (tested && levels) {
        report = mergeTestingReport(harness, tested.run, tested.strategy, levels);
      }
      input.execution.finishVerifyStep(report.ok);
      input.emit({ type: "step-finished", stepId: step.id, index: step.index, kind: "verify" });
      input.emit({
        type: "verification-completed",
        requestId: input.execution.requestId,
        ok: report.ok,
        blockers: report.blockers,
        commands: report.results.map((result) => result.command).filter((command): command is string => Boolean(command)),
        attempt: report.attempts,
        results: report.results,
        durationMs: report.durationMs,
        trigger: "agent",
        cancelled: report.cancelled,
      });

      if (report.ok) return outcome;
      if (attempt >= MAX_VERIFICATION_ATTEMPTS) {
        return {
          ...outcome,
          blocked: true,
          reason: report.blockers[0] ?? "Required checks failed.",
        };
      }

      input.context.addVerificationNote(formatForModel(report));
      try {
        const repaired = await this.consumeAttempt({ ...input, llmKind: "vrp" });
        outcome = {
          content: repaired.content,
          usedTools: outcome.usedTools || repaired.usedTools,
        };
      } catch (error) {
        if (error instanceof AIProviderCancelledError || input.signal?.aborted) throw error;
        const classified = classifyError(error, input.signal);
        if (!classified.retryable) throw error;
      }
    }

    return outcome;
  }
}

function completionContext(execution: AgentExecution, registry: ToolRegistry) {
  const filesChanged: string[] = [];
  let mutated = false;
  for (const call of execution.toolCalls) {
    const tool = registry.get(call.tool);
    if (!isMutatingToolName(call.tool, tool?.mutate) || !toolOutputOk(call.output)) continue;
    mutated = true;
    const path = toolChangedPath(call.output) || readPath(call.input);
    if (path && !filesChanged.includes(path)) filesChanged.push(path);
  }
  return { mutated, filesChanged };
}

function tokenUsage(systemPrompt: string, execution: AgentExecution, output: string) {
  const inputTokens = estimateTokens(systemPrompt)
    + execution.baseMessages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  return {
    inputTokens,
    outputTokens: estimateTokens(output),
  };
}
