import { spawn } from "node:child_process";
import { join } from "node:path";
import { AgentRuntime } from "../AgentRuntime";
import { AI_MODELS } from "../config";
import { UsageMetrics } from "../metrics";
import { RecoveryManager } from "../recovery";
import { createBuiltinTools } from "../registerBuiltinTools";
import {
  CompactionManager,
  MemoryManager,
  MemoryRunStore,
  MemorySessionStore,
  MemoryToolCallStore,
  SessionManager,
} from "../session";
import { BUILTIN_SKILLS } from "../skills/parseSkill";
import { TaskManager } from "../tasks";
import { ToolRegistry } from "../ToolRegistry";
import { VerificationEngine } from "../verification";
import { WebFetchService } from "../web/WebFetchService";
import { WebSearchService } from "../web/WebSearchService";
import type { AgentEvent } from "../types";
import type { AgentGitService, AgentProcessService } from "../tools/native";
import { changedFiles, runAssertions, toolNames } from "./assert";
import { ScriptedAIService } from "./scripted";
import type { EvalReport, EvalScenario } from "./types";
import { createEvalWorkspace } from "./workspace";

export async function runEval(scenario: EvalScenario): Promise<EvalReport> {
  const workspace = await createEvalWorkspace(scenario.projectFixture);
  try {
    return await runEvalInWorkspace(scenario, workspace);
  } finally {
    await workspace.dispose();
  }
}

async function runEvalInWorkspace(scenario: EvalScenario, workspace: Awaited<ReturnType<typeof createEvalWorkspace>>): Promise<EvalReport> {
  const metrics = new UsageMetrics();
  const sessions = new SessionManager(new MemorySessionStore(), new MemoryRunStore(), new MemoryToolCallStore());
  const recovery = new RecoveryManager({
    files: workspace.asRecoveryFiles(),
    git: {
      async isRepo() { return false; },
      async stashCreate() { return null; },
      async showPath() { return null; },
      async restorePaths() {},
    },
  });
  const registry = new ToolRegistry();
  const processService = scenario.realProcess ? createWorkspaceProcess(workspace.root) : createFakeProcess();
  for (const tool of createBuiltinTools({
    fs: workspace.fs,
    process: processService,
    git: noopGit(),
    http: {
      async fetchText() {
        return { url: "https://example.com/docs", status: 200, contentType: "text/plain", body: "Example docs." };
      },
    },
    fetch: new WebFetchService(async (url) => fakeResponse(String(url), "Example documentation.")),
    search: new WebSearchService({
      id: "eval-fake",
      async search() {
        return [{ title: "Example docs", url: "https://example.com/docs", snippet: "Public API documentation." }];
      },
    }),
  })) {
    registry.register(tool);
  }

  const ai = new ScriptedAIService(scenario.script);
  const runtime = new AgentRuntime({
    aiService: ai,
    metrics,
    registry,
    files: workspace.asContextFiles(),
    recovery,
    sessions,
    compaction: new CompactionManager(),
    memory: new MemoryManager({
      saveStructured: async () => undefined,
      searchStructured: async () => [],
      indexSemantic: async () => undefined,
      searchSemantic: async () => [],
    }),
    killJob: async () => undefined,
    getProjectRoot: () => workspace.root,
    getProjectId: () => "eval-project",
    getConversationId: () => "eval-conversation",
    forceCheckpoint: scenario.afterRun === "rollback",
    tasks: new TaskManager(),
    verification: scenario.realVerification
      ? new VerificationEngine({ files: workspace.asContextFiles() })
      : new VerificationEngine({
        profile: scenario.verification.expectOk === false
          ? { test: "node --test" }
          : { typecheck: false, lint: false, test: false, build: false, runtime: false },
      }),
    checkRunner: scenario.realVerification
      ? undefined
      : {
        async run() {
          return scenario.verification.expectOk === false
            ? { exitCode: 1, stdout: "", stderr: "eval check failed" }
            : { exitCode: 0, stdout: "ok", stderr: "" };
        },
      },
    getSettings: () => ({
      defaultModel: AI_MODELS[0]?.id ?? "eval-model",
      fallbackEnabled: false,
      modelOrder: AI_MODELS.map((model) => model.id),
      simulateFailureFor: [],
      automaticTools: true,
      permissionMode: scenario.permissions.mode,
      confirmDestructive: scenario.permissions.confirmDestructive ?? false,
    }),
  });
  if (scenario.suite !== "safety") {
    runtime.workflowSession.skipProcess = true;
    runtime.workflowSession.approveDesign("eval");
  }
  if (scenario.realVerification || scenario.expectVerificationSequence) {
    runtime.workflowSession.approvePlan();
    runtime.workflowSession.setPlanTodosComplete(true);
    runtime.workflowSession.markSkillCheck("verification-before-completion");
  }

  const events: AgentEvent[] = [];
  runtime.subscribe((event) => {
    events.push(event);
    if (event.type === "permission-required") {
      runtime.resolvePermission(event.id, "allow-task");
    }
  });

  if (scenario.seedMessages?.length) {
    runtime.loadMessages(scenario.seedMessages);
  }

  const started = Date.now();
  try {
    await executeScenario(runtime, sessions, scenario, events);
  } catch {
    /* status is captured from runtime */
  }
  const latencyMs = Date.now() - started;
  const usage = metrics.snapshot();
  const tokens = {
    input: usage.reduce((sum, item) => sum + item.inputTokens, 0),
    output: usage.reduce((sum, item) => sum + item.outputTokens, 0),
  };
  const costEstimateUsd = usage.reduce((sum, item) => sum + item.costEstimateUsd, 0);
  const status = runtime.getState().status;
  const tools = toolNames(events);
  const filesChanged = changedFiles(events);
  const steps = runtime.getState().execution?.steps.length
    ?? events.filter((event) => event.type === "step-started").length;
  const checks = await runAssertions({
    scenario,
    workspace,
    status,
    events,
    messages: runtime.getState().messages,
    steps,
    latencyMs,
    costEstimateUsd,
    filesChanged,
  });
  const verificationCheck = checks.find((check) => check.name === "verification" || check.name === "tests-build");
  const report: EvalReport = {
    id: scenario.id,
    suite: scenario.suite,
    model: runtime.getState().activeModel || AI_MODELS[0]?.id || "eval-model",
    prompt: scenario.userPrompt,
    skillSet: BUILTIN_SKILLS.map((skill) => skill.id),
    success: checks.every((check) => check.ok),
    status,
    steps,
    tools,
    fallbacks: events.filter((event) => event.type === "fallback").length,
    latencyMs,
    tokens,
    costEstimateUsd,
    filesChanged,
    verification: {
      ok: verificationCheck?.ok ?? scenario.verification.expectOk,
      detail: verificationCheck?.detail ?? "",
    },
    checks,
    workspaceRoot: workspace.root,
  };
  return report;
}

async function executeScenario(
  runtime: AgentRuntime,
  sessions: SessionManager,
  scenario: EvalScenario,
  events: AgentEvent[],
) {
  if (scenario.afterRun === "resume") {
    const hang = waitForHang(events, scenario);
    const pending = runtime.sendMessage(scenario.userPrompt);
    await hang;
    runtime.cancel();
    await pending.catch(() => undefined);
    const sessionId = sessions.getActive()?.id;
    if (sessionId) await runtime.resumeTask(sessionId);
    return;
  }
  await runtime.sendMessage(scenario.userPrompt);
  if (scenario.afterRun === "rollback") {
    await runtime.rollbackRecovery();
  }
}

function waitForHang(events: AgentEvent[], scenario: EvalScenario) {
  const hangTool = scenario.script.flatMap((turn) => turn.tools ?? []).find((call) => call.hang)?.name;
  const deadline = Date.now() + Math.min(scenario.maxDurationMs, 8_000);
  return new Promise<void>((resolve, reject) => {
    const timer = setInterval(() => {
      const started = events.some((event) => (
        event.type === "tool-started" && (!hangTool || event.tool === hangTool)
      ));
      if (started) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for hanging tool."));
      }
    }, 10);
  });
}

function createWorkspaceProcess(root: string): AgentProcessService {
  return {
    async run(input) {
      const cwd = input.cwd ? join(root, input.cwd) : root;
      const result = await spawnCommand(input.command, cwd, input.timeoutMs);
      return {
        command: input.command,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
    },
    async start(input) {
      return { jobId: "eval-job", command: input.command };
    },
    async output(jobId) {
      return {
        jobId,
        command: "",
        stdout: "",
        stderr: "",
        running: false,
        exitCode: null,
        truncated: false,
      };
    },
    async kill() {},
  };
}

function spawnCommand(command: string, cwd: string, timeoutMs: number) {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  const bin = parts[0] ?? "node";
  const args = parts.slice(1);
  return new Promise<{ exitCode: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(bin, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: 1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

function createFakeProcess(): AgentProcessService {
  return {
    async run(input) {
      return {
        command: input.command,
        stdout: "ok",
        stderr: "",
        exitCode: 0,
      };
    },
    async start(input) {
      return { jobId: "eval-job", command: input.command };
    },
    async output(jobId) {
      return {
        jobId,
        command: "",
        stdout: "",
        stderr: "",
        running: false,
        exitCode: null,
        truncated: false,
      };
    },
    async kill() {},
  };
}

function noopGit(): AgentGitService {
  return {
    async status() {
      return { branch: "main", changedFiles: [], clean: true };
    },
    async diff() {
      return { path: null, diff: "" };
    },
    async commit() {
      return { committed: true, pushed: false };
    },
    async push() {},
    async pull() {},
    async fetch() {},
    async checkout() {},
    async createBranch() {},
  };
}

function fakeResponse(url: string, body: string): Response {
  return {
    url,
    status: 200,
    ok: true,
    headers: { get: () => "text/plain" },
    text: async () => body,
  } as unknown as Response;
}

export async function runEvals(scenarios: readonly EvalScenario[]): Promise<EvalReport[]> {
  const reports: EvalReport[] = [];
  for (const scenario of scenarios) {
    reports.push(await runEval(scenario));
  }
  return reports;
}
