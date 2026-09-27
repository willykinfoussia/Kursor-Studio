import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileInspection, VerificationProfile } from "../../lib/agent/verification/types";
import { agentRuntime } from "../../lib/agent/AgentRuntime";

const { persist, saveOverlay } = vi.hoisted(() => ({
  persist: vi.fn(),
  saveOverlay: vi.fn(),
}));

vi.mock("../../lib/agent/AgentRuntime", () => ({
  agentRuntime: {
    verification: () => ({
      inspect: async () => inspection,
      loadState: async () => ({ lastReport: null, history: [] }),
      saveOverlay,
      persist,
    }),
    runVerification: vi.fn(),
    cancelVerification: vi.fn(),
  },
}));

import { useVerificationStore } from "../verificationStore";

const inspection: ProfileInspection = {
  ecosystem: "node",
  detectedFrom: ["package.json"],
  auto: { test: "pnpm test" },
  overlay: {},
  resolved: { test: "pnpm test" },
  checks: [
    { kind: "typecheck", origin: "absent" },
    { kind: "lint", origin: "absent" },
    { kind: "test", origin: "auto", autoCommand: "pnpm test", command: "pnpm test" },
    { kind: "build", origin: "absent" },
    { kind: "runtime", origin: "absent" },
  ],
  hasCustom: false,
};

describe("verificationStore", () => {
  beforeEach(() => {
    persist.mockReset();
    saveOverlay.mockReset();
    vi.mocked(agentRuntime.runVerification).mockReset();
    vi.mocked(agentRuntime.runVerification).mockResolvedValue({
      ok: true,
      attempts: 1,
      results: [],
      blockers: [],
      missingFiles: [],
    });
    saveOverlay.mockImplementation(async (overlay: VerificationProfile) => ({
      ...inspection,
      overlay,
      resolved: { ...inspection.resolved, ...overlay },
    }));
    useVerificationStore.setState({
      inspection,
      lastReport: null,
      history: [],
      liveResults: [],
      runningId: null,
      requestId: null,
      trigger: null,
      phase: "idle",
      startedAt: null,
      activeCommand: null,
      running: false,
      stopping: false,
      loading: false,
      error: null,
      selectedId: null,
      detailsOpen: false,
      editorOpen: false,
      addOpen: false,
      health: "not-verified",
      suite: [],
      gaps: [],
      ecosystem: "Node.js",
    });
  });

  it("starts empty as not verified", () => {
    expect(useVerificationStore.getState().health).toBe("not-verified");
    useVerificationStore.getState().applyEvent({
      type: "verification-started",
      requestId: "r1",
      trigger: "manual",
    });
    expect(useVerificationStore.getState().health).toBe("running");
    expect(useVerificationStore.getState().suite.find((item) => item.kind === "test")?.status).toBe("waiting");
  });

  it("moves running to verified on a passing report", () => {
    const result = {
      kind: "test" as const,
      command: "pnpm test",
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      diagnosis: "",
      ok: true,
      durationMs: 12,
    };
    const store = useVerificationStore.getState();
    store.applyEvent({ type: "verification-started", requestId: "r1", trigger: "manual" });
    store.applyEvent({ type: "verification-check-started", requestId: "r1", kind: "test", command: "pnpm test" });
    store.applyEvent({ type: "verification-check-completed", requestId: "r1", result });
    store.applyEvent({
      type: "verification-completed",
      requestId: "r1",
      ok: true,
      blockers: [],
      commands: ["pnpm test"],
      attempt: 1,
      results: [result],
      trigger: "manual",
    });
    expect(useVerificationStore.getState().running).toBe(false);
    expect(useVerificationStore.getState().phase).toBe("finished");
    expect(useVerificationStore.getState().health).toBe("verified");
    expect(useVerificationStore.getState().suite.find((item) => item.kind === "test")?.status).toBe("passed");
    expect(persist).not.toHaveBeenCalled();
  });

  it("marks denied checks blocked rather than skipped", () => {
    const result = {
      kind: "test" as const,
      command: "pnpm test",
      exitCode: null,
      stdout: "",
      stderr: "",
      diagnosis: "denied",
      ok: false,
      denied: true,
    };
    useVerificationStore.getState().applyEvent({
      type: "verification-completed",
      requestId: "r1",
      ok: false,
      blockers: ["denied"],
      commands: ["pnpm test"],
      attempt: 1,
      results: [result],
      trigger: "agent",
    });
    const state = useVerificationStore.getState();
    expect(state.health).toBe("blocked");
    expect(state.suite.find((item) => item.kind === "test")?.status).toBe("blocked");
    expect(state.suite.find((item) => item.kind === "test")?.status).not.toBe("skipped");
    expect(persist).toHaveBeenCalled();
  });

  it("opens the check as soon as a manual run starts", async () => {
    vi.mocked(agentRuntime.runVerification).mockImplementation(async () => {
      const state = useVerificationStore.getState();
      expect(state.phase).toBe("launching");
      expect(state.running).toBe(true);
      expect(state.detailsOpen).toBe(true);
      expect(state.selectedId).toBe("standard:test");
      expect(state.activeCommand).toBe("pnpm test");
      expect(state.suite.find((item) => item.id === "standard:test")?.status).toBe("running");
    });
    await useVerificationStore.getState().runItem({
      id: "standard:test",
      kind: "test",
      name: "Test",
      command: "pnpm test",
      origin: "auto",
      status: "idle",
    });
    expect(agentRuntime.runVerification).toHaveBeenCalledWith({ kinds: ["test"] });
  });

  it("follows the running check and records approval", () => {
    const store = useVerificationStore.getState();
    store.applyEvent({ type: "verification-started", requestId: "r1", trigger: "manual" });
    store.applyEvent({ type: "verification-check-started", requestId: "r1", kind: "test", command: "pnpm test" });
    expect(useVerificationStore.getState().phase).toBe("running");
    expect(useVerificationStore.getState().detailsOpen).toBe(true);
    expect(useVerificationStore.getState().activeCommand).toBe("pnpm test");
    useVerificationStore.getState().noteApproval(true);
    expect(useVerificationStore.getState().phase).toBe("approval");
    useVerificationStore.getState().noteApproval(false);
    expect(useVerificationStore.getState().phase).toBe("running");
  });

  it("marks a cancelled run as stopped", () => {
    useVerificationStore.getState().applyEvent({
      type: "verification-completed",
      requestId: "r1",
      ok: false,
      blockers: [],
      commands: [],
      attempt: 1,
      cancelled: true,
      trigger: "manual",
    });
    expect(useVerificationStore.getState().phase).toBe("stopped");
    expect(useVerificationStore.getState().running).toBe(false);
  });

  it("saves overlay without copying auto commands", async () => {
    await useVerificationStore.getState().saveOverlay({ lint: false });
    expect(saveOverlay).toHaveBeenCalledWith({ lint: false });
    expect(useVerificationStore.getState().editorOpen).toBe(false);
  });
});
