import { githubApi } from "../../tauri/githubApi";
import { mcpSecretKey, secretStore } from "../../agent/SecretStore";
import type { BuiltInMCPDefinition, MCPRequirement } from "../builtin/types";
import { COMPOSIO_API_KEY_REF } from "../builtin/composio";
import { parseSecretRef } from "../ids";
import { systemDetector } from "./ExecutableLocator";
import type { SetupValidation, SystemDetector } from "./types";

export class DependencyDetector {
  constructor(
    private readonly detector: SystemDetector = systemDetector,
    private readonly githubConnected: () => Promise<boolean> = () => githubApi.isAuthenticated().catch(() => false),
  ) {}

  async check(requirement: MCPRequirement, settings: Record<string, unknown> = {}): Promise<SetupValidation> {
    if (requirement.type === "executable") {
      const located = await this.detector.which(requirement.name);
      if (located.found) {
        return { status: "valid", message: `${requirement.name} detected`, detail: located.displayPath ?? located.path ?? located.version };
      }
      return {
        status: "error",
        message: `${requirement.name} not found`,
        repair: [
          { id: `locate:${requirement.name}`, label: `Locate ${requirement.name}` },
          { id: `docs:${requirement.name}`, label: "Install instructions" },
        ],
      };
    }
    if (requirement.name === "blender") {
      const blender = await this.detector.detectBlender();
      const path = typeof settings.blenderPath === "string" ? settings.blenderPath : blender?.path;
      if (!blender?.installed && !path) {
        return {
          status: "error",
          message: "Blender not detected",
          repair: [{ id: "locate:blender", label: "Locate Blender" }],
        };
      }
      if (blender && !blender.compatible) {
        return {
          status: "error",
          message: `Required: Blender ${blender.required}+. Detected: ${blender.version ?? "unknown"}. Upgrade required.`,
          detail: blender.path,
          repair: [{ id: "docs:blender", label: "Install instructions" }],
        };
      }
      return { status: "valid", message: `Blender ${blender?.version ?? ""}`.trim(), detail: path ?? blender?.path };
    }
    if (requirement.name === "blender-addon") {
      const host = typeof settings.addonHost === "string" ? settings.addonHost : "127.0.0.1";
      const port = typeof settings.addonPort === "number" ? settings.addonPort : 9876;
      const detected = await this.detector.probeTcp(host, port);
      if (detected) return { status: "valid", message: "Blender add-on listening", detail: `${host}:${port}` };
      return {
        status: "error",
        message: "Blender add-on not detected",
        repair: [
          { id: "docs:addon", label: "Install add-on" },
          { id: "retry:addon", label: "Retry" },
        ],
      };
    }
    if (requirement.name === "mcp-server") {
      const repo = typeof settings.repoPath === "string" ? settings.repoPath : "";
      if (repo) return { status: "valid", message: "MCP server location set", detail: repo };
      return {
        status: "error",
        message: "MCP server not found",
        repair: [
          { id: "locate:repo", label: "Locate" },
          { id: "detect:repo", label: "Detect" },
        ],
      };
    }
    if (requirement.name === "github-account") {
      const connected = await this.githubConnected();
      if (connected) return { status: "valid", message: "GitHub account connected" };
      return {
        status: "error",
        message: "GitHub account required",
        repair: [{ id: "connect:github", label: "Connect GitHub" }],
      };
    }
    if (requirement.name === "api-key") {
      const parsed = parseSecretRef(COMPOSIO_API_KEY_REF);
      const stored = await secretStore.get(parsed.key.startsWith("mcp:") ? parsed.key : mcpSecretKey("composio", "COMPOSIO_API_KEY"));
      if (stored) return { status: "valid", message: "API key stored" };
      return {
        status: "error",
        message: "Composio API key required",
        repair: [{ id: "credential:composio", label: "Enter API key" }],
      };
    }
    return { status: "pending", message: `${requirement.name} not checked` };
  }

  async checkAll(definition: BuiltInMCPDefinition, settings: Record<string, unknown> = {}) {
    const validations: Record<string, SetupValidation> = {};
    for (const requirement of definition.requirements) {
      validations[requirement.name] = await this.check(requirement, settings);
    }
    return validations;
  }
}

export const dependencyDetector = new DependencyDetector();
