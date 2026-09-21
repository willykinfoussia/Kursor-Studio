import type { MCPRuntime } from "./MCPRuntime";
import { mcpRuntime } from "./MCPRuntime";
import type { MCPHealthReport } from "./types";

export class MCPHealthService {
  constructor(private readonly runtime: MCPRuntime = mcpRuntime) {}

  check(id: string): Promise<MCPHealthReport> {
    return this.runtime.health(id);
  }

  line(report: MCPHealthReport) {
    const failed = report.checks.filter((item) => item.status === "fail");
    if (report.ok) return "Healthy";
    if (failed.length === 0) return "Unavailable";
    return failed.map((item) => item.label).join(" · ");
  }
}

export const mcpHealthService = new MCPHealthService();
