import type { MCPServerConfig } from "../types";
import type { BuiltInConfigContext, BuiltInMCPDefinition } from "./types";

export type PlaywrightBrowser = "chrome" | "firefox" | "webkit" | "msedge";

export interface PlaywrightSettings {
  browser: PlaywrightBrowser;
  headless: boolean;
  viewportWidth: number;
  viewportHeight: number;
  proxy?: string;
  secretsFile?: string;
}

export function playwrightSettings(raw: Record<string, unknown> = {}): PlaywrightSettings {
  const browser = raw.browser === "firefox" || raw.browser === "webkit" || raw.browser === "msedge" ? raw.browser : "chrome";
  return {
    browser,
    headless: raw.headless === true,
    viewportWidth: numberValue(raw.viewportWidth) ?? 1280,
    viewportHeight: numberValue(raw.viewportHeight) ?? 720,
    proxy: stringValue(raw.proxy),
    secretsFile: stringValue(raw.secretsFile),
  };
}

export function buildPlaywrightArgs(settings: PlaywrightSettings) {
  const args = ["-y", "@playwright/mcp@latest", `--browser=${settings.browser}`];
  if (settings.headless) args.push("--headless");
  args.push(`--viewport-size=${settings.viewportWidth}x${settings.viewportHeight}`);
  if (settings.proxy) args.push(`--proxy=${settings.proxy}`);
  if (settings.secretsFile) args.push(`--secrets=${settings.secretsFile}`);
  return args;
}

export function buildPlaywrightConfig(raw: Record<string, unknown>, extras?: BuiltInConfigContext): MCPServerConfig {
  const settings = playwrightSettings(raw);
  return {
    id: "playwright",
    name: "playwright",
    displayName: "Playwright MCP",
    enabled: extras?.enabled !== false,
    transport: "stdio",
    command: "npx",
    args: buildPlaywrightArgs(settings),
    scope: "project",
    origin: "builtin",
    trust: extras?.trusted === false ? "untrusted" : "trusted",
    projectId: extras?.projectId ?? null,
    timeoutMs: 60_000,
    metadata: {
      catalogId: "builtin.mcp.playwright",
      agentAccess: { coding: "full", research: "read-only" },
      settings,
    },
  };
}

export const playwrightDefinition: BuiltInMCPDefinition = {
  id: "builtin.mcp.playwright",
  serverId: "playwright",
  name: "playwright",
  displayName: "Playwright MCP",
  description: "Drive a real browser from the agent with Playwright MCP.",
  vendor: "Microsoft",
  category: "browser",
  transports: ["stdio"],
  defaultScope: "project",
  riskLevel: "high",
  docsUrl: "https://playwright.dev/docs/getting-started-mcp",
  websiteUrl: "https://github.com/microsoft/playwright-mcp",
  requirements: [
    { type: "executable", name: "node", required: true },
    { type: "executable", name: "npx", required: true },
  ],
  permissions: [
    {
      id: "browser",
      group: "Browser",
      action: "Launch and control a local browser",
      risk: "high",
      explanation: "The agent can navigate, click, and type. Secrets in tool results are redacted when a secrets file is set.",
    },
  ],
  setupSteps: ["node", "browser", "mode", "advanced", "permissions", "connect"],
  defaultSettings: {
    browser: "chrome",
    headless: false,
    viewportWidth: 1280,
    viewportHeight: 720,
  },
  buildConfig: buildPlaywrightConfig,
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
