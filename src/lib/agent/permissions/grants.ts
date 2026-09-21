import type { Capability, PermissionGrant } from "./types";
import { scopeCovers } from "./scope";

export class TaskGrantStore {
  private grants: PermissionGrant[] = [];

  add(grant: PermissionGrant) {
    this.grants.push(grant);
  }

  match(capability: Capability, toolName: string, input: unknown): PermissionGrant | undefined {
    return this.grants.find((grant) => (
      (grant.duration === "task" || grant.duration === "permanent")
      && grant.capability === capability
      && scopeCovers(grant.scope, toolName, input)
    ));
  }

  list(): readonly PermissionGrant[] {
    return this.grants;
  }

  clear() {
    this.grants = this.grants.filter((grant) => grant.duration === "permanent");
  }
}
