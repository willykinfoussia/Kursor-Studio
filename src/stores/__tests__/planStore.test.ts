import { beforeEach, describe, expect, it } from "vitest";
import { createPlanDocument, serializePlanFile } from "../../lib/agent/plans/planFile";
import { latestPlanPath, listedPlanPaths, planByRef, scanPlanDirectory, usePlanStore, writablePlanPath } from "../planStore";

beforeEach(() => {
  usePlanStore.getState().reset();
});

describe("planStore paths", () => {
  it("prefers a writable plan then falls back to the latest including done", () => {
    const draft = createPlanDocument({ name: "Draft", overview: "", body: "", todos: ["a"] });
    draft.updatedAt = 1;
    const done = createPlanDocument({ name: "Done", overview: "", body: "", todos: ["b"] });
    done.status = "done";
    done.updatedAt = 2;
    usePlanStore.setState({ plans: { [draft.id]: draft, [done.id]: done }, activePlanId: draft.id });
    expect(writablePlanPath(usePlanStore.getState())).toBe(draft.path);
    expect(latestPlanPath(usePlanStore.getState())).toBe(draft.path);
    usePlanStore.setState({ plans: { [done.id]: done }, activePlanId: done.id });
    expect(writablePlanPath(usePlanStore.getState())).toBeNull();
    expect(latestPlanPath(usePlanStore.getState())).toBe(done.path);
    usePlanStore.setState({ plans: { [done.id]: done, [draft.id]: draft }, activePlanId: null });
    expect(listedPlanPaths(usePlanStore.getState())).toEqual([done.path, draft.path]);
  });

  it("demotes approved and building plans to draft", () => {
    const approved = createPlanDocument({ name: "Approved", overview: "", body: "", todos: ["a"] });
    approved.status = "approved";
    const building = createPlanDocument({ name: "Building", overview: "", body: "", todos: ["b"] });
    building.status = "building";
    const done = createPlanDocument({ name: "Done", overview: "", body: "", todos: ["c"] });
    done.status = "done";
    usePlanStore.setState({
      plans: { [approved.id]: approved, [building.id]: building, [done.id]: done },
      activePlanId: approved.id,
    });
    usePlanStore.getState().demoteOpenPlansToDraft();
    const state = usePlanStore.getState();
    expect(state.plans[approved.id]?.status).toBe("draft");
    expect(state.plans[building.id]?.status).toBe("draft");
    expect(state.plans[done.id]?.status).toBe("done");
  });

  it("activatePlan sets the active id and drafts other approved plans", () => {
    const old = createPlanDocument({ name: "Old", overview: "", body: "", todos: ["a"] });
    old.status = "approved";
    const next = createPlanDocument({ name: "New", overview: "", body: "", todos: ["b"] });
    usePlanStore.setState({
      plans: { [old.id]: old, [next.id]: next },
      activePlanId: old.id,
    });
    usePlanStore.getState().activatePlan(next.id);
    const state = usePlanStore.getState();
    expect(state.activePlanId).toBe(next.id);
    expect(state.plans[old.id]?.status).toBe("draft");
    expect(state.plans[next.id]?.status).toBe("draft");
  });

  it("finds a plan by id, slug, or path", () => {
    const plan = createPlanDocument({ name: "Sport Fitness App", overview: "", body: "", todos: ["a"], slug: "sport-fitness-app_ab7a85" });
    usePlanStore.setState({ plans: { [plan.id]: plan }, activePlanId: plan.id });
    const state = usePlanStore.getState();
    expect(planByRef(state, "sport-fitness-app_ab7a85")?.path).toBe(plan.path);
    expect(planByRef(state, plan.id)?.path).toBe(plan.path);
    expect(planByRef(state, plan.path)?.slug).toBe("sport-fitness-app_ab7a85");
  });

  it("scans .kursor/plans for plan files", async () => {
    const plan = createPlanDocument({ name: "Fitness", overview: "", body: "# Body", todos: ["Verify"] });
    plan.status = "done";
    const files = new Map([[plan.path, serializePlanFile(plan)]]);
    const scanned = await scanPlanDirectory({
      listDirectory: async () => [
        { name: "fitness.plan.md", path: plan.path, relativePath: plan.path, kind: "file" },
        { name: "notes.txt", path: ".kursor/plans/notes.txt", kind: "file" },
        { name: "other", path: ".kursor/plans/other", kind: "directory" },
      ],
      readFile: async (path) => {
        const raw = files.get(path);
        if (!raw) throw new Error(`missing ${path}`);
        return raw;
      },
    });
    expect(scanned).toHaveLength(1);
    expect(scanned[0]?.name).toBe("Fitness");
    expect(scanned[0]?.status).toBe("done");
  });

  it("returns an empty list when the plans directory is missing", async () => {
    const scanned = await scanPlanDirectory({
      listDirectory: async () => {
        throw new Error("missing");
      },
      readFile: async () => "",
    });
    expect(scanned).toEqual([]);
  });
});
