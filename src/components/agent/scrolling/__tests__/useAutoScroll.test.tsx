/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NewActivityButton } from "../NewActivityButton";
import { useAutoScroll } from "../useAutoScroll";

afterEach(() => cleanup());

function Harness({ height }: { height: number }) {
  const scroll = useAutoScroll([height]);
  return (
    <div>
      <div
        ref={scroll.ref}
        onScroll={scroll.onScroll}
        data-testid="scroller"
        style={{ height: 80, overflow: "auto" }}
      >
        <div style={{ height }} />
      </div>
      {scroll.showNewActivity && <NewActivityButton onClick={() => scroll.scrollToBottom(false)} />}
    </div>
  );
}

describe("useAutoScroll", () => {
  it("shows a new activity button after the user scrolls up", () => {
    const { rerender } = render(<Harness height={400} />);
    const scroller = screen.getByTestId("scroller");
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 400 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 80 });
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    rerender(<Harness height={500} />);
    expect(screen.getByRole("button", { name: "Jump to new activity" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Jump to new activity" }));
  });
});
