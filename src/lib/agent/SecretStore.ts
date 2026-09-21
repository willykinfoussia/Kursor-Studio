import { secretsApi } from "../tauri/secretsApi";
import { isTauri } from "../tauri/invoke";

export const AI_GATEWAY_KEY = "AI_GATEWAY_API_KEY";
export const GITHUB_TOKEN_KEY = "GITHUB_ACCESS_TOKEN";

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class TauriSecretStore implements SecretStore {
  get(key: string) {
    return secretsApi.get(key);
  }

  set(key: string, value: string) {
    return secretsApi.set(key, value);
  }

  delete(key: string) {
    return secretsApi.delete(key);
  }
}

export class MemorySecretStore implements SecretStore {
  private readonly values = new Map<string, string>();

  constructor(initial?: Record<string, string>) {
    Object.entries(initial ?? {}).forEach(([key, value]) => this.values.set(key, value));
  }

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.values.set(key, value);
  }

  async delete(key: string) {
    this.values.delete(key);
  }
}

export function createSecretStore(): SecretStore {
  return isTauri() ? new TauriSecretStore() : new MemorySecretStore();
}

export const secretStore = createSecretStore();

export function mcpSecretKey(serverId: string, envName: string) {
  return `mcp:${serverId}:${envName}`;
}
