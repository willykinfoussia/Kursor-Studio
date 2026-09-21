export function matchesShortcut(event: KeyboardEvent, shortcut: string) {
  const parts = shortcut.toLowerCase().split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  const key = parts[parts.length - 1]!;
  const wantCtrl = parts.includes("ctrl") || parts.includes("control") || parts.includes("cmd") || parts.includes("meta");
  const wantShift = parts.includes("shift");
  const wantAlt = parts.includes("alt");
  const eventKey = event.key.toLowerCase() === " " ? "space" : event.key.toLowerCase();
  const eventCode = event.code.toLowerCase();
  const keyMatched = eventKey === key
    || (key === "," && (eventKey === "," || eventCode === "comma"))
    || (key === "pagedown" && eventCode === "pagedown")
    || (key === "pageup" && eventCode === "pageup")
    || (key === "tab" && eventCode === "tab");
  return keyMatched
    && Boolean(event.ctrlKey || event.metaKey) === wantCtrl
    && event.shiftKey === wantShift
    && event.altKey === wantAlt;
}

export function isNativeInput(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".monaco-editor")) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export function commandShortcuts(command: { shortcut?: string; aliases?: string[] }): string[] {
  return [command.shortcut, ...(command.aliases ?? [])].filter((item): item is string => Boolean(item));
}
