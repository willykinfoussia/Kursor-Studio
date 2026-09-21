import { invokeCommand } from "./invoke";

export const secretsApi = {
  get: (key: string) => invokeCommand<string | null>("secret_get", { key }),
  set: (key: string, value: string) => invokeCommand<void>("secret_set", { key, value }),
  delete: (key: string) => invokeCommand<void>("secret_delete", { key }),
};
