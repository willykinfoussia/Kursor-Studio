import { create } from "zustand";
import { agentRuntime } from "../lib/agent/AgentRuntime";
import type { AgentEvent } from "../lib/agent/types";
import {
  ecosystemLabel,
  healthFrom,
  suiteFrom,
  summaryFromReport,
  verificationGaps,
  type SuiteItem,
} from "../lib/agent/verification";
import type {
  ProfileInspection,
  StandardCheckKind,
  VerificationHealth,
  VerificationHistoryEntry,
  VerificationProfile,
  VerificationReport,
  VerificationRunInput,
} from "../lib/agent/verification/types";
import { useProjectStore } from "./projectStore";

interface VerificationUiState {
  inspection: ProfileInspection | null;
  lastReport: VerificationReport | null;
  history: VerificationHistoryEntry[];
  liveResults: import("../lib/agent/verification/types").CheckResult[];
  runningId: string | null;
  requestId: string | null;
  trigger: "agent" | "manual" | null;
  running: boolean;
  stopping: boolean;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  detailsOpen: boolean;
  editorOpen: boolean;
  addOpen: boolean;
  health: VerificationHealth;
  suite: SuiteItem[];
  gaps: string[];
  ecosystem: string;
  refresh: () => Promise<void>;
  runAll: () => Promise<void>;
  runItem: (item: SuiteItem) => Promise<void>;
  stop: () => void;
  saveOverlay: (overlay: VerificationProfile) => Promise<void>;
  select: (id: string | null) => void;
  setEditorOpen: (open: boolean) => void;
  setAddOpen: (open: boolean) => void;
  applyEvent: (event: AgentEvent) => void;
}

export const useVerificationStore = create<VerificationUiState>((set, get) => ({
  inspection: null,
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
  suite: [],
  gaps: [],
  ecosystem: "Unknown",
  refresh: async () => {
    const projectId = useProjectStore.getState().currentProject?.id ?? null;
    if (!projectId) {
      set({
        inspection: null,
        lastReport: null,
        history: [],
        loading: false,
        error: null,
        ...derived(null, null, { running: false }),
      });
      return;
    }
    set({ loading: true, error: null });
    try {
      const inspection = await agentRuntime.verification().inspect();
      const loaded = await agentRuntime.verification().loadState(projectId);
      const lastReport = get().running ? get().lastReport : loaded.lastReport;
      set({
        inspection,
        lastReport,
        history: loaded.history,
        loading: false,
        ...derived(inspection, lastReport, {
          running: get().running,
          runningId: get().runningId,
          liveResults: get().liveResults,
          stopping: get().stopping,
        }),
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load verification.",
      });
    }
  },
  runAll: async () => {
    set({ error: null, stopping: false });
    try {
      await agentRuntime.runVerification();
    } catch (error) {
      set({
        running: false,
        stopping: false,
        error: error instanceof Error ? error.message : "Unable to run verification.",
        ...derived(get().inspection, get().lastReport, { running: false }),
      });
    }
  },
  runItem: async (item) => {
    set({ error: null, stopping: false });
    try {
      await agentRuntime.runVerification(filterFor(item));
    } catch (error) {
      set({
        running: false,
        stopping: false,
        error: error instanceof Error ? error.message : "Unable to run check.",
        ...derived(get().inspection, get().lastReport, { running: false }),
      });
    }
  },
  stop: () => {
    if (!get().running) return;
    set({ stopping: true });
    agentRuntime.cancelVerification();
  },
  saveOverlay: async (overlay) => {
    const inspection = await agentRuntime.verification().saveOverlay(overlay);
    set({
      inspection,
      editorOpen: false,
      addOpen: false,
      ...derived(inspection, get().lastReport, {
        running: get().running,
        runningId: get().runningId,
        liveResults: get().liveResults,
      }),
    });
  },
  select: (id) => set({ selectedId: id, detailsOpen: Boolean(id) }),
  setEditorOpen: (editorOpen) => set({ editorOpen }),
  setAddOpen: (addOpen) => set({ addOpen }),
  applyEvent: (event) => {
    if (event.type === "verification-started") {
      set({
        running: true,
        stopping: false,
        liveResults: [],
        runningId: null,
        requestId: event.requestId,
        trigger: event.trigger ?? "agent",
        error: null,
        ...derived(get().inspection, get().lastReport, { running: true, waiting: true }),
      });
      return;
    }
    if (event.type === "verification-check-started") {
      const runningId = liveId(event);
      set({
        runningId,
        ...derived(get().inspection, mergeLive(get().lastReport, get().liveResults), {
          running: true,
          runningId,
          liveResults: get().liveResults,
        }),
      });
      return;
    }
    if (event.type === "verification-check-completed") {
      const liveResults = [...get().liveResults.filter((item) => liveKey(item) !== liveKey(event.result)), event.result];
      set({
        liveResults,
        runningId: null,
        lastReport: mergeLive(get().lastReport, liveResults),
        ...derived(get().inspection, mergeLive(get().lastReport, liveResults), {
          running: true,
          liveResults,
        }),
      });
      return;
    }
    if (event.type === "verification-completed") {
      const report: VerificationReport = {
        ok: event.ok,
        attempts: event.attempt,
        results: event.results ?? get().liveResults,
        blockers: event.blockers,
        missingFiles: (event.results ?? []).filter((result) => result.expectedFile && !result.ok).map((result) => result.name ?? "").filter(Boolean),
        durationMs: event.durationMs,
        cancelled: event.cancelled,
      };
      const entry = summaryFromReport(report, {
        trigger: event.trigger ?? "agent",
        requestId: event.requestId,
        runId: event.requestId,
      });
      const history = [entry, ...get().history.filter((item) => item.id !== entry.id)].slice(0, 50);
      set({
        running: false,
        stopping: false,
        liveResults: report.results,
        runningId: null,
        lastReport: report,
        history,
        ...derived(get().inspection, report, { running: false }),
      });
      if (event.trigger !== "manual") {
        void agentRuntime.verification().persist(report, {
          requestId: event.requestId,
          trigger: event.trigger ?? "agent",
          runId: event.requestId,
        });
      }
    }
  },
}));

function derived(
  inspection: ProfileInspection | null,
  report: VerificationReport | null,
  live: { running?: boolean; runningId?: string | null; liveResults?: VerificationReport["results"]; waiting?: boolean; stopping?: boolean },
) {
  const suite = suiteFrom(inspection, report, { runningId: live.runningId, waiting: live.running });
  return {
    health: healthFrom({ running: live.running, cancelled: live.stopping || report?.cancelled, report }),
    suite,
    gaps: verificationGaps(inspection),
    ecosystem: inspection ? ecosystemLabel(inspection.ecosystem, inspection.detectedFrom) : "Unknown",
  };
}

function mergeLive(previous: VerificationReport | null, liveResults: VerificationReport["results"]): VerificationReport {
  if (!liveResults.length) return previous ?? { ok: false, attempts: 1, results: [], blockers: [], missingFiles: [] };
  return {
    ok: liveResults.every((result) => result.ok || result.skipped || result.cancelled),
    attempts: previous?.attempts ?? 1,
    results: liveResults,
    blockers: liveResults.filter((result) => !result.ok && !result.skipped).map((result) => result.diagnosis),
    missingFiles: liveResults.filter((result) => result.expectedFile && !result.ok).map((result) => result.name ?? "").filter(Boolean),
  };
}

function liveId(event: Extract<AgentEvent, { type: "verification-check-started" }>) {
  if (event.expectedFile && event.name) return `file:${event.name}`;
  if (event.kind === "custom") return `custom:${event.name || event.command || ""}`;
  return `standard:${event.kind}`;
}

function liveKey(result: { kind: string; name?: string; command?: string; expectedFile?: boolean }) {
  if (result.expectedFile && result.name) return `file:${result.name}`;
  if (result.kind === "custom") return `custom:${result.name || result.command || ""}`;
  return `standard:${result.kind}`;
}

function filterFor(item: SuiteItem): {
  kinds?: VerificationRunInput["kinds"];
  customNames?: string[];
  expectedPaths?: string[];
} {
  if (item.kind === "files" && item.path) return { expectedPaths: [item.path] };
  if (item.kind === "custom") return { customNames: [item.name] };
  return { kinds: [item.kind as StandardCheckKind] };
}
