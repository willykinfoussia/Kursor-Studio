import type { AgentLoop } from "../AgentLoop";
import type { ContextBuilder } from "../ContextBuilder";
import type { PermissionMode, PermissionPrompter } from "../PermissionManager";
import type { TaskGrantStore } from "../permissions/grants";
import type { PermissionRule } from "../permissions/types";
import type { ToolRegistry } from "../ToolRegistry";
import { toolRegistry } from "../ToolRegistry";
import type { AgentEvent, AgentStatus, AIModel } from "../types";
import type { HookBus } from "../hooks/HookBus";
import type { AgentHarnessHooks } from "../workflow/harness";
import type { WorkflowSessionState } from "../workflow/sessionState";
import { AgentInstance } from "./AgentInstance";
import { BUILTIN_AGENTS } from "./builtin";
import { AgentBusyError, NestedAgentError, UnknownAgentError } from "./errors";
import type { AgentDefinition, SpecialistId } from "./types";

export interface AgentManagerDependencies {
  loop: AgentLoop;
  contextBuilder: ContextBuilder;
  registry?: ToolRegistry;
  definitions?: readonly AgentDefinition[];
}

export interface SpawnOptions {
  parentKey: string;
  instanceKey?: string;
  parentMode: PermissionMode;
  models: readonly AIModel[];
  fallbackEnabled: boolean;
  toolsEnabled: boolean;
  simulateFailureFor?: string[];
  signal: AbortSignal;
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
  modelPolicy?: import("../routing/types").ModelPolicyConfig;
  fromSubagent?: boolean;
  workflow?: WorkflowSessionState;
  harness?: AgentHarnessHooks;
}

export class AgentManager {
  private readonly definitions: Map<SpecialistId, AgentDefinition>;
  private readonly loop: AgentLoop;
  private readonly contextBuilder: ContextBuilder;
  private readonly registry: ToolRegistry;
  private readonly active = new Map<string, AgentInstance>();

  constructor(dependencies: AgentManagerDependencies) {
    this.loop = dependencies.loop;
    this.contextBuilder = dependencies.contextBuilder;
    this.registry = dependencies.registry ?? toolRegistry;
    this.definitions = new Map(
      (dependencies.definitions ?? BUILTIN_AGENTS).map((definition) => [definition.id, definition]),
    );
  }

  list(): AgentDefinition[] {
    return [...this.definitions.values()].map((definition) => ({ ...definition, tools: [...definition.tools] }));
  }

  get(id: SpecialistId) {
    return this.definitions.get(id);
  }

  getActive(parentKey: string) {
    return this.active.get(parentKey) ?? null;
  }

  spawn(id: SpecialistId, options: SpawnOptions): AgentInstance {
    if (options.fromSubagent) throw new NestedAgentError();
    const key = options.instanceKey ?? options.parentKey;
    if (this.active.has(key)) throw new AgentBusyError();
    const others = [...this.active.values()];
    const nonExplore = others.filter((item) => item.definition.id !== "explore").length;
    if (id !== "explore" && nonExplore >= 2) {
      throw new AgentBusyError();
    }
    if (id === "explore" && others.filter((item) => item.definition.id === "explore").length >= 3) {
      throw new AgentBusyError();
    }
    const definition = this.definitions.get(id);
    if (!definition) throw new UnknownAgentError(id);
    const instance = new AgentInstance({
      definition,
      loop: this.loop,
      registry: this.registry,
      contextBuilder: this.contextBuilder,
      parentMode: options.parentMode,
      models: options.models,
      fallbackEnabled: options.fallbackEnabled,
      toolsEnabled: options.toolsEnabled,
      simulateFailureFor: options.simulateFailureFor,
      parentSignal: options.signal,
      emit: options.emit,
      setStatus: options.setStatus,
      setActiveModel: options.setActiveModel,
      automaticTools: options.automaticTools,
      confirmDestructive: options.confirmDestructive,
      yoloMode: options.yoloMode,
      allowRules: options.allowRules,
      grants: options.grants,
      onPermanentGrant: options.onPermanentGrant,
      getProjectRoot: options.getProjectRoot,
      prompter: options.prompter,
      hooks: options.hooks,
      beforeToolExecute: options.beforeToolExecute,
      modelPolicy: options.modelPolicy,
      workflow: options.workflow,
      harness: options.harness,
      onRunning: (runningNow) => {
        if (!runningNow && this.active.get(key) === instance) this.active.delete(key);
      },
    });
    this.active.set(key, instance);
    return instance;
  }

  cancel(parentKey?: string) {
    if (parentKey) {
      this.active.get(parentKey)?.cancel();
      this.active.delete(parentKey);
      return;
    }
    for (const instance of this.active.values()) instance.cancel();
    this.active.clear();
  }
}
