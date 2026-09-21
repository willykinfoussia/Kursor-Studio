import { blenderDefinition } from "./blender";
import { composioDefinition } from "./composio";
import { githubDefinition } from "./github";
import { playwrightDefinition } from "./playwright";
import {
  isSetupIncomplete,
  lifecycleFromSnapshot,
  readSettings,
  readSetupStep,
  type BuiltInMCPDefinition,
  type BuiltInMCPInstance,
  type BuiltInMcpId,
  type BuiltInMcpServerId,
} from "./types";
import type { MCPServerSnapshot } from "../types";

const DEFINITIONS: BuiltInMCPDefinition[] = [
  blenderDefinition,
  composioDefinition,
  githubDefinition,
  playwrightDefinition,
];

export class BuiltInMCPRegistry {
  list() {
    return DEFINITIONS;
  }

  get(id: BuiltInMcpId | BuiltInMcpServerId | string) {
    return DEFINITIONS.find((item) => item.id === id || item.serverId === id) ?? null;
  }

  instances(snapshots: readonly MCPServerSnapshot[]): BuiltInMCPInstance[] {
    return DEFINITIONS.map((definition) => {
      const snapshot = snapshots.find((item) => item.id === definition.serverId) ?? null;
      const setupIncomplete = isSetupIncomplete(snapshot);
      return {
        definition,
        snapshot,
        settings: { ...definition.defaultSettings, ...readSettings(snapshot) },
        status: lifecycleFromSnapshot(snapshot, setupIncomplete),
        setupStep: readSetupStep(snapshot),
      };
    });
  }
}

export const builtInMcpRegistry = new BuiltInMCPRegistry();
