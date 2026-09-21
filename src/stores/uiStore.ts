import { create } from "zustand";
import type { AppView, PanelSizes, SettingsSection } from "../types/ui";

interface UiState {
  activeView: AppView;
  settingsSection: SettingsSection;
  sidebarVisible: boolean;
  agentVisible: boolean;
  panelSizes: PanelSizes;
  quickOpen: boolean;
  commandPalette: boolean;
  setView: (view: AppView) => void;
  openSettings: (section: SettingsSection) => void;
  setSettingsSection: (section: SettingsSection) => void;
  toggleSidebar: () => void;
  toggleAgent: () => void;
  setPanelSizes: (sizes: Partial<PanelSizes>) => void;
  setQuickOpen: (open: boolean) => void;
  setCommandPalette: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  activeView: "project",
  settingsSection: "Account",
  sidebarVisible: true,
  agentVisible: true,
  panelSizes: { sidebar: 18, center: 54, agent: 28, editor: 70, terminal: 30 },
  quickOpen: false,
  commandPalette: false,
  setView: (activeView) => set({ activeView, agentVisible: activeView === "project" || activeView === "review" }),
  openSettings: (settingsSection) => set({ activeView: "settings", settingsSection, agentVisible: false }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  toggleAgent: () => set((state) => ({ agentVisible: !state.agentVisible })),
  setPanelSizes: (sizes) => set((state) => ({ panelSizes: { ...state.panelSizes, ...sizes } })),
  setQuickOpen: (quickOpen) => set({ quickOpen, commandPalette: quickOpen ? false : get().commandPalette }),
  setCommandPalette: (commandPalette) => set({ commandPalette, quickOpen: commandPalette ? false : get().quickOpen }),
}));
