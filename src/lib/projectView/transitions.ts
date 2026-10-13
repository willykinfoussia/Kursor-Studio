import { withRuntimeArtifact } from "./artifacts";
import { clampSplit } from "./runtime";
import type {
  PersistedWorkspace,
  ProjectArtifact,
  ProjectCategory,
  ProjectViewPhase,
  RuntimeSnapshot,
  RuntimeStatus,
  ViewControl,
  WorkspaceNotice,
  WorkspaceSurface,
} from "./types";

export interface WorkspaceSnapshot {
  projectId: string | null;
  surface: WorkspaceSurface;
  phase: ProjectViewPhase;
  control: ViewControl;
  pinned: boolean;
  activeArtifactId: string | null;
  artifacts: ProjectArtifact[];
  category: ProjectCategory;
  launchCommand: string | null;
  runtime: RuntimeSnapshot;
  splitPercent: number;
  announcedIds: string[];
  planPath: string | null;
}

export interface WorkspaceResult {
  state: WorkspaceSnapshot;
  notices: WorkspaceNotice[];
}

export type WorkspaceAction =
  | {
      type: "hydrate";
      projectId: string;
      persisted: PersistedWorkspace | null;
      artifacts: ProjectArtifact[];
      category: ProjectCategory;
      launchCommand: string | null;
    }
  | {
      type: "sync-artifacts";
      artifacts: ProjectArtifact[];
      category: ProjectCategory;
      launchCommand: string | null;
    }
  | { type: "runtime"; runtime: Partial<RuntimeSnapshot> & { status: RuntimeStatus } }
  | { type: "hide" }
  | { type: "show" }
  | { type: "follow" }
  | { type: "select"; artifactId: string }
  | { type: "step"; direction: -1 | 1 }
  | { type: "focus"; artifactId: string }
  | { type: "open-code" }
  | { type: "open-project" }
  | { type: "reveal-preview" }
  | { type: "show-plan"; path: string }
  | { type: "set-split"; splitPercent: number; width?: number }
  | { type: "reset" };

export function initialWorkspace(): WorkspaceSnapshot {
  return {
    projectId: null,
    surface: "chat",
    phase: "chat-only",
    control: "automatic",
    pinned: false,
    activeArtifactId: null,
    artifacts: [],
    category: "unknown",
    launchCommand: null,
    runtime: emptyRuntime(),
    splitPercent: 42,
    announcedIds: [],
    planPath: null,
  };
}

export function reduceWorkspace(state: WorkspaceSnapshot, action: WorkspaceAction): WorkspaceResult {
  switch (action.type) {
    case "reset":
      return { state: initialWorkspace(), notices: [] };
    case "hydrate":
      return hydrate(state, action);
    case "sync-artifacts":
      return syncArtifacts(state, action);
    case "runtime":
      return applyRuntime(state, action.runtime);
    case "hide":
      return { state: { ...state, control: "manual", surface: "chat" }, notices: [] };
    case "show":
      return show(state);
    case "follow":
      return follow(state);
    case "select":
      return select(state, action.artifactId, true);
    case "step":
      return step(state, action.direction);
    case "focus":
      return select(state, action.artifactId, true);
    case "open-code":
      return { state: { ...state, surface: "code" }, notices: [] };
    case "open-project":
      return openProject(state);
    case "reveal-preview":
      return { state: { ...state, surface: "split", phase: "active" }, notices: [] };
    case "show-plan":
      return showPlan(state, action.path);
    case "set-split":
      return {
        state: { ...state, splitPercent: clampSplit(action.splitPercent, action.width) },
        notices: [],
      };
    default:
      return { state, notices: [] };
  }
}

export function persistedFrom(state: WorkspaceSnapshot): PersistedWorkspace {
  return {
    control: state.control,
    surface: state.surface,
    activeArtifactId: state.activeArtifactId,
    splitPercent: state.splitPercent,
  };
}

function hydrate(state: WorkspaceSnapshot, action: Extract<WorkspaceAction, { type: "hydrate" }>): WorkspaceResult {
  const artifacts = withRuntimeArtifact(action.artifacts, action.launchCommand, action.projectId);
  const control = action.persisted?.control ?? "automatic";
  const splitPercent = clampSplit(action.persisted?.splitPercent ?? state.splitPercent);
  const remembered = action.persisted?.activeArtifactId ?? null;
  const active = artifacts.some((artifact) => artifact.artifactId === remembered) ? remembered : null;
  const hasContent = artifacts.length > 0;
  let surface: WorkspaceSurface = "chat";
  let phase: ProjectViewPhase = "chat-only";
  let nextActive = active;

  if (action.persisted?.surface === "code") {
    surface = "code";
    phase = hasContent ? "active" : "chat-only";
    nextActive = active ?? artifacts[0]?.artifactId ?? null;
  } else if (!hasContent) {
    surface = "chat";
    phase = "chat-only";
    nextActive = null;
  } else if (control === "manual" && action.persisted?.surface === "chat") {
    surface = "chat";
    phase = "active";
    nextActive = active ?? artifacts[0]?.artifactId ?? null;
  } else {
    surface = "split";
    phase = action.launchCommand ? "resolving" : "active";
    nextActive = active ?? artifacts[0]?.artifactId ?? null;
  }

  return {
    state: {
      ...state,
      projectId: action.projectId,
      artifacts,
      category: action.category,
      launchCommand: action.launchCommand,
      control,
      splitPercent,
      surface,
      phase,
      pinned: false,
      activeArtifactId: nextActive,
      runtime: emptyRuntime(),
      announcedIds: artifacts.map((artifact) => artifact.artifactId),
      planPath: null,
    },
    notices: [],
  };
}

function syncArtifacts(
  state: WorkspaceSnapshot,
  action: Extract<WorkspaceAction, { type: "sync-artifacts" }>,
): WorkspaceResult {
  const projectId = state.projectId ?? "";
  const artifacts = withRuntimeArtifact(action.artifacts, action.launchCommand, projectId);
  const previous = new Set(state.artifacts.map((artifact) => artifact.artifactId));
  const added = artifacts.filter((artifact) => artifact.kind !== "web-app" && !previous.has(artifact.artifactId));
  let active = state.activeArtifactId;
  if (active && !artifacts.some((artifact) => artifact.artifactId === active)) {
    active = artifacts.find((artifact) => artifact.artifactId !== active)?.artifactId ?? null;
  }

  const notices: WorkspaceNotice[] = [];
  const announced = new Set(state.announcedIds);
  let surface = state.surface;
  let phase = state.phase;
  const hidden = state.control === "manual" && surface === "chat";
  const keepCurrent = state.pinned || (Boolean(active) && surface !== "chat");

  const announce = (artifact: ProjectArtifact) => {
    if (announced.has(artifact.artifactId)) return;
    announced.add(artifact.artifactId);
    notices.push({ artifactId: artifact.artifactId, text: `${artifact.name} is ready to view.` });
  };

  if (artifacts.length === 0) {
    if (surface !== "code") {
      surface = "chat";
      phase = "chat-only";
    }
    active = null;
  } else if (hidden || surface === "code") {
    for (const artifact of added) announce(artifact);
    if (phase === "chat-only") phase = "active";
  } else if (!keepCurrent && state.control === "automatic" && (added.length > 0 || (state.launchCommand && !active))) {
    const web = state.launchCommand ? artifacts.find((artifact) => artifact.kind === "web-app") : undefined;
    surface = "split";
    phase = web ? "resolving" : "active";
    active = web?.artifactId ?? added[0]?.artifactId ?? active;
    if (active) announced.add(active);
    for (const artifact of added) announce(artifact);
  } else {
    for (const artifact of added) announce(artifact);
    if (surface === "split" && phase !== "runtime-error" && phase !== "runtime-starting") phase = "active";
  }

  if (!active && surface === "split" && artifacts[0]) {
    active = artifacts[0].artifactId;
  }

  return {
    state: {
      ...state,
      artifacts,
      category: action.category,
      launchCommand: action.launchCommand,
      activeArtifactId: active,
      surface,
      phase,
      announcedIds: [...announced],
    },
    notices,
  };
}

function applyRuntime(state: WorkspaceSnapshot, patch: Partial<RuntimeSnapshot> & { status: RuntimeStatus }): WorkspaceResult {
  const runtime: RuntimeSnapshot = {
    ...state.runtime,
    ...patch,
    error: Object.prototype.hasOwnProperty.call(patch, "error")
      ? patch.error ?? null
      : patch.status === "ready" || patch.status === "starting" ? null : state.runtime.error,
    log: patch.log ?? state.runtime.log,
  };
  const projectId = state.projectId ?? "";
  let artifacts = withRuntimeArtifact(
    state.artifacts.filter((artifact) => artifact.kind !== "web-app"),
    state.launchCommand ?? runtime.command,
    projectId,
  );
  let surface = state.surface;
  let phase = state.phase;
  let active = state.activeArtifactId;
  const notices: WorkspaceNotice[] = [];
  const announced = new Set(state.announcedIds);
  const hidden = state.control === "manual" && surface === "chat";
  const web = artifacts.find((artifact) => artifact.kind === "web-app");
  const sameReady = state.runtime.status === "ready" && runtime.status === "ready" && state.runtime.url === runtime.url;

  if ((runtime.status === "starting" || runtime.status === "approval") && !hidden && surface !== "code" && state.control === "automatic") {
    surface = "split";
    phase = "runtime-starting";
    active = active ?? web?.artifactId ?? null;
  }

  if (runtime.status === "ready" && runtime.url && web && !sameReady) {
    const keepCurrent = state.pinned || (Boolean(active) && active !== web.artifactId && surface !== "chat");
    if (hidden || surface === "code" || keepCurrent) {
      if (!announced.has(web.artifactId)) {
        announced.add(web.artifactId);
        notices.push({ artifactId: web.artifactId, text: "The application is ready to view." });
      }
      if (surface !== "chat") phase = "active";
    } else if (state.control === "automatic") {
      surface = "split";
      phase = "active";
      active = web.artifactId;
      announced.add(web.artifactId);
    }
  } else if (runtime.status === "error") {
    phase = "runtime-error";
    if (!hidden && surface !== "code") {
      surface = "split";
      active = active ?? web?.artifactId ?? null;
    } else if (runtime.error && !announced.has("runtime:error")) {
      announced.add("runtime:error");
      notices.push({ artifactId: web?.artifactId ?? "runtime:web", text: `Preview failed. ${runtime.error}` });
    }
  } else if (runtime.status === "stopped" && surface !== "chat") {
    phase = "active";
  } else if (runtime.status === "idle" && phase === "runtime-starting") {
    phase = artifacts.length > 0 ? "active" : "chat-only";
  }

  if (runtime.command && !state.launchCommand) {
    artifacts = withRuntimeArtifact(artifacts.filter((artifact) => artifact.kind !== "web-app"), runtime.command, projectId);
  }

  return {
    state: {
      ...state,
      runtime,
      artifacts,
      launchCommand: state.launchCommand ?? runtime.command,
      surface,
      phase,
      activeArtifactId: active,
      announcedIds: [...announced],
    },
    notices,
  };
}

function show(state: WorkspaceSnapshot): WorkspaceResult {
  if (state.artifacts.length === 0 && !state.launchCommand && state.runtime.status === "idle") {
    return { state: { ...state, surface: "chat", phase: "chat-only" }, notices: [] };
  }
  return {
    state: {
      ...state,
      surface: "split",
      phase: state.phase === "chat-only" ? "active" : state.phase,
      activeArtifactId: state.activeArtifactId ?? state.artifacts[0]?.artifactId ?? null,
    },
    notices: [],
  };
}

function follow(state: WorkspaceSnapshot): WorkspaceResult {
  if (state.artifacts.length === 0 && !state.launchCommand) {
    return { state: { ...state, control: "automatic", pinned: false, surface: "chat", phase: "chat-only" }, notices: [] };
  }
  return {
    state: {
      ...state,
      control: "automatic",
      pinned: false,
      surface: state.surface === "code" ? "code" : "split",
      phase: state.phase === "chat-only" ? "active" : state.phase,
      activeArtifactId: state.activeArtifactId ?? state.artifacts[0]?.artifactId ?? null,
    },
    notices: [],
  };
}

function select(state: WorkspaceSnapshot, artifactId: string, pin: boolean): WorkspaceResult {
  if (!state.artifacts.some((artifact) => artifact.artifactId === artifactId)) {
    return { state, notices: [] };
  }
  return {
    state: {
      ...state,
      pinned: pin,
      activeArtifactId: artifactId,
      surface: "split",
      phase: state.phase === "runtime-error" && artifactId === "runtime:web" ? "runtime-error" : "active",
    },
    notices: [],
  };
}

function step(state: WorkspaceSnapshot, direction: -1 | 1): WorkspaceResult {
  const index = state.artifacts.findIndex((artifact) => artifact.artifactId === state.activeArtifactId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= state.artifacts.length) return { state, notices: [] };
  return select(state, state.artifacts[next].artifactId, true);
}

function showPlan(state: WorkspaceSnapshot, path: string): WorkspaceResult {
  const planPath = path.trim();
  if (!planPath) return { state, notices: [] };
  return {
    state: { ...state, planPath, surface: "split" },
    notices: [],
  };
}

function openProject(state: WorkspaceSnapshot): WorkspaceResult {
  const canShow = state.artifacts.length > 0 || Boolean(state.launchCommand) || state.runtime.status !== "idle";
  if (!canShow) return { state: { ...state, planPath: null, surface: "chat", phase: "chat-only" }, notices: [] };
  return {
    state: {
      ...state,
      planPath: null,
      surface: "split",
      phase: state.phase === "chat-only" ? "active" : state.phase,
      activeArtifactId: state.activeArtifactId ?? state.artifacts[0]?.artifactId ?? null,
    },
    notices: [],
  };
}

function emptyRuntime(): RuntimeSnapshot {
  return { status: "idle", jobId: null, command: null, url: null, error: null, log: "" };
}
