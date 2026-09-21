/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlanCardBlock } from "../PlanCardBlock";
import { PlanProgressDock } from "../../PlanProgressDock";
import { createPlanDocument } from "../../../../lib/agent/plans/planFile";
import { usePlanStore } from "../../../../stores/planStore";
import { useAgentStore } from "../../../../stores/agentStore";

afterEach(() => cleanup());

beforeEach(() => {
  usePlanStore.getState().reset();
});

function seed(status: "draft" | "building" | "done" = "draft", dockConversationId: string | null = null) {
  const plan = createPlanDocument({ name: "Plan test", overview: "Démonstration du flux.", body: "", todos: ["Lire le plan", "Confirmer le plan"] });
  plan.todos[0]!.status = "completed";
  plan.status = status;
  usePlanStore.setState({
    plans: { [plan.id]: plan },
    activePlanId: plan.id,
    dockDismissed: false,
    dockExpanded: false,
    dockConversationId,
  });
  return plan;
}

function seedDock(status: "building" | "done") {
  return seed(status, useAgentStore.getState().activeConversationId);
}

describe("PlanCardBlock", () => {
  it("renders the plan card with a todo count and a Build button", () => {
    const plan = seed("draft");
    render(<PlanCardBlock planId={plan.id} />);
    expect(screen.getByText("Created Plan")).toBeTruthy();
    expect(screen.getByText("Plan test")).toBeTruthy();
    expect(screen.getByText("Démonstration du flux.")).toBeTruthy();
    expect(screen.getByText(/1 of 2 To-do/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Build/ })).toBeTruthy();
    expect(screen.getByText("View Plan")).toBeTruthy();
  });

  it("disables Build once the plan is done", () => {
    const done = createPlanDocument({ name: "Done", overview: "", body: "", todos: ["a", "b"] });
    done.todos[0]!.status = "completed";
    done.todos[1]!.status = "completed";
    done.status = "done";
    usePlanStore.setState({ plans: { [done.id]: done }, activePlanId: done.id });
    render(<PlanCardBlock planId={done.id} />);
    const button = screen.getByRole("button", { name: /To-dos Completed/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("PlanProgressDock", () => {
  it("stays hidden until Build has been clicked in this conversation", () => {
    seed("building");
    render(<PlanProgressDock />);
    expect(screen.queryByText("Build")).toBeNull();
  });

  it("shows n of m todos while building after Build", () => {
    const plan = seedDock("building");
    render(<PlanProgressDock />);
    expect(screen.getByText("Build")).toBeTruthy();
    expect(screen.getByText(plan.name)).toBeTruthy();
    expect(screen.getByText(/1 of 2 To-do/)).toBeTruthy();
  });

  it("expands to list every todo", () => {
    seedDock("building");
    render(<PlanProgressDock />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByText("Lire le plan")).toBeTruthy();
    expect(screen.getByText("Confirmer le plan")).toBeTruthy();
  });

  it("stays hidden for drafts and dismisses when done", () => {
    seed("draft");
    const { unmount } = render(<PlanProgressDock />);
    expect(screen.queryByText("Build")).toBeNull();
    unmount();
    seedDock("done");
    render(<PlanProgressDock />);
    expect(screen.getByText("Build")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss plan progress" }));
    expect(screen.queryByText("Build")).toBeNull();
  });

  it("does not appear after setActivePlan", () => {
    const plan = seed("done");
    usePlanStore.getState().setActivePlan(plan.id);
    render(<PlanProgressDock />);
    expect(screen.queryByText("Build")).toBeNull();
    expect(usePlanStore.getState().dockConversationId).toBeNull();
  });

  it("hides when the active conversation is not the one that clicked Build", () => {
    seed("building", "other-conversation");
    render(<PlanProgressDock />);
    expect(screen.queryByText("Build")).toBeNull();
  });

  it("appears after markBuilding in the current conversation", () => {
    const plan = seed("draft");
    usePlanStore.getState().markBuilding(plan.id);
    render(<PlanProgressDock />);
    expect(screen.getByText("Build")).toBeTruthy();
    expect(usePlanStore.getState().dockConversationId).toBe(useAgentStore.getState().activeConversationId);
  });
});
