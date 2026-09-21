import { create } from "zustand";
import { fileSystemService } from "../lib/filesystem/FileSystemService";
import {
  PLAN_DIR,
  isPlanFilePath,
  normalizePlanPath,
  parsePlanFile,
  serializePlanFile,
} from "../lib/agent/plans/planFile";
import type { PlanDocument, PlanTodoStatus } from "../lib/agent/plans/types";
import { useAgentStore } from "./agentStore";

interface PlanState {
  plans: Record<string, PlanDocument>;
  activePlanId: string | null;
  dockConversationId: string | null;
  dockDismissed: boolean;
  dockExpanded: boolean;
  loading: boolean;
  error: string | null;
  upsertPlan: (plan: PlanDocument) => void;
  setActivePlan: (planId: string | null) => void;
  activatePlan: (planId: string) => void;
  demoteOpenPlansToDraft: (exceptPlanId?: string | null) => void;
  loadPlan: (path: string) => Promise<PlanDocument | null>;
  setTodoStatus: (planId: string, todoId: string, status: PlanTodoStatus) => Promise<void>;
  addTodo: (planId: string, content: string) => Promise<void>;
  savePlan: (planId: string) => Promise<void>;
  approve: (planId: string) => void;
  markBuilding: (planId: string) => void;
  markDone: (planId: string) => void;
  releaseBuilding: () => void;
  setDockExpanded: (expanded: boolean) => void;
  dismissDock: () => void;
  applyTodoStatus: (planId: string, todoId: string, status: PlanTodoStatus) => void;
  noteDiskChange: (path: string) => Promise<void>;
  loadProjectPlans: () => Promise<void>;
  reset: () => void;
}

async function persistPlan(plan: PlanDocument): Promise<void> {
  await fileSystemService.createDirectory(PLAN_DIR).catch(() => undefined);
  await fileSystemService.writeFile(plan.path, serializePlanFile({ ...plan, updatedAt: Date.now() }));
}

function touchTodos(plan: PlanDocument): { plan: PlanDocument; done: boolean } {
  const total = plan.todos.length;
  const done = total > 0 && plan.todos.every((todo) => todo.status === "completed");
  if (!done) return { plan, done: false };
  if (plan.status === "done") return { plan, done: true };
  return { plan: { ...plan, status: "done", updatedAt: Date.now() }, done: true };
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plans: {},
  activePlanId: null,
  dockConversationId: null,
  dockDismissed: false,
  dockExpanded: false,
  loading: false,
  error: null,
  upsertPlan: (plan) => set((state) => ({
    plans: { ...state.plans, [plan.id]: plan },
    activePlanId: state.activePlanId ?? plan.id,
  })),
  setActivePlan: (activePlanId) => set({ activePlanId }),
  activatePlan: (planId) => {
    get().demoteOpenPlansToDraft(planId);
    set({ activePlanId: planId });
  },
  demoteOpenPlansToDraft: (exceptPlanId) => {
    const demotedIds: string[] = [];
    set((state) => {
      const plans = { ...state.plans };
      for (const plan of Object.values(state.plans)) {
        if (exceptPlanId && (plan.id === exceptPlanId || plan.path === exceptPlanId)) continue;
        if (plan.status !== "approved" && plan.status !== "building") continue;
        plans[plan.id] = { ...plan, status: "draft", updatedAt: Date.now() };
        demotedIds.push(plan.id);
      }
      return { plans };
    });
    for (const id of demotedIds) {
      void get().savePlan(id);
    }
  },
  loadPlan: async (path) => {
    const normalized = normalizePlanPath(path);
    set({ loading: true, error: null });
    try {
      const raw = await fileSystemService.readFile(normalized);
      const plan = parsePlanFile(raw, normalized);
      set((state) => ({
        plans: { ...state.plans, [plan.id]: plan },
        activePlanId: plan.id,
        loading: false,
      }));
      return plan;
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load plan.",
      });
      return null;
    }
  },
  setTodoStatus: async (planId, todoId, status) => {
    const plan = get().plans[planId];
    if (!plan) return;
    const next: PlanDocument = {
      ...plan,
      todos: plan.todos.map((todo) => todo.id === todoId ? { ...todo, status } : todo),
      updatedAt: Date.now(),
    };
    const touched = touchTodos(next);
    set((state) => ({ plans: { ...state.plans, [planId]: touched.plan } }));
    try {
      await persistPlan(touched.plan);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to save plan." });
    }
  },
  addTodo: async (planId, content) => {
    const plan = get().plans[planId];
    const trimmed = content.trim();
    if (!plan || !trimmed) return;
    const next: PlanDocument = {
      ...plan,
      todos: [...plan.todos, { id: `todo-${Date.now().toString(36)}`, content: trimmed, status: "pending" }],
      status: plan.status === "done" ? "building" : plan.status,
      updatedAt: Date.now(),
    };
    set((state) => ({ plans: { ...state.plans, [planId]: next } }));
    try {
      await persistPlan(next);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to save plan." });
    }
  },
  savePlan: async (planId) => {
    const plan = get().plans[planId];
    if (!plan) return;
    try {
      await persistPlan(plan);
      set({ error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to save plan." });
    }
  },
  approve: (planId) => set((state) => {
    const plan = state.plans[planId];
    if (!plan) return state;
    return { plans: { ...state.plans, [planId]: { ...plan, status: "approved", updatedAt: Date.now() } } };
  }),
  markBuilding: (planId) => set((state) => {
    const plan = state.plans[planId];
    if (!plan) return state;
    return {
      plans: { ...state.plans, [planId]: { ...plan, status: "building", updatedAt: Date.now() } },
      activePlanId: planId,
      dockDismissed: false,
      dockConversationId: useAgentStore.getState().activeConversationId,
    };
  }),
  markDone: (planId) => set((state) => {
    const plan = state.plans[planId];
    if (!plan) return state;
    return { plans: { ...state.plans, [planId]: { ...plan, status: "done", updatedAt: Date.now() } } };
  }),
  releaseBuilding: () => {
    const buildingIds = Object.values(get().plans)
      .filter((plan) => plan.status === "building")
      .map((plan) => plan.id);
    if (buildingIds.length === 0) return;
    set((state) => {
      const plans = { ...state.plans };
      for (const id of buildingIds) {
        const plan = plans[id];
        if (!plan || plan.status !== "building") continue;
        plans[id] = { ...plan, status: "approved", updatedAt: Date.now() };
      }
      return { plans };
    });
    for (const id of buildingIds) {
      void get().savePlan(id);
    }
  },
  setDockExpanded: (dockExpanded) => set({ dockExpanded }),
  dismissDock: () => set({ dockDismissed: true, dockConversationId: null }),
  applyTodoStatus: (planId, todoId, status) => set((state) => {
    const plan = state.plans[planId]
      ?? Object.values(state.plans).find((item) => item.path === planId || item.id === planId);
    if (!plan) return state;
    const next = {
      ...plan,
      todos: plan.todos.map((todo) => todo.id === todoId ? { ...todo, status } : todo),
      updatedAt: Date.now(),
    };
    const touched = touchTodos(next);
    return { plans: { ...state.plans, [plan.id]: touched.plan } };
  }),
    noteDiskChange: async (path) => {
      if (!path || !isPlanFilePath(path)) return;
      try {
        const raw = await fileSystemService.readFile(normalizePlanPath(path));
        const plan = parsePlanFile(raw, path);
        set((state) => ({
          plans: { ...state.plans, [plan.id]: plan },
          activePlanId: state.activePlanId ?? plan.id,
        }));
      } catch {
        // Plan may have been deleted; keep the in-memory copy.
      }
    },
  loadProjectPlans: async () => {
    const scanned = await scanPlanDirectory();
    if (scanned.length === 0) return;
    set((state) => {
      const plans = { ...state.plans };
      for (const plan of scanned) plans[plan.id] = plan;
      const newest = [...scanned].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return { plans, activePlanId: state.activePlanId ?? newest?.id ?? null };
    });
  },
  reset: () => set({
    plans: {},
    activePlanId: null,
    dockConversationId: null,
    dockDismissed: false,
    dockExpanded: false,
    loading: false,
    error: null,
  }),
}));

export function activePlan(state: PlanState): PlanDocument | null {
  if (!state.activePlanId) return null;
  return state.plans[state.activePlanId] ?? null;
}

export function planByPath(state: PlanState, path: string): PlanDocument | null {
  const normalized = normalizePlanPath(path);
  const direct = Object.values(state.plans).find((plan) => plan.path === normalized);
  return direct ?? null;
}

/** Path of the latest non-done plan, used to hydrate workflowSession.planPath without approving. */
export function writablePlanPath(state: PlanState): string | null {
  const pick = (plan?: PlanDocument | null) => (plan && plan.status !== "done" ? plan.path : null);
  if (state.activePlanId) {
    const path = pick(state.plans[state.activePlanId]);
    if (path) return path;
  }
  const sorted = Object.values(state.plans).sort((a, b) => b.updatedAt - a.updatedAt);
  return pick(sorted.find((plan) => plan.status !== "done"));
}

/** Newest plan path, including done plans. */
export function latestPlanPath(state: PlanState): string | null {
  if (state.activePlanId) {
    const active = state.plans[state.activePlanId];
    if (active) return active.path;
  }
  const sorted = Object.values(state.plans).sort((a, b) => b.updatedAt - a.updatedAt);
  return sorted[0]?.path ?? null;
}

export function listedPlanPaths(state: PlanState): string[] {
  return Object.values(state.plans)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((plan) => plan.path);
}

export function planByRef(state: PlanState, ref: string): PlanDocument | null {
  const needle = ref.trim();
  if (!needle) return null;
  const normalized = normalizePlanPath(needle);
  const direct = state.plans[needle] ?? state.plans[normalized];
  if (direct) return direct;
  const lowered = needle.toLowerCase();
  return Object.values(state.plans).find((plan) =>
    plan.id === needle
    || plan.slug === needle
    || plan.path === needle
    || plan.path === normalized
    || plan.id.toLowerCase() === lowered
    || plan.slug.toLowerCase() === lowered
  ) ?? null;
}

type PlanScanFs = {
  listDirectory: (path: string) => Promise<{ name: string; path?: string; relativePath?: string; kind: string }[]>;
  readFile: (path: string) => Promise<string>;
};

export async function scanPlanDirectory(fs: PlanScanFs = fileSystemService): Promise<PlanDocument[]> {
  const entries = await fs.listDirectory(PLAN_DIR).catch(() => []);
  const plans: PlanDocument[] = [];
  for (const entry of entries) {
    if (entry.kind === "directory") continue;
    const path = normalizePlanPath(entry.relativePath || entry.path || `${PLAN_DIR}/${entry.name}`);
    if (!isPlanFilePath(path)) continue;
    try {
      plans.push(parsePlanFile(await fs.readFile(path), path));
    } catch {
      // Skip unreadable plan files.
    }
  }
  return plans;
}
