import { builtInMcpRegistry } from "../builtin/registry";
import type { BuiltInMcpId } from "../builtin/types";
import { MCPConfigurationManager, mcpConfigurationManager } from "../MCPConfigurationManager";
import { MCPRegistry, mcpRegistry } from "../MCPRegistry";
import { DependencyDetector } from "./DependencyDetector";
import { SetupValidator } from "./SetupValidator";
import type { MCPSetupEventType, MCPSetupState, MCPSetupStep, SetupLogEvent } from "./types";

const GENERIC_STEPS: MCPSetupStep[] = [
  { id: "detect", title: "Detect", description: "Check required applications and tools." },
  { id: "configure", title: "Configure", description: "Set integration options." },
  { id: "permissions", title: "Permissions", description: "Review what this MCP can do." },
  { id: "save", title: "Save", description: "Write configuration without exposing secrets." },
  { id: "connect", title: "Connect", description: "Start the server and discover tools." },
  { id: "verify", title: "Verify", description: "Confirm the integration is ready." },
];

const STEP_MAP: Record<string, MCPSetupStep[]> = {
  "builtin.mcp.blender": [
    { id: "blender", title: "Check Blender", description: "Detect Blender 5.1 or newer." },
    { id: "addon", title: "Blender add-on", description: "Install or locate the official MCP add-on." },
    { id: "uv", title: "Check uv", description: "The MCP server is launched with uv." },
    { id: "server", title: "MCP server location", description: "Point Kursor at the blender_mcp repository." },
    { id: "permissions", title: "Security", description: "Blender MCP can execute generated code inside Blender." },
    { id: "connect", title: "Connect", description: "Start the server and discover tools." },
    { id: "verify", title: "Verify", description: "Confirm Blender MCP is ready." },
  ],
  "builtin.mcp.github": [
    { id: "account", title: "GitHub account", description: "Reuse the Kursor GitHub login." },
    { id: "access", title: "Access", description: "Choose read-only, standard, or advanced." },
    { id: "toolsets", title: "Toolsets", description: "Limit which GitHub APIs the agent can see." },
    { id: "permissions", title: "Permissions", description: "Review token use and write tools." },
    { id: "connect", title: "Connect", description: "Start the official GitHub MCP server." },
    { id: "verify", title: "Verify", description: "Confirm tools were discovered." },
  ],
  "builtin.mcp.composio": [
    { id: "credential", title: "API key", description: "Store the Composio key in SecretStore." },
    { id: "toolkits", title: "Apps", description: "Select toolkits. Nothing is enabled automatically." },
    { id: "tools", title: "Tools", description: "Limit enabled capabilities." },
    { id: "permissions", title: "Permissions", description: "Network, credentials, and high-risk actions." },
    { id: "connect", title: "Connect", description: "Connect the Composio MCP endpoint." },
    { id: "verify", title: "Verify", description: "Confirm the session is ready." },
  ],
  "builtin.mcp.playwright": [
    { id: "node", title: "Check Node.js", description: "Detect Node.js, npm, and npx." },
    { id: "browser", title: "Choose browser", description: "Chrome, Firefox, WebKit, or Edge." },
    { id: "mode", title: "Browser mode", description: "Headed by default so you can watch the agent." },
    { id: "advanced", title: "Configure", description: "Viewport, proxy, and secrets file." },
    { id: "permissions", title: "Permissions", description: "Review browser control." },
    { id: "connect", title: "Connect", description: "Start Playwright MCP." },
    { id: "verify", title: "Verify", description: "Confirm the browser session is ready." },
  ],
};

export class MCPSetupWizard {
  readonly state: MCPSetupState;

  constructor(
    definitionId: BuiltInMcpId,
    detector: DependencyDetector = new DependencyDetector(),
    private readonly validator = new SetupValidator(detector),
    initial?: Partial<MCPSetupState>,
    private readonly configuration: MCPConfigurationManager = mcpConfigurationManager,
    private readonly mcpTools: MCPRegistry = mcpRegistry,
  ) {
    const definition = builtInMcpRegistry.get(definitionId);
    if (!definition) throw new Error(`Unknown built-in MCP ${definitionId}.`);
    this.state = {
      stepIndex: 0,
      settings: { ...definition.defaultSettings, ...initial?.settings },
      logs: initial?.logs ?? [],
      validations: initial?.validations ?? {},
      canContinue: false,
      busy: false,
      ...initial,
      definitionId,
    };
    this.log("mcp-setup-started", `Starting ${definition.displayName} setup`);
  }

  definition() {
    const definition = builtInMcpRegistry.get(this.state.definitionId);
    if (!definition) throw new Error("Unknown built-in MCP.");
    return definition;
  }

  steps(): MCPSetupStep[] {
    return STEP_MAP[this.state.definitionId] ?? GENERIC_STEPS;
  }

  currentStep() {
    return this.steps()[this.state.stepIndex] ?? this.steps()[0]!;
  }

  patchSettings(patch: Record<string, unknown>) {
    this.state.settings = { ...this.state.settings, ...patch };
  }

  async refresh() {
    const definition = this.definition();
    const config = definition.buildConfig(this.state.settings);
    this.state.validations = await this.validator.validateDefinition(definition, this.state.settings, config);
    this.state.canContinue = this.stepCanContinue();
    return this.state.validations;
  }

  async next() {
    await this.refresh();
    if (!this.state.canContinue) return this.state;
    if (this.state.stepIndex < this.steps().length - 1) this.state.stepIndex += 1;
    try {
      await this.save();
    } catch {
      /* Config may still be incomplete. */
    }
    await this.refresh();
    return this.state;
  }

  back() {
    if (this.state.stepIndex > 0) this.state.stepIndex -= 1;
    this.state.canContinue = true;
    return this.state;
  }

  jumpTo(stepId: string) {
    const index = this.steps().findIndex((step) => step.id === stepId);
    if (index >= 0) this.state.stepIndex = index;
    return this.state;
  }

  async save(extras?: { projectId?: string | null; setupStep?: string | null; trusted?: boolean }) {
    const definition = this.definition();
    this.log("mcp-config-updated", "Saving configuration");
    const snapshot = await this.configuration.saveBuiltin(definition.id, this.state.settings, {
      projectId: extras?.projectId,
      trusted: extras?.trusted === true,
      setupStep: extras?.setupStep === undefined ? this.currentStep().id : extras.setupStep,
    });
    return snapshot;
  }

  async connect(projectId?: string | null) {
    const definition = this.definition();
    this.state.busy = true;
    try {
      this.log("mcp-server-started", `Starting ${definition.displayName}...`);
      await this.save({ projectId, setupStep: null, trusted: true });
      if (projectId !== undefined) await this.mcpTools.sync(projectId);
      const snapshot = await this.configuration.reconnect(definition.serverId);
      if (snapshot.status !== "ready" && snapshot.status !== "connected") {
        const reason = snapshot.lastError || "The server did not become ready.";
        this.log("mcp-setup-failed", reason, "error");
        this.state.error = reason;
        throw new Error(reason);
      }
      this.log("mcp-server-connected", "Connected");
      await this.mcpTools.sync(projectId);
      const discovery = this.mcpTools.discoveryFor(definition.serverId);
      const tools = discovery?.tools.length ?? snapshot.toolCount;
      this.log("mcp-discovery-completed", `${tools} tools discovered`, "valid");
      this.log("mcp-setup-completed", "Ready", "valid");
      this.state.error = undefined;
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Setup failed.";
      this.state.error = message;
      this.log("mcp-setup-failed", message, "error");
      throw error;
    } finally {
      this.state.busy = false;
    }
  }

  async dryRun() {
    const definition = this.definition();
    await this.refresh();
    const config = definition.buildConfig(this.state.settings, { trusted: true });
    this.log("mcp-config-updated", "Prepared dry-run configuration");
    return {
      config: mcpConfigurationManager.redactConfig(config),
      validations: this.state.validations,
      credentialNames: (config.env ?? []).filter((item) => item.secretRef).map((item) => item.name),
      command: config.command,
      args: config.args,
      url: config.url,
    };
  }

  summaryLines() {
    return Object.entries(this.state.validations).map(([name, item]) => {
      const mark = item.status === "valid" ? "✓" : item.status === "warning" ? "⚠" : "✗";
      return `${mark} ${name}: ${item.message}`;
    });
  }

  private stepCanContinue() {
    const step = this.currentStep().id;
    const needed: Record<string, string[]> = {
      blender: ["blender"],
      addon: ["blender-addon"],
      uv: ["uv"],
      server: ["mcp-server"],
      node: ["node", "npx"],
      account: ["github-account"],
      credential: ["api-key"],
    };
    const required = needed[step] ?? [];
    if (required.length === 0) return true;
    return required.every((name) => this.state.validations[name]?.status !== "error");
  }

  log(type: MCPSetupEventType | string, message: string, status?: SetupLogEvent["status"]) {
    this.state.logs.push({ type, message, status, at: Date.now() });
  }
}

export function stepsFor(id: BuiltInMcpId) {
  return STEP_MAP[id] ?? GENERIC_STEPS;
}

export { GENERIC_STEPS };
