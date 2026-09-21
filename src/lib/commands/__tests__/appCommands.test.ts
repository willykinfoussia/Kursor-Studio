import { describe, expect, it } from "vitest";
import { commandShortcuts, matchesShortcut } from "../shortcuts";

function keyEvent(partial: Partial<KeyboardEvent> & { key: string; code?: string }): KeyboardEvent {
  return {
    key: partial.key,
    code: partial.code ?? "",
    ctrlKey: partial.ctrlKey ?? false,
    metaKey: partial.metaKey ?? false,
    shiftKey: partial.shiftKey ?? false,
    altKey: partial.altKey ?? false,
  } as KeyboardEvent;
}

describe("matchesShortcut", () => {
  it("distinguishes Ctrl+S from Ctrl+Shift+S", () => {
    expect(matchesShortcut(keyEvent({ key: "s", ctrlKey: true }), "Ctrl+S")).toBe(true);
    expect(matchesShortcut(keyEvent({ key: "s", ctrlKey: true, shiftKey: true }), "Ctrl+S")).toBe(false);
    expect(matchesShortcut(keyEvent({ key: "s", ctrlKey: true, shiftKey: true }), "Ctrl+Shift+S")).toBe(true);
  });

  it("matches Ctrl+Tab and Ctrl+,", () => {
    expect(matchesShortcut(keyEvent({ key: "Tab", code: "Tab", ctrlKey: true }), "Ctrl+Tab")).toBe(true);
    expect(matchesShortcut(keyEvent({ key: ",", code: "Comma", ctrlKey: true }), "Ctrl+,")).toBe(true);
  });
});

describe("commandShortcuts", () => {
  it("includes aliases", () => {
    expect(commandShortcuts({
      shortcut: "Ctrl+Tab",
      aliases: ["Ctrl+PageDown"],
    })).toEqual(["Ctrl+Tab", "Ctrl+PageDown"]);
  });
});
