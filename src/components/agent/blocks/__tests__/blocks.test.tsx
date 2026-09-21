/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlanBlock } from "../PlanBlock";
import { ToolBlock } from "../ToolBlock";
import { ApprovalDock } from "../ApprovalDock";
import { VerificationBlock } from "../VerificationBlock";
import { CompletionBlock } from "../CompletionBlock";
import { TaskBlock } from "../TaskBlock";
import { ToolGroup } from "../ToolGroup";

afterEach(() => cleanup());

const presentation = { expanded: true, sticky: false, showDetails: true, focused: true };

describe("agent blocks", () => {
  it("shows a running tool and collapses when asked", () => {
    const { rerender } = render(
      <ToolBlock
        tool={{ id: "1", tool: "read_file", input: { path: "src/App.tsx" }, status: "running", startedAt: 1 }}
        presentation={presentation}
        onToggle={() => undefined}
      />,
    );
    expect(screen.getByText("read file")).toBeTruthy();
    rerender(
      <ToolBlock
        tool={{ id: "1", tool: "read_file", input: { path: "src/App.tsx" }, status: "completed", startedAt: 1, finishedAt: 43 }}
        presentation={{ ...presentation, expanded: false, showDetails: false }}
        onToggle={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
  });

  it("renders a compact completed plan", () => {
    render(
      <PlanBlock
        steps={[{ id: "1", title: "Inspect", status: "completed" }]}
        status="completed"
        presentation={{ ...presentation, expanded: false }}
        onToggle={() => undefined}
      />,
    );
    expect(screen.getByText(/Completed 1 task/)).toBeTruthy();
  });

  it("renders a compact subagent activity line", () => {
    render(
      <TaskBlock
        title="KEEP map"
        status="running"
        activity="Reading src/App.tsx..."
        presentation={{ ...presentation, expanded: false, showDetails: false }}
        onToggle={() => undefined}
      />,
    );
    expect(screen.getByText("KEEP map")).toBeTruthy();
    expect(screen.getByText("Reading src/App.tsx...")).toBeTruthy();
  });

  it("renders a sticky current task", () => {
    render(
      <TaskBlock
        title="Add authentication"
        status="running"
        activity="Reading src/lib/auth.ts..."
        presentation={{ ...presentation, sticky: true }}
        sticky
        onToggle={() => undefined}
      />,
    );
    expect(screen.getByText("Add authentication")).toBeTruthy();
    expect(screen.getByText("Reading src/lib/auth.ts...")).toBeTruthy();
    expect(screen.queryByText("65%")).toBeNull();
  });

  it("keeps approval in a fixed dock with cursor-like actions", () => {
    render(
      <ApprovalDock
        entries={[{
          kind: "permission",
          id: "p1",
          permission: {
            id: "p1",
            tool: "run_command",
            input: { command: "pnpm add zod" },
            reason: "Install dependency",
            riskLevel: "high",
            capability: "terminal.execute",
            scope: { kind: "project" },
            mode: "workspace-write",
          },
        }]}
        index={0}
        onIndexChange={() => undefined}
        workingDirectory="C:\\Projects\\Kursor"
        onDeny={() => undefined}
        onAllowOnce={() => undefined}
        onAllowTask={() => undefined}
        onAllowPermanent={() => undefined}
        onApprovePlan={() => undefined}
        onRejectPlan={() => undefined}
      />,
    );
    expect(screen.getByRole("alertdialog", { name: "Approval required" })).toBeTruthy();
    expect(screen.getByText("Kursor wants to run this command")).toBeTruthy();
    expect(screen.getByText("pnpm add zod")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow once" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deny" })).toBeTruthy();
  });

  it("removes the dock when there are no pending approvals", () => {
    const { rerender } = render(
      <ApprovalDock
        entries={[{
          kind: "permission",
          id: "p1",
          permission: {
            id: "p1",
            tool: "run_command",
            input: { command: "pnpm test" },
            reason: "test",
            riskLevel: "high",
            capability: "terminal.execute",
            scope: { kind: "project" },
            mode: "workspace-write",
          },
        }]}
        index={0}
        onIndexChange={() => undefined}
        onDeny={() => undefined}
        onAllowOnce={() => undefined}
        onAllowTask={() => undefined}
        onAllowPermanent={() => undefined}
        onApprovePlan={() => undefined}
        onRejectPlan={() => undefined}
      />,
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    rerender(
      <ApprovalDock
        entries={[]}
        index={0}
        onIndexChange={() => undefined}
        onDeny={() => undefined}
        onAllowOnce={() => undefined}
        onAllowTask={() => undefined}
        onAllowPermanent={() => undefined}
        onApprovePlan={() => undefined}
        onRejectPlan={() => undefined}
      />,
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("expands a failed verification", () => {
    render(
      <VerificationBlock
        status="completed"
        ok={false}
        blockers={["3 tests failed"]}
        commands={["pnpm test"]}
        attempt={1}
        presentation={presentation}
        onToggle={() => undefined}
      />,
    );
    expect(screen.getByText("3 tests failed")).toBeTruthy();
    expect(screen.getByText("OUTPUT")).toBeTruthy();
  });

  it("uses result names and does not invent Typecheck/Lint when commands are empty", () => {
    render(
      <VerificationBlock
        status="completed"
        ok={true}
        blockers={[]}
        commands={[]}
        results={[{
          kind: "custom",
          name: "unit",
          command: "vitest run",
          exitCode: 0,
          stdout: "",
          stderr: "",
          diagnosis: "",
          ok: true,
        }]}
        attempt={1}
        presentation={presentation}
        onToggle={() => undefined}
      />,
    );
    expect(screen.getByText(/unit passed/)).toBeTruthy();
    expect(screen.queryByText("Typecheck")).toBeNull();
    expect(screen.queryByText("Lint")).toBeNull();
    expect(screen.queryByText("Tests")).toBeNull();
    expect(screen.queryByText("Build")).toBeNull();
  });

  it("does not invent check labels when there are no commands and no results", () => {
    render(
      <VerificationBlock
        status="completed"
        ok={true}
        blockers={[]}
        commands={[]}
        attempt={1}
        presentation={presentation}
        onToggle={() => undefined}
      />,
    );
    expect(screen.getByText(/Verified changes\s+passed/)).toBeTruthy();
    expect(screen.queryByText("Typecheck")).toBeNull();
  });

  it("renders a completion summary", () => {
    render(
      <CompletionBlock
        summary="Added priority filtering."
        filesChanged={4}
        verificationOk
        testsHint="Tests passed"
        presentation={presentation}
        onToggle={() => undefined}
      />,
    );
    expect(screen.getByText("Task completed")).toBeTruthy();
    expect(screen.getByText("4 files changed")).toBeTruthy();
  });

  it("expands and collapses a tool group with the keyboard", () => {
    const onToggle = { current: false };
    const { rerender } = render(
      <ToolGroup
        items={[{ type: "tool", id: "tool:1", toolCallId: "1" }, { type: "tool", id: "tool:2", toolCallId: "2" }]}
        tools={new Map([
          ["1", { id: "1", tool: "read_file", input: { path: "src/a.ts" }, status: "completed" as const }],
          ["2", { id: "2", tool: "read_file", input: { path: "src/b.ts" }, status: "completed" as const }],
        ])}
        presentation={{ expanded: false, sticky: false, showDetails: false, focused: false }}
        onToggle={() => { onToggle.current = true; }}
      />,
    );
    const toggle = screen.getByRole("button", { expanded: false });
    fireEvent.keyDown(toggle, { key: "Enter" });
    fireEvent.click(toggle);
    expect(onToggle.current).toBe(true);
    rerender(
      <ToolGroup
        items={[{ type: "tool", id: "tool:1", toolCallId: "1" }, { type: "tool", id: "tool:2", toolCallId: "2" }]}
        tools={new Map([
          ["1", { id: "1", tool: "read_file", input: { path: "src/a.ts" }, status: "completed" as const }],
          ["2", { id: "2", tool: "read_file", input: { path: "src/b.ts" }, status: "completed" as const }],
        ])}
        presentation={{ expanded: true, sticky: false, showDetails: true, focused: false }}
        onToggle={() => { onToggle.current = false; }}
      />,
    );
    fireEvent.keyDown(screen.getByRole("button", { expanded: true }), { key: "Escape" });
    expect(screen.getByText("src/a.ts")).toBeTruthy();
  });
});
