import type { AppInfo } from "../../types/tauri";
import { invokeCommand } from "./invoke";

export const systemApi = {
  getAppInfo: () => invokeCommand<AppInfo>("get_app_info", undefined, {
    name: "Kursor",
    version: __APP_VERSION__,
    platform: "browser-preview",
  }),
};
