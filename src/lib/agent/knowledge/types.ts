export type SkillProposalActionKind = "create" | "update";
export type SpecProposalActionKind = "create" | "update" | "delete" | "reorganize";
export type KnowledgeProposalStatus = "pending" | "accepted" | "rejected" | "applied";

export interface SkillProposalDraft {
  name: string;
  description: string;
  triggers: string[];
  instructions: string;
  allowedTools?: string[];
}

export interface SkillProposalAction {
  id: string;
  action: SkillProposalActionKind;
  skillId: string;
  scope: "project" | "user";
  rationale: string;
  draft?: SkillProposalDraft;
}

export interface SpecProposalAction {
  id: string;
  action: SpecProposalActionKind;
  scope: "account" | "project";
  rationale: string;
  path?: string;
  kind?: string;
  group?: string;
  fileName?: string;
  targetPath?: string;
  content?: string;
}

export interface KnowledgeReflectResult {
  summary: string;
  skillActions: SkillProposalAction[];
  specActions: SpecProposalAction[];
}

export interface KnowledgeProposal {
  id: string;
  projectId: string;
  runId: string;
  conversationId: string;
  createdAt: number;
  updatedAt: number;
  status: KnowledgeProposalStatus;
  summary: string;
  payload: KnowledgeReflectResult;
}

export interface KnowledgeReflectInput {
  runId: string;
  projectId: string | null;
  conversationId: string;
  goal: string;
  messages: { role: string; content: string }[];
  toolNames: string[];
  filesChanged: string[];
  skipFlag?: boolean;
  planUnfinished?: boolean;
}
