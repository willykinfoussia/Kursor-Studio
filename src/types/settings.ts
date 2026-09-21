import type { PermissionMode, PermissionRule } from "../lib/agent/permissions/types";
import type { ModelPolicyConfig } from "../lib/agent/routing/types";

export type AutoSaveMode = "off" | "afterDelay" | "onFocusChange";

export interface CustomAIModel {
  id: string;
  name: string;
}

export interface AppSettings {
  theme: "Kursor Dark" | "System";
  fontSize: number;
  defaultModel: string;
  fallbackEnabled: boolean;
  modelOrder: string[];
  customModels: CustomAIModel[];
  simulateFailureFor: string[];
  automaticTools: boolean;
  permissionMode: PermissionMode;
  confirmDestructive: boolean;
  yoloMode: boolean;
  permissionWhitelist: PermissionRule[];
  terminalShell: string;
  autoSave: boolean;
  autoSaveMode: AutoSaveMode;
  showExcludedDirectories: boolean;
  ragIgnorePatterns: string[];
  maxContextChars: number;
  modelPolicy: ModelPolicyConfig;
  compactTools: boolean;
  autoCollapseCompletedTools: boolean;
  showToolDetails: boolean;
  showThinkingDetails: boolean;
  stickyCurrentTask: boolean;
  openLastProjectOnStartup: boolean;
  disabledCapabilityIds: string[];
  reviewDiffLayout: "split" | "unified";
  reviewAdvanceOnDecision: boolean;
  reviewOpenShortcut: string;
  knowledgeReflectEnabled: boolean;
  maxAgentSteps: number | null;
  maxToolCalls: number | null;
}
