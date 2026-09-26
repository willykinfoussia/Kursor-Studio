import { agentLogger } from "./agent/logger";

export function toUserError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  agentLogger.error(fallback, { detail: raw.slice(0, 300) });
  const value = raw.toLowerCase();
  if (value.includes("this file does not exist")) return "This file does not exist.";
  if (value.includes("outside")) return "The requested path is outside the active project.";
  if (value.includes("utf-8")) return "Unable to display this file as UTF-8.";
  if (value.includes("binary file")) return "Binary file";
  if (value.includes("no longer exists") || value.includes("not found")) return "Project directory no longer exists.";
  if (value.includes("no project")) return "No project is currently open.";
  if (value.includes("unable to start terminal")) return "Unable to start terminal.";
  if (value.includes("unable to write to the terminal") || value.includes("unable to write")) return "Unable to write to the terminal.";
  if (value.includes("unable to stop")) return "Unable to stop the terminal.";
  if (value.includes("unable to create the folder") || value.includes("unable to create the directory")) return "Unable to create the folder.";
  if (value.includes("unable to create")) return "Unable to create the file.";
  if (value.includes("unable to rename")) return "Unable to rename.";
  if (value.includes("unable to delete")) return "Unable to delete.";
  if (value.includes("unable to save")) return "Unable to save file.";
  if (value.includes("unable to read")) return "Unable to read file.";
  return fallback;
}
