import type { Project } from "../../types/project";
import type { GitContext } from "../git/GitService";

export interface FileContext {
  path: string;
  content?: string;
}

export interface ConversationContext {
  id: string;
  title: string;
}

export interface ProjectSettingsMap {
  [key: string]: unknown;
}

export interface ProjectContext {
  project: Project;
  git?: GitContext | null;
  currentFile?: FileContext;
  conversation?: ConversationContext;
  settings: ProjectSettingsMap;
}

export function projectPromptContext(context: ProjectContext) {
  const github = context.project.githubOwner && context.project.githubRepo
    ? `${context.project.githubOwner}/${context.project.githubRepo}`
    : "not connected";
  return [
    `Active project: ${context.project.name} (id ${context.project.id}).`,
    `Local path: ${context.project.localPath}.`,
    `GitHub repository: ${github}.`,
    context.git?.status ? `Git branch ${context.git.status.branch}, ${context.git.status.clean ? "clean" : `${context.git.status.changedFiles.length} changes`}.` : "",
  ].filter(Boolean).join("\n");
}
