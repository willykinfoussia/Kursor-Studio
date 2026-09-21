export const RELATION_TYPES = [
  "references",
  "implements",
  "depends_on",
  "imports",
  "uses",
  "tests",
  "documents",
  "configures",
  "generates",
  "related_to",
  "influences",
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export type FileCategory =
  | "specifications"
  | "code"
  | "data"
  | "tests"
  | "documentation";

export type EvidenceSource = "explicit" | "deterministic";

export type GraphEdgeStatus = "active" | "uncertain";

export interface EvidenceLocation {
  line?: number;
  column?: number;
  range?: string;
}

export interface Evidence {
  type: string;
  source: EvidenceSource;
  score: number;
  details?: string;
  location?: EvidenceLocation;
}

export interface FileDescriptor {
  path: string;
  name: string;
  basename: string;
  extension: string;
  size: number;
  modifiedAt: number;
  content?: string;
  tokens: string[];
  symbols?: string[];
  metadata: Record<string, unknown>;
  hash: string;
}

export interface FileNode {
  id: string;
  path: string;
  type: "file";
  category: FileCategory;
  hash: string;
  size: number;
  modifiedAt: number;
  basename: string;
  tokens: string[];
  symbols?: string[];
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: RelationType;
  confidence: number;
  evidence: Evidence[];
  status: GraphEdgeStatus;
}

export interface GraphConfigWeights {
  explicitReference: number;
  importReference: number;
  basenameMatch: number;
  directoryMatch: number;
  domainMatch: number;
  symbolMatch: number;
  keywordMatch: number;
  testNameMatch: number;
  nameMention: number;
}

export interface GraphConfig {
  minConfidence: number;
  candidateTokenJaccard: number;
  weights: GraphConfigWeights;
  relations: RelationType[];
}

export interface ProjectContext {
  rootPath: string;
  files: Map<string, FileDescriptor>;
  config: GraphConfig;
}

export interface TraversalOptions {
  maxDepth?: number;
  allowedRelations?: RelationType[];
  minConfidence?: number;
  maxFiles?: number;
}

export interface RelatedFile {
  path: string;
  depth: number;
  relation?: RelationType;
  confidence: number;
}

export interface WalkedFile {
  relativePath: string;
  size: number;
  modifiedAt: number;
}

export interface GraphFileStore {
  walkFiles(): Promise<WalkedFile[]>;
  readFile(path: string): Promise<string>;
  readBytes?(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: string): Promise<void>;
  createDirectory?(path: string): Promise<void>;
  delete?(path: string): Promise<void>;
  listDirectory?(path: string): Promise<{ name: string; path: string; kind: "file" | "directory" }[]>;
}

export interface RelationshipAnalyzer {
  analyze(
    source: FileDescriptor,
    target: FileDescriptor,
    context: ProjectContext,
  ): GraphEdge[];
}

export interface ResolvedContext {
  root: string;
  files: string[];
}
