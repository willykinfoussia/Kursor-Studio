import { settingsApi } from "../tauri/accountApi";

export const settingsRepository = {
  list: () => databaseSettingsFallback(),
  async listForAccount(accountId: string) {
    return settingsApi.globalList(accountId);
  },
  async get(key: string) {
    const items = await settingsRepository.list();
    return items.find((item) => item.key === key) ?? null;
  },
  set: (key: string, value: unknown) =>
    databaseSettingsSet(key, typeof value === "string" ? value : JSON.stringify(value)),
  setForAccount: (accountId: string, key: string, value: unknown) =>
    settingsApi.globalSet(accountId, key, typeof value === "string" ? value : JSON.stringify(value)),
};

export const projectSettingsRepository = {
  list: (projectId: string) => settingsApi.projectList(projectId),
  set: (projectId: string, key: string, value: unknown) =>
    settingsApi.projectSet(projectId, key, typeof value === "string" ? value : JSON.stringify(value)),
};

async function databaseSettingsFallback() {
  const { databaseApi } = await import("../tauri/databaseApi");
  return databaseApi.settingsList();
}

async function databaseSettingsSet(key: string, value: string) {
  const { databaseApi } = await import("../tauri/databaseApi");
  return databaseApi.settingsSet(key, value);
}
