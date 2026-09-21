export type AppView = "project" | "graph" | "run" | "agents" | "tests" | "capabilities" | "tasks" | "github" | "settings" | "projects" | "project-settings" | "review";

export const SETTINGS_SECTIONS = ["Account", "Appearance", "Editor", "AI", "Terminal", "Projects", "GitHub", "MCP", "Security", "Advanced"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export interface PanelSizes {
  sidebar: number;
  center: number;
  agent: number;
  editor: number;
  terminal: number;
}
