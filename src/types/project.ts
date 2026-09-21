export type ProjectFileKind = "file" | "directory";

export interface Project {
  id: string;
  accountId: string;
  name: string;
  rootPath: string;
  localPath: string;
  githubOwner?: string | null;
  githubRepo?: string | null;
  defaultBranch?: string | null;
  projectType?: string | null;
  createdAt?: number;
  updatedAt?: number;
  lastOpenedAt?: number | null;
}

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  kind: ProjectFileKind;
  language?: string;
  content?: string;
  children?: ProjectFile[];
  loaded?: boolean;
}

export interface EditorTab {
  id: string;
  path: string;
  name: string;
  language: string;
  content: string;
  isDirty: boolean;
  pinned: boolean;
  binary?: boolean;
  encodingError?: boolean;
}
