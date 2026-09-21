export interface SettingRecord {
  key: string;
  value: string;
  updatedAt: number;
}

export interface AccountRecord {
  id: string;
  provider: "github" | "local" | string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  onboarded: number;
  createdAt: number;
  updatedAt: number;
}

export interface GitHubAccountRecord {
  id: string;
  accountId: string;
  githubUserId: string;
  username: string;
  avatarUrl?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectGithubRepositoryRecord {
  id: string;
  projectId: string;
  githubRepositoryId?: string | null;
  owner?: string | null;
  name?: string | null;
  fullName?: string | null;
  htmlUrl?: string | null;
  cloneUrl?: string | null;
  defaultBranch?: string | null;
  private: number;
}

export interface ProjectRecord {
  id: string;
  accountId?: string | null;
  name: string;
  rootPath: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number | null;
}

export interface ConversationRecord {
  id: string;
  projectId?: string | null;
  title: string;
  createdAt: number;
  updatedAt: number;
  archived: number;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  model?: string | null;
  createdAt: number;
  tokenInput?: number | null;
  tokenOutput?: number | null;
  latencyMs?: number | null;
}

export interface AgentRunRecord {
  id: string;
  accountId?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
  agentId?: string | null;
  status: string;
  model?: string | null;
  startedAt: number;
  finishedAt?: number | null;
  error?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
}

export interface AgentSessionRecord {
  id: string;
  projectId?: string | null;
  conversationId: string;
  status: string;
  startedAt: number;
  updatedAt: number;
  currentStep?: string | null;
  currentGoal?: string | null;
  checkpointJson?: string | null;
}

export interface TaskRecord {
  id: string;
  projectId?: string | null;
  agentRunId?: string | null;
  title: string;
  description?: string | null;
  status: string;
  progress: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number | null;
}

export interface ToolCallRecord {
  id: string;
  agentRunId: string;
  toolName: string;
  inputJson?: string | null;
  outputJson?: string | null;
  status: string;
  startedAt?: number | null;
  finishedAt?: number | null;
  error?: string | null;
}

export interface AgentStepRecord {
  id: string;
  agentRunId: string;
  index: number;
  kind: string;
  status: string;
  startedAt: number;
  finishedAt?: number | null;
}

export interface EventTraceRecord {
  id: string;
  runId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  seq: number;
  eventType: string;
  payloadJson: string;
  createdAt: number;
}

export interface AgentRecord {
  id: string;
  name: string;
  description?: string | null;
  systemPrompt?: string | null;
  model?: string | null;
  enabled: number;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryRecord {
  id: string;
  agentId?: string | null;
  projectId?: string | null;
  scope?: "global" | "project" | string | null;
  memoryType: string;
  memoryKey?: string | null;
  content: string;
  importance?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFileRecord {
  id: string;
  projectId: string;
  path: string;
  language?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  contentHash?: string | null;
  indexedAt?: number | null;
  updatedAt?: number | null;
}

export interface UsageRecord {
  id: string;
  agentRunId?: string | null;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  status?: string | null;
  fallbackFrom?: string | null;
  fallbackTo?: string | null;
  createdAt: number;
}

export interface IndexFilePlan {
  path: string;
  hash: string;
  size: number;
  language?: string | null;
}

export interface IndexPlan {
  projectId: string;
  toIndex: IndexFilePlan[];
  toDelete: string[];
}

export interface RagChunkInput {
  id: string;
  projectId: string;
  sourceType: string;
  sourcePath?: string | null;
  chunkIndex?: number | null;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface RagSearchHit {
  id: string;
  projectId: string;
  sourceType: string;
  sourcePath?: string | null;
  chunkIndex?: number | null;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface AiChangeHunkRecord {
  id: string;
  fileChangeId: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  originalText: string;
  proposedText: string;
  patch: string;
  reversePatch?: string | null;
  status: string;
  toolCallId?: string | null;
  hunkIndex?: number;
  createdAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
}

export interface AiFileChangeRecord {
  id: string;
  changeSetId: string;
  path: string;
  previousPath?: string | null;
  kind: string;
  baseHash?: string | null;
  proposedHash?: string | null;
  currentHash?: string | null;
  baseContent?: string | null;
  proposedContent?: string | null;
  additions: number;
  deletions: number;
  status: string;
  binary?: number;
  tooLarge?: number;
  toolCallIdsJson?: string | null;
  createdAt: number;
  updatedAt: number;
  hunks?: AiChangeHunkRecord[];
}

export interface AiChangeSetRecord {
  id: string;
  accountId?: string | null;
  projectId: string;
  runId: string;
  conversationId?: string | null;
  agentId?: string | null;
  model?: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number | null;
  files?: AiFileChangeRecord[];
}

export interface AiReviewDecisionRecord {
  id: string;
  changeSetId: string;
  fileChangeId?: string | null;
  hunkId?: string | null;
  scope: string;
  decision: string;
  createdAt: number;
}

export interface KnowledgeProposalRecord {
  id: string;
  projectId: string;
  runId: string;
  conversationId?: string | null;
  status: string;
  summary: string;
  payloadJson: string;
  createdAt: number;
  updatedAt: number;
}
