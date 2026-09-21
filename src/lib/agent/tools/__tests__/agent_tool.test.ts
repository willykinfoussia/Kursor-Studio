import { describe, expect, it } from "vitest";
import {
  IMPLEMENT_MAX_DURATION_MS,
  EXPLORE_MAX_DURATION_MS,
  REVIEW_MAX_DURATION_MS,
  SUBAGENT_TOOL_TIMEOUT_MS,
} from "../../config";
import { createAgentTool } from "../workflowTools";

describe("agent tool timeout", () => {
  it("is at least as long as every specialist maxDuration", () => {
    const timeoutMs = createAgentTool().timeoutMs;
    expect(timeoutMs).toBe(SUBAGENT_TOOL_TIMEOUT_MS);
    expect(timeoutMs).toBeGreaterThanOrEqual(IMPLEMENT_MAX_DURATION_MS);
    expect(timeoutMs).toBeGreaterThanOrEqual(EXPLORE_MAX_DURATION_MS);
    expect(timeoutMs).toBeGreaterThanOrEqual(REVIEW_MAX_DURATION_MS);
  });
});
