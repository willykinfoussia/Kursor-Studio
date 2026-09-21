export function isBuildPlanPrompt(content: string): boolean {
  return content.startsWith("Build the approved plan");
}
