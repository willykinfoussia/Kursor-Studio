/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalDock } from "../ApprovalDock";

afterEach(() => cleanup());

describe("ApprovalDock questions", () => {
  it("renders labeled choices instead of Allow/Deny", () => {
    const onSelect = vi.fn();
    render(
      <ApprovalDock
        entries={[{
          kind: "workflow",
          id: "q1",
          workflow: {
            id: "q1",
            runId: "r1",
            stepId: "question",
            summary: "Quelle sorte d'application de trading visez-vous ?",
            options: [
              { id: "crypto", label: "Crypto / Finance", description: "Cours temps réel, ordres buy/sell" },
              { id: "paper", label: "Simulation / Paper Trading", description: "Données fictives" },
            ],
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
        onSelectChoice={(_id, selected) => onSelect(selected)}
      />,
    );
    expect(screen.getByText("Quelle sorte d'application de trading visez-vous ?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deny" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Crypto \/ Finance/ }));
    expect(onSelect).toHaveBeenCalledWith("Crypto / Finance");
  });
});
