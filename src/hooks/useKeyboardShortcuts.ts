import { useEffect } from "react";
import { APP_COMMANDS } from "../lib/commands/appCommands";
import { commandShortcuts, isNativeInput, matchesShortcut } from "../lib/commands/shortcuts";
import { useGitStore } from "../stores/gitStore";
import { useReviewStore } from "../stores/reviewStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useTerminalStore } from "../stores/terminalStore";
import { useUiStore } from "../stores/uiStore";

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const ui = useUiStore.getState();

      if (event.key === "Escape") {
        if (ui.commandPalette) {
          event.preventDefault();
          ui.setCommandPalette(false);
          return;
        }
        if (ui.quickOpen) {
          event.preventDefault();
          ui.setQuickOpen(false);
          return;
        }
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      const gitView = ui.activeView === "github";
      const openReviewShortcut = useSettingsStore.getState().reviewOpenShortcut || "Ctrl+Shift+R";

      if (matchesShortcut(event, openReviewShortcut)) {
        event.preventDefault();
        useReviewStore.getState().openReview();
        return;
      }

      if (modifier && !event.shiftKey && !event.altKey && (event.key === "`" || event.code === "Backquote")) {
        event.preventDefault();
        useTerminalStore.getState().toggle();
        return;
      }

      if (gitView && modifier && event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void useGitStore.getState().analyze();
        return;
      }

      if (gitView && modifier && !event.shiftKey && event.key.toLowerCase() === "enter") {
        event.preventDefault();
        void useGitStore.getState().commit();
        return;
      }

      for (const command of APP_COMMANDS) {
        if (!commandShortcuts(command).some((shortcut) => matchesShortcut(event, shortcut))) continue;
        event.preventDefault();
        if (command.when === "skip-native-input" && isNativeInput(event.target)) return;
        command.run();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
