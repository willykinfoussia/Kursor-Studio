import type { BuiltInMcpId } from "../builtin/types";

export type SetupCheckStatus = "pending" | "valid" | "warning" | "error";

export interface SetupRepairAction {
  id: string;
  label: string;
}

export interface SetupValidation {
  status: SetupCheckStatus;
  message: string;
  detail?: string;
  repair?: SetupRepairAction[];
}

export interface MCPSetupStep {
  id: string;
  title: string;
  description: string;
}

export interface SetupLogEvent {
  type: string;
  message: string;
  status?: SetupCheckStatus;
  at: number;
}

export interface MCPSetupState {
  definitionId: BuiltInMcpId;
  stepIndex: number;
  settings: Record<string, unknown>;
  logs: SetupLogEvent[];
  validations: Record<string, SetupValidation>;
  canContinue: boolean;
  busy: boolean;
  error?: string;
}

export const SETUP_EVENT_TYPES = [
  "mcp-setup-started",
  "mcp-dependency-detected",
  "mcp-config-updated",
  "mcp-server-started",
  "mcp-server-connected",
  "mcp-discovery-completed",
  "mcp-setup-completed",
  "mcp-setup-failed",
] as const;

export type MCPSetupEventType = typeof SETUP_EVENT_TYPES[number];

export interface DetectedExecutable {
  name: string;
  found: boolean;
  path?: string;
  version?: string;
  displayPath?: string;
}

export interface BlenderInstallation {
  installed: boolean;
  path?: string;
  version?: string;
  compatible: boolean;
  required: string;
}

export interface AddonStatus {
  detected: boolean;
  host: string;
  port: number;
  message: string;
}

export interface SystemDetector {
  which(name: string): Promise<DetectedExecutable>;
  detectBlender(): Promise<BlenderInstallation | null>;
  probeTcp(host: string, port: number): Promise<boolean>;
  pickDirectory(title?: string): Promise<string | null>;
  pickFile(title?: string, filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null>;
}
