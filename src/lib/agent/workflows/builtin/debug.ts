import type { Workflow } from "../types";

export const DEBUG_WORKFLOW: Workflow = {
  id: "debug",
  name: "Debug",
  description: "Reproduce, locate the cause, fix, verify.",
  steps: [
    {
      id: "reproduce",
      title: "Reproduce",
      minComplexity: "simple",
      requiresApproval: false,
      batch: "scope",
      prompt: "Reproduce the failure and capture the evidence. Do not patch blindly.",
    },
    {
      id: "locate",
      title: "Locate",
      minComplexity: "complex",
      requiresApproval: true,
      batch: "locate",
      prompt: "Name the root cause with evidence. Propose a minimal fix. Do not implement yet.",
    },
    {
      id: "fix",
      title: "Fix",
      minComplexity: "simple",
      requiresApproval: false,
      batch: "build",
      prompt: "Apply the smallest fix for the stated cause. Use tools.",
    },
    {
      id: "verify",
      title: "Verify",
      minComplexity: "simple",
      requiresApproval: false,
      batch: "close",
      prompt: "Re-run the failing case. Do not declare fixed without evidence.",
    },
    {
      id: "complete",
      title: "Complete",
      minComplexity: "simple",
      requiresApproval: false,
      batch: "close",
      prompt: "Summarize cause, fix, and verification. Do not merge or open a pull request.",
    },
  ],
};
