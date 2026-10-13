export type ProjectCategory =
  | "software"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "multi"
  | "unknown";

export type ArtifactSource = "agent" | "user" | "scan";

export type ArtifactRole = "deliverable" | "source" | "config" | "generated";

export type PreviewKind =
  | "web-app"
  | "markdown"
  | "html"
  | "text"
  | "image"
  | "pdf"
  | "spreadsheet"
  | "document"
  | "presentation"
  | "unsupported";

export type PreviewCapability = "native" | "external" | "none";

export interface ProjectArtifact {
  artifactId: string;
  projectId: string;
  path: string;
  name: string;
  kind: PreviewKind;
  role: ArtifactRole;
  mimeType: string;
  createdAt: number;
  updatedAt: number;
  source: ArtifactSource;
  previewCapability: PreviewCapability;
  status: "ready" | "missing";
}

export type WorkspaceSurface = "chat" | "split" | "code";

export type ProjectViewPhase =
  | "chat-only"
  | "resolving"
  | "runtime-starting"
  | "artifact-loading"
  | "active"
  | "preview-error"
  | "runtime-error"
  | "unsupported"
  | "no-artifact";

export type ViewControl = "automatic" | "manual";

export type RuntimeStatus = "idle" | "approval" | "starting" | "ready" | "stopped" | "error";

export interface RuntimeSnapshot {
  status: RuntimeStatus;
  jobId: string | null;
  command: string | null;
  url: string | null;
  error: string | null;
  log: string;
}

export interface WorkspaceNotice {
  text: string;
  artifactId: string;
}

export interface PersistedWorkspace {
  control: ViewControl;
  surface: WorkspaceSurface;
  activeArtifactId: string | null;
  splitPercent: number;
}
