import { databaseApi } from "../tauri/databaseApi";

export async function resetApplicationData() {
  await databaseApi.resetApplicationData();
}

export async function exportApplicationData() {
  return databaseApi.exportApplicationData();
}

export async function importApplicationData(path: string) {
  return databaseApi.importApplicationData(path);
}
