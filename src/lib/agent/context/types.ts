import type { AgentMessage, AgentTask, ToolCall } from "../types";
import type { WebDocument } from "../web/types";

export type ContextSourceId =
  | "conversation"
  | "project"
  | "editor"
  | "tool"
  | "memory"
  | "rag"
  | "git"
  | "skill"
  | "rule"
  | "web"
  | "graph";

export const CONTEXT_PRIORITIES = {
  userRequest: 1,
  activeTask: 2,
  recentMessages: 3,
  currentFile: 4,
  toolResults: 5,
  web: 5,
  relevantCode: 6,
  graph: 6,
  projectRules: 7,
  memory: 8,
  rag: 9,
  oldConversation: 10,
} as const;

export interface ContextBudget {
  maxTokens: number;
  maxFileChars: number;
  maxFiles: number;
  maxRagChunks: number;
  maxHistoryMessages: number;
  maxWebDocs: number;
  maxGraphFiles: number;
}

export interface OpenFileRef {
  path: string;
  isDirty: boolean;
}

export interface SnapshotProject {
  id: string;
  name: string;
  rootPath: string;
}

export interface SnapshotFile {
  path: string;
  content: string;
}

export interface ContextSnapshot {
  request: string;
  messages: AgentMessage[];
  project: SnapshotProject | null;
  currentFile: SnapshotFile | null;
  openFiles: OpenFileRef[];
  toolCalls: ToolCall[];
  webDocuments: WebDocument[];
  activeTask: AgentTask | null;
  compactSummary?: string;
  maxContextChars: number;
}

export interface ContextSlice {
  id: string;
  source: ContextSourceId;
  priority: number;
  score: number;
  tokens: number;
  text: string;
  meta?: Record<string, string>;
}

export interface ContextSliceSummary {
  id: string;
  source: ContextSourceId;
  tokens: number;
  included?: boolean;
  meta?: Record<string, string>;
}

export interface ContextTraceEntry {
  source: ContextSourceId;
  included: boolean;
  reason: string;
  tokens: number;
}

export interface SourceCollectResult {
  slices: ContextSlice[];
  skipReason?: string;
}

export interface ContextSource {
  readonly id: ContextSourceId;
  collect(snapshot: ContextSnapshot, budget: ContextBudget): Promise<SourceCollectResult>;
}

export interface AssembledContext {
  systemPrompt: string;
  messages: AgentMessage[];
  slices: ContextSlice[];
  trace: ContextTraceEntry[];
  tokensUsed: number;
}

export interface ContextFileStore {
  readFile(path: string): Promise<string>;
  listDirectory(path: string): Promise<{ name: string; path: string; kind: "file" | "directory" }[]>;
}

export interface ContextGitStore {
  status(): Promise<{ branch: string; changedFiles: string[]; clean: boolean }>;
  diff(path?: string): Promise<{ path?: string | null; diff: string }>;
}

export interface ContextRetrievers {
  memories?(projectId: string, query: string, limit: number): Promise<{ id: string; memoryType: string; content: string }[]>;
  rag?(projectId: string, query: string, limit: number): Promise<{
    id: string;
    content: string;
    sourcePath?: string | null;
    score: number;
  }[]>;
  graph?(projectId: string, seeds: { query: string; paths: string[] }, limit: number): Promise<{
    path: string;
    content: string;
    score: number;
  }[]>;
}
