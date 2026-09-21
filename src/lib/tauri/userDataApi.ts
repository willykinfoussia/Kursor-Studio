import type { WalkedFile } from "../../types/tauri";
import type { FileWatchEvent } from "../filesystem/fileTypes";
import { listenEvent, TAURI_EVENTS } from "./events";
import { invokeCommand } from "./invoke";

export type UserDataKind = "skills" | "rules" | "specs";

export interface UserDataEntry {
  name: string;
  path: string;
  kind: "file" | "directory" | string;
}

export const userDataApi = {
  list: (kind: UserDataKind) =>
    invokeCommand<UserDataEntry[]>("user_data_list", { kind }, []),
  walk: (kind: UserDataKind) =>
    invokeCommand<WalkedFile[]>("user_data_walk", { kind }, []),
  read: (kind: UserDataKind, relativePath: string) =>
    invokeCommand<string>("user_data_read", { kind, relativePath }, ""),
  write: (kind: UserDataKind, relativePath: string, content: string) =>
    invokeCommand<void>("user_data_write", { kind, relativePath, content }),
  create: (kind: UserDataKind, relativePath: string) =>
    invokeCommand<void>("user_data_create", { kind, relativePath }),
  delete: (kind: UserDataKind, relativePath: string) =>
    invokeCommand<void>("user_data_delete", { kind, relativePath }),
  watchSpecs: async (callback: (event: FileWatchEvent) => void) => {
    try {
      await invokeCommand<void>("user_data_watch_specs");
    } catch {
      // browser / missing native command
    }
    return listenEvent<FileWatchEvent>(TAURI_EVENTS.userSpecsChanged, callback);
  },
};
