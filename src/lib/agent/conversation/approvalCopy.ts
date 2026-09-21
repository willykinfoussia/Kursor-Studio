import type { ApprovalRequest } from "../permissions/types";

export function approvalHeadline(permission: ApprovalRequest, outsideProject = false) {
  if (outsideProject) return "Kursor wants to modify a file outside the project";
  if (permission.capability === "terminal.execute" || permission.capability === "terminal.long_running" || permission.tool === "run_command" || permission.tool === "start_process") {
    return "Kursor wants to run this command";
  }
  if (permission.capability === "filesystem.delete" || permission.tool === "delete_file") {
    return "Kursor wants to delete files";
  }
  if (permission.capability === "git.write" && (permission.tool === "git_push" || permission.tool === "git_pull" || permission.tool === "git_fetch")) {
    return permission.tool === "git_pull"
      ? "Kursor wants to pull from the remote"
      : permission.tool === "git_fetch"
        ? "Kursor wants to fetch from the remote"
        : "Kursor wants to push to the remote";
  }
  if (permission.capability === "git.write" || permission.tool.startsWith("git_commit")) {
    return "Kursor wants to commit changes";
  }
  if (permission.capability === "filesystem.write") return "Kursor wants to edit files";
  if (permission.capability === "network.fetch" || permission.capability === "network.search") {
    return "Kursor wants to access the network";
  }
  return `Kursor wants to use ${permission.tool.replaceAll("_", " ")}`;
}

export function formatRiskLevel(level: string) {
  if (level === "low") return "Low";
  if (level === "medium") return "Medium";
  if (level === "high") return "High";
  return "Critical";
}
