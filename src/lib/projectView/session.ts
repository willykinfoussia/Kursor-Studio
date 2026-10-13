import { agentRuntime } from "../agent/AgentRuntime";
import { fileSystemService } from "../filesystem/FileSystemService";
import { processApi } from "../tauri/processApi";
import { useAgentStore } from "../../stores/agentStore";
import { useProjectStore } from "../../stores/projectStore";
import { readPersistedWorkspace, useProjectViewStore } from "../../stores/projectViewStore";
import { detectProject } from "./detector";
import { buildArtifacts } from "./artifacts";
import { extractLocalUrl } from "./runtime";

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshRequest = 0;
let launchToken = 0;
let hydratedProjectId: string | null = null;
const launchAttempts = new Set<string>();
let activeJob: { projectId: string; jobId: string } | null = null;

export function scheduleProjectViewRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    void refreshProjectView();
  }, 280);
}

export async function refreshProjectView() {
  const project = useProjectStore.getState().currentProject;
  if (!project) {
    hydratedProjectId = null;
    launchToken += 1;
    useProjectViewStore.getState().reset();
    return;
  }
  if (hydratedProjectId && hydratedProjectId !== project.id) {
    launchToken += 1;
    await killActiveJob();
  }
  const request = ++refreshRequest;
  const inspected = await inspectProject(project.id, useAgentStore.getState().filesChanged);
  if (request !== refreshRequest || useProjectStore.getState().currentProject?.id !== project.id) return;
  const store = useProjectViewStore.getState();
  if (hydratedProjectId !== project.id) {
    hydratedProjectId = project.id;
    store.hydrate({
      projectId: project.id,
      persisted: readPersistedWorkspace(project.id),
      ...inspected,
    });
  } else {
    store.sync(inspected);
  }
  void maybeAutoLaunch();
}

export async function requestPreviewLaunch(manual = false) {
  const project = useProjectStore.getState().currentProject;
  const state = useProjectViewStore.getState();
  const command = state.launchCommand;
  if (!project || !command) return;
  if (!manual && state.control === "manual" && state.surface === "chat") return;
  if (!manual && (state.runtime.status === "ready" || state.runtime.status === "starting" || state.runtime.status === "approval")) return;
  if (!manual && agentRuntime.getState().isStreaming) return;
  const key = `${project.id}:${command}`;
  if (!manual && launchAttempts.has(key)) return;
  if (manual) launchAttempts.delete(key);
  launchAttempts.add(key);
  const token = ++launchToken;
  useProjectViewStore.getState().applyRuntime({ status: "approval", command, error: null, url: null });
  const decision = await agentRuntime.authorizePreviewLaunch(command);
  if (token !== launchToken || useProjectStore.getState().currentProject?.id !== project.id) return;
  if (decision === "busy") {
    launchAttempts.delete(key);
    useProjectViewStore.getState().applyRuntime({ status: "idle", command, error: null, url: null });
    return;
  }
  if (decision !== "allow") {
    launchAttempts.add(key);
    useProjectViewStore.getState().applyRuntime({
      status: "idle",
      command,
      error: "Launch needs approval before the application can start.",
      url: null,
    });
    return;
  }
  await killActiveJob();
  useProjectViewStore.getState().applyRuntime({ status: "starting", command, error: null, log: "", url: null, jobId: null });
  try {
    const job = await processApi.start(command);
    if (token !== launchToken) {
      await processApi.kill(job.jobId).catch(() => undefined);
      return;
    }
    activeJob = { projectId: project.id, jobId: job.jobId };
    useProjectViewStore.getState().applyRuntime({ status: "starting", command, jobId: job.jobId, error: null });
    void pollPreview(job.jobId, token, project.id);
  } catch (error) {
    if (token !== launchToken) return;
    useProjectViewStore.getState().applyRuntime({
      status: "error",
      command,
      error: error instanceof Error ? error.message : "The application failed to start.",
      log: "",
      url: null,
    });
  }
}

async function maybeAutoLaunch() {
  const state = useProjectViewStore.getState();
  if (!state.launchCommand) return;
  if (state.control === "manual" && state.surface === "chat") return;
  if (state.runtime.status === "ready" || state.runtime.status === "starting" || state.runtime.status === "approval") return;
  await requestPreviewLaunch(false);
}

async function pollPreview(jobId: string, token: number, projectId: string) {
  const started = Date.now();
  const tick = async () => {
    if (token !== launchToken || useProjectStore.getState().currentProject?.id !== projectId) return;
    try {
      const output = await processApi.output(jobId);
      const log = `${output.stdout}\n${output.stderr}`.trim();
      const url = extractLocalUrl(log);
      if (url) {
        useProjectViewStore.getState().applyRuntime({ status: "ready", jobId, url, log, error: null, command: output.command });
        window.setTimeout(() => void watchUntilExit(jobId, token, projectId), 2000);
        return;
      }
      if (!output.running) {
        useProjectViewStore.getState().applyRuntime({
          status: "error",
          jobId,
          command: output.command,
          url: null,
          log,
          error: output.stderr.trim() || output.stdout.trim() || `The process exited with code ${output.exitCode ?? "unknown"}.`,
        });
        return;
      }
      if (Date.now() - started > 45_000) {
        useProjectViewStore.getState().applyRuntime({
          status: "error",
          jobId,
          command: output.command,
          url: null,
          log,
          error: "The server is still running, but it did not print a local URL.",
        });
        return;
      }
      useProjectViewStore.getState().applyRuntime({ status: "starting", jobId, command: output.command, log, error: null });
      window.setTimeout(() => void tick(), 700);
    } catch (error) {
      if (token !== launchToken) return;
      useProjectViewStore.getState().applyRuntime({
        status: "error",
        jobId,
        error: error instanceof Error ? error.message : "Unable to read the preview process.",
        log: useProjectViewStore.getState().runtime.log,
      });
    }
  };
  await tick();
}

async function watchUntilExit(jobId: string, token: number, projectId: string) {
  if (token !== launchToken || useProjectStore.getState().currentProject?.id !== projectId) return;
  try {
    const output = await processApi.output(jobId);
    if (output.running) {
      window.setTimeout(() => void watchUntilExit(jobId, token, projectId), 2500);
      return;
    }
    const log = `${output.stdout}\n${output.stderr}`.trim();
    useProjectViewStore.getState().applyRuntime({
      status: "stopped",
      jobId,
      command: output.command,
      log,
      error: null,
    });
  } catch {
    useProjectViewStore.getState().applyRuntime({ status: "stopped", jobId, error: null });
  }
}

async function killActiveJob() {
  const job = activeJob;
  activeJob = null;
  if (!job) return;
  await processApi.kill(job.jobId).catch(() => undefined);
}

async function inspectProject(projectId: string, agentPaths: string[]) {
  const walked = await fileSystemService.walkFiles();
  const paths = walked.map((file) => file.relativePath.replace(/\\/g, "/"));
  let scripts: Record<string, string> | undefined;
  let dependencyNames: string[] = [];
  if (paths.includes("package.json")) {
    try {
      const raw = await fileSystemService.readFile("package.json");
      const parsed = JSON.parse(raw) as {
        scripts?: Record<string, unknown>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      scripts = {};
      for (const [key, value] of Object.entries(parsed.scripts ?? {})) {
        if (typeof value === "string") scripts[key] = value;
      }
      dependencyNames = [...Object.keys(parsed.dependencies ?? {}), ...Object.keys(parsed.devDependencies ?? {})];
    } catch {
      scripts = undefined;
    }
  }
  const detected = detectProject({ paths, scripts, dependencyNames });
  const artifacts = buildArtifacts({
    projectId,
    files: walked.map((file) => ({ relativePath: file.relativePath, modifiedAt: file.modifiedAt })),
    agentPaths,
  });
  return { artifacts, category: detected.category, launchCommand: detected.launchCommand };
}
