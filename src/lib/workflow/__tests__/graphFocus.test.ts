import { describe, expect, it } from "vitest";
import { focusedGraph, canDrillNode, focusStackForNode, followVisibleId } from "../graphFocus";
import { layoutPipeline } from "../GraphLayout";
import { idlePipelineGraph, PIPELINE_IDS, isEngineLayer, isPackedLoopChild } from "../pipelineSchema";

describe("graphFocus", () => {
  const idle = idlePipelineGraph();

  it("packs Superpowers filets in AgentLoop on the overview, not streamText", () => {
    const layer = focusedGraph(idle.nodes, idle.edges, []);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.loop)).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.skillCheck)).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.explain)).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.bug)).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.build)).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.brainstorming)).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.designGate)).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.debugging)).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.model)).toBe(false);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.router)).toBe(false);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.tools)).toBe(false);
    expect(layer.nodes.find((node) => node.id === PIPELINE_IDS.skillCheck)?.parentId).toBe(PIPELINE_IDS.loop);
    expect(layer.nodes.filter((node) => isPackedLoopChild(node)).every((node) => node.parentId === PIPELINE_IDS.loop)).toBe(true);
    expect(layer.edges.some((edge) => edge.source === PIPELINE_IDS.context && edge.target === PIPELINE_IDS.loop)).toBe(true);
    expect(layer.edges.some((edge) => edge.source === PIPELINE_IDS.skillCheck && edge.target === PIPELINE_IDS.explain)).toBe(true);
    expect(layer.edges.some((edge) => edge.source === PIPELINE_IDS.debugging && edge.target === PIPELINE_IDS.worktree)).toBe(false);
    expect(layer.edges.some((edge) => edge.source === PIPELINE_IDS.writingPlans && edge.target === PIPELINE_IDS.planResearch)).toBe(true);
    expect(layer.edges.some((edge) => edge.source === PIPELINE_IDS.planResearch && edge.target === PIPELINE_IDS.worktree)).toBe(true);
  });

  it("opens AgentLoop runtime only — no process skills", () => {
    const loop = idle.nodes.find((node) => node.id === PIPELINE_IDS.loop);
    expect(canDrillNode(loop!, idle.nodes)).toBe(true);
    const brainstorming = idle.nodes.find((node) => node.id === PIPELINE_IDS.brainstorming);
    expect(brainstorming?.metadata?.drillTarget).toBeUndefined();
    expect(canDrillNode(brainstorming!, idle.nodes)).toBe(false);
    expect(canDrillNode(idle.nodes.find((node) => node.id === PIPELINE_IDS.build)!, idle.nodes)).toBe(false);
    const layer = focusedGraph(idle.nodes, idle.edges, [{ id: PIPELINE_IDS.loop, label: "AgentLoop" }]);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.model)).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.router)).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.tools)).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.verification)).toBe(true);
    expect(layer.nodes.every((node) => isEngineLayer(node))).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.skillCheck)).toBe(false);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.brainstorming)).toBe(false);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.compact)).toBe(false);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.context)).toBe(false);
    expect(layer.nodes.every((node) => !node.parentId)).toBe(true);
  });

  it("opens Context Builder as a dedicated layer from overview", () => {
    const layer = focusedGraph(idle.nodes, idle.edges, [{ id: PIPELINE_IDS.context, label: "Context Builder" }]);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.slice("conversation"))).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.ctxRank)).toBe(true);
    expect(layer.nodes.some((node) => node.id === PIPELINE_IDS.model)).toBe(false);
  });

  it("builds a focus stack from engine nodes but not packed filets", () => {
    const stack = focusStackForNode(PIPELINE_IDS.ctxRank, idle.nodes);
    expect(stack.map((item) => item.id)).toEqual([PIPELINE_IDS.context]);
    expect(focusStackForNode(PIPELINE_IDS.model, idle.nodes).map((item) => item.id)).toEqual([PIPELINE_IDS.loop]);
    expect(focusStackForNode(PIPELINE_IDS.brainstorming, idle.nodes)).toEqual([]);
    expect(focusStackForNode(PIPELINE_IDS.skillCheck, idle.nodes)).toEqual([]);
  });

  it("follows a running descendant to a visible ancestor or packed node", () => {
    const overview = new Set([
      PIPELINE_IDS.loop,
      PIPELINE_IDS.context,
      PIPELINE_IDS.skillCheck,
      PIPELINE_IDS.brainstorming,
    ]);
    expect(followVisibleId(PIPELINE_IDS.skillCheck, overview, idle.nodes)).toBe(PIPELINE_IDS.skillCheck);
    expect(followVisibleId(PIPELINE_IDS.brainstorming, overview, idle.nodes)).toBe(PIPELINE_IDS.brainstorming);
    expect(followVisibleId(PIPELINE_IDS.model, overview, idle.nodes)).toBe(PIPELINE_IDS.loop);
    expect(followVisibleId(PIPELINE_IDS.ctxRank, overview, idle.nodes)).toBe(PIPELINE_IDS.context);
  });

  it("lays out an overview layer left to right with a sized AgentLoop box", () => {
    const layer = focusedGraph(idle.nodes, idle.edges, []);
    const positions = layoutPipeline(layer.nodes, layer.edges);
    const user = positions.get(PIPELINE_IDS.user);
    const task = positions.get(PIPELINE_IDS.task);
    const context = positions.get(PIPELINE_IDS.context);
    const loop = positions.get(PIPELINE_IDS.loop);
    const skillCheck = positions.get(PIPELINE_IDS.skillCheck);
    expect(user && task && user.position.x < task.position.x).toBe(true);
    expect(task && context && task.position.x < context.position.x).toBe(true);
    expect(context && loop && context.position.x < loop.position.x).toBe(true);
    expect(loop && skillCheck).toBeTruthy();
    expect((loop?.width ?? 0) > 240).toBe(true);
    expect((loop?.height ?? 0) > 84).toBe(true);
  });

  it("stacks explain / bug / build as parallel successors of the 1% check", () => {
    const layer = focusedGraph(idle.nodes, idle.edges, []);
    const positions = layoutPipeline(layer.nodes, layer.edges);
    const explain = positions.get(PIPELINE_IDS.explain);
    const bug = positions.get(PIPELINE_IDS.bug);
    const build = positions.get(PIPELINE_IDS.build);
    const skillCheck = positions.get(PIPELINE_IDS.skillCheck);
    expect(explain && bug && build && skillCheck).toBeTruthy();
    expect(Math.abs((explain?.position.x ?? 0) - (bug?.position.x ?? 1))).toBeLessThan(1);
    expect(Math.abs((bug?.position.x ?? 0) - (build?.position.x ?? 1))).toBeLessThan(1);
    expect((explain?.position.y ?? 0) !== (bug?.position.y ?? 0)).toBe(true);
    expect((skillCheck?.position.x ?? 0) < (explain?.position.x ?? 0)).toBe(true);
  });

  it("places executing-plans after the branch and VBC after TDD", () => {
    const layer = focusedGraph(idle.nodes, idle.edges, []);
    const positions = layoutPipeline(layer.nodes, layer.edges);
    const executing = positions.get(PIPELINE_IDS.executingPlans);
    const worktree = positions.get(PIPELINE_IDS.worktree);
    const tdd = positions.get(PIPELINE_IDS.tdd);
    const vbc = positions.get(PIPELINE_IDS.verificationBeforeCompletion);
    expect(executing && worktree && tdd && vbc).toBeTruthy();
    expect((worktree?.position.x ?? 0) < (executing?.position.x ?? 0)).toBe(true);
    expect((tdd?.position.x ?? 0) < (vbc?.position.x ?? 0)).toBe(true);
  });
});
