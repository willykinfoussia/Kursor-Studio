import { invokeCommand } from "./invoke";
import type { AccountRecord, GitHubAccountRecord, ProjectGithubRepositoryRecord, ProjectRecord, SettingRecord } from "../storage/types";

export const accountApi = {
  current: () => invokeCommand<AccountRecord>("account_current"),
  upsert: (account: AccountRecord) => invokeCommand<AccountRecord>("account_upsert", { account }),
  markOnboarded: () => invokeCommand<AccountRecord>("account_mark_onboarded"),
  githubAccount: (accountId: string) =>
    invokeCommand<GitHubAccountRecord | null>("db_github_account_get", { accountId }, null),
};

export const settingsApi = {
  globalList: (accountId: string) =>
    invokeCommand<SettingRecord[]>("db_global_settings_list", { accountId }, []),
  globalSet: (accountId: string, key: string, value: string) =>
    invokeCommand<void>("db_global_settings_set", { accountId, key, value }, null as unknown as void),
  projectList: (projectId: string) =>
    invokeCommand<SettingRecord[]>("db_project_settings_list", { projectId }, []),
  projectSet: (projectId: string, key: string, value: string) =>
    invokeCommand<void>("db_project_settings_set", { projectId, key, value }, null as unknown as void),
};

export const projectMetaApi = {
  list: (accountId?: string | null) =>
    invokeCommand<ProjectRecord[]>("db_projects_list", { accountId }, []),
  getByPath: (path: string) =>
    invokeCommand<ProjectRecord | null>("db_projects_get_by_path", { path }, null),
  delete: (id: string) => invokeCommand<void>("db_projects_delete", { id }),
  githubGet: (projectId: string) =>
    invokeCommand<ProjectGithubRepositoryRecord | null>("db_project_github_get", { projectId }, null),
  githubUpsert: (record: ProjectGithubRepositoryRecord) =>
    invokeCommand<ProjectGithubRepositoryRecord>("db_project_github_upsert", { record }),
  githubDelete: (projectId: string) =>
    invokeCommand<void>("db_project_github_delete", { projectId }),
};
