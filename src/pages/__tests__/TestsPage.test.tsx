/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileInspection, VerificationReport } from "../../lib/agent/verification/types";
import { suiteFrom } from "../../lib/agent/verification";

const { inspect, loadState, saveOverlay } = vi.hoisted(() => ({
  inspect: vi.fn(),
  loadState: vi.fn(),
  saveOverlay: vi.fn(),
}));

vi.mock("../../lib/agent/AgentRuntime", () => ({
  agentRuntime: {
    verification: () => ({
      inspect: (...args: unknown[]) => inspect(...args),
      loadState: (...args: unknown[]) => loadState(...args),
      saveOverlay: (...args: unknown[]) => saveOverlay(...args),
      persist: vi.fn(),
    }),
    runVerification: vi.fn(),
    cancelVerification: vi.fn(),
  },
}));

import { TestsPage } from "../TestsPage";
import { useProjectStore } from "../../stores/projectStore";
import { useVerificationStore } from "../../stores/verificationStore";
import { CoveragePanel } from "../../components/verification/CoveragePanel";
import { VerifiedFunctionality } from "../../components/verification/VerifiedFunctionality";
import { VerificationHealth } from "../../components/verification/VerificationHealth";

const inspection: ProfileInspection = {
  ecosystem: "node",
  detectedFrom: ["package.json", "tsconfig.json"],
  auto: { test: "pnpm test", typecheck: "pnpm exec tsc --noEmit" },
  overlay: {},
  resolved: { test: "pnpm test", typecheck: "pnpm exec tsc --noEmit" },
  checks: [
    { kind: "typecheck", origin: "auto", autoCommand: "pnpm exec tsc --noEmit", command: "pnpm exec tsc --noEmit" },
    { kind: "lint", origin: "absent" },
    { kind: "test", origin: "auto", autoCommand: "pnpm test", command: "pnpm test" },
    { kind: "build", origin: "absent" },
    { kind: "runtime", origin: "absent" },
  ],
  hasCustom: false,
};

afterEach(() => cleanup());

beforeEach(() => {
  inspect.mockResolvedValue(inspection);
  loadState.mockResolvedValue({ lastReport: null, history: [] });
  useProjectStore.setState({
    currentProject: {
      id: "p1",
      accountId: "a1",
      name: "App",
      rootPath: "C:/app",
      localPath: "C:/app",
    },
  });
  useVerificationStore.setState({
    inspection,
    lastReport: null,
    history: [],
    liveResults: [],
    runningId: null,
    requestId: null,
    trigger: null,
    running: false,
    stopping: false,
    loading: false,
    error: null,
    selectedId: null,
    detailsOpen: false,
    editorOpen: false,
    addOpen: false,
    health: "not-verified",
    suite: suiteFrom(inspection, null),
    gaps: ["Coverage not collected"],
    ecosystem: "Node.js / TypeScript",
  });
});

describe("TestsPage", () => {
  it("shows an honest empty verification state", () => {
    render(<TestsPage />);
    expect(screen.getByText("Project Tests")).toBeTruthy();
    expect(screen.getByText("NOT VERIFIED")).toBeTruthy();
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Run verification" })).toBeTruthy();
  });

  it("distinguishes blocked from skipped", () => {
    const report: VerificationReport = {
      ok: false,
      attempts: 1,
      results: [
        {
          kind: "test",
          command: "pnpm test",
          exitCode: null,
          stdout: "",
          stderr: "",
          diagnosis: "denied",
          ok: false,
          denied: true,
        },
        {
          kind: "lint",
          exitCode: null,
          stdout: "",
          stderr: "",
          diagnosis: "no command",
          ok: true,
          skipped: true,
        },
      ],
      blockers: ["denied"],
      missingFiles: [],
    };
    loadState.mockResolvedValue({ lastReport: report, history: [] });
    useVerificationStore.setState({
      lastReport: report,
      health: "blocked",
      suite: suiteFrom(inspection, report),
    });
    render(<TestsPage />);
    expect(screen.getByText("BLOCKED")).toBeTruthy();
    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Skipped").length).toBeGreaterThan(0);
  });

  it("shows live running progress", () => {
    useVerificationStore.setState({
      running: true,
      health: "running",
      runningId: "standard:test",
      suite: suiteFrom(inspection, null, { runningId: "standard:test", waiting: true }),
    });
    render(<TestsPage />);
    expect(screen.getByText("RUNNING", { selector: ".verify-health-title" })).toBeTruthy();
    expect(screen.getByText(/Verifying/)).toBeTruthy();
    expect(screen.getByText("Running…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
  });
});

describe("honest empty panels", () => {
  it("does not invent coverage or feature maps", () => {
    render(<CoveragePanel />);
    expect(screen.getByText(/Coverage not collected/)).toBeTruthy();
    render(<VerifiedFunctionality />);
    expect(screen.getByText(/does not map tests to features yet/)).toBeTruthy();
    render(<VerificationHealth health="failed" />);
    expect(screen.getByText("FAILED")).toBeTruthy();
  });
});
