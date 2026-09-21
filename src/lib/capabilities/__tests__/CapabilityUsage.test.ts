import { describe, expect, it } from "vitest";
import { aggregateCapabilityStats, usageFromSkillSelected, usageFromToolCall } from "../CapabilityUsage";

describe("capability usage aggregator", () => {
  it("aggregates observed tool and skill events", () => {
    const events = [
      usageFromToolCall({
        id: "t1",
        agentRunId: "run-a",
        toolName: "read_file",
        status: "completed",
        startedAt: 1000,
        finishedAt: 1120,
        agentId: "coding",
        projectId: "p1",
        title: "Add filter",
      }),
      usageFromToolCall({
        id: "t2",
        agentRunId: "run-a",
        toolName: "read_file",
        status: "failed",
        startedAt: 2000,
        finishedAt: 2100,
        agentId: "coding",
        projectId: "p1",
        title: "Add filter",
      }),
      usageFromSkillSelected({
        skillId: "prefer-const",
        origin: "builtin",
        runId: "run-a",
        startedAt: 900,
        title: "Add filter",
      }),
    ];
    const tools = aggregateCapabilityStats(events, "builtin.tool.read_file");
    expect(tools.totalUses).toBe(2);
    expect(tools.successRate).toBe(0.5);
    expect(tools.avgDurationMs).toBe(110);
    expect(tools.recentRuns[0]?.runId).toBe("run-a");
    const skills = aggregateCapabilityStats(events, "builtin.skill.prefer-const");
    expect(skills.totalUses).toBe(1);
    expect(aggregateCapabilityStats(events, "builtin.tool.write_file").totalUses).toBe(0);
    expect(aggregateCapabilityStats(events, "builtin.tool.write_file").successRate).toBeNull();
  });
});
