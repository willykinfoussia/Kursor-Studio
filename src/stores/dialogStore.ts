import { create } from "zustand";

export type UnsavedChoice = "save" | "discard" | "cancel";

interface DialogState {
  unsavedOpen: boolean;
  unsavedResolver: ((choice: UnsavedChoice) => void) | null;
  conflict: { path: string; name: string } | null;
  confirm: { title: string; message: string; confirmLabel: string; danger?: boolean } | null;
  confirmResolver: ((ok: boolean) => void) | null;
  prompt: { title: string; value: string } | null;
  promptResolver: ((value: string | null) => void) | null;
  askUnsaved: () => Promise<UnsavedChoice>;
  resolveUnsaved: (choice: UnsavedChoice) => void;
  showConflict: (path: string, name: string) => void;
  clearConflict: () => void;
  askConfirm: (title: string, message: string, confirmLabel?: string, danger?: boolean) => Promise<boolean>;
  resolveConfirm: (ok: boolean) => void;
  askPrompt: (title: string, value?: string) => Promise<string | null>;
  resolvePrompt: (value: string | null) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  unsavedOpen: false,
  unsavedResolver: null,
  conflict: null,
  confirm: null,
  confirmResolver: null,
  prompt: null,
  promptResolver: null,
  askUnsaved: () => new Promise((resolve) => {
    set({ unsavedOpen: true, unsavedResolver: resolve });
  }),
  resolveUnsaved: (choice) => {
    get().unsavedResolver?.(choice);
    set({ unsavedOpen: false, unsavedResolver: null });
  },
  showConflict: (path, name) => set({ conflict: { path, name } }),
  clearConflict: () => set({ conflict: null }),
  askConfirm: (title, message, confirmLabel = "Delete", danger = true) => new Promise((resolve) => {
    set({ confirm: { title, message, confirmLabel, danger }, confirmResolver: resolve });
  }),
  resolveConfirm: (ok) => {
    get().confirmResolver?.(ok);
    set({ confirm: null, confirmResolver: null });
  },
  askPrompt: (title, value = "") => new Promise((resolve) => {
    set({ prompt: { title, value }, promptResolver: resolve });
  }),
  resolvePrompt: (value) => {
    get().promptResolver?.(value);
    set({ prompt: null, promptResolver: null });
  },
}));
