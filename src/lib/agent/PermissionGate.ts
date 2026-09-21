export type PermissionDecision = "allow" | "deny";

export interface PermissionGate {
  needsPrompt?(tool: string, input: unknown): boolean;
  authorize(tool: string, input: unknown): Promise<PermissionDecision>;
}

export function createAutomaticGate(automaticTools: boolean): PermissionGate {
  return {
    needsPrompt() {
      return false;
    },
    async authorize() {
      return automaticTools ? "allow" : "deny";
    },
  };
}

export const allowAllGate: PermissionGate = {
  needsPrompt() {
    return false;
  },
  async authorize() {
    return "allow";
  },
};
