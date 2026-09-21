import { databaseApi } from "../tauri/databaseApi";
import type { ProjectFileRecord } from "./types";

export const projectFileRepository = {
  upsert: (file: ProjectFileRecord) => databaseApi.projectFilesUpsert(file),
  list: (projectId: string) => databaseApi.projectFilesList(projectId),
  delete: (projectId: string, path: string) => databaseApi.projectFilesDelete(projectId, path),
};
