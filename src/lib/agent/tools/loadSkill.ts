import { skillRegistry, type SkillRegistry } from "../skills/SkillRegistry";
import { skillDocuments, SkillDocumentError, SkillDocumentService } from "../skills/SkillDocument";
import {
  applySkillToolGrants,
  assertModelMayLoad,
  formatSupportingFilesNote,
  recordSkillInvocation,
  renderSkill,
  SkillInvokeError,
} from "../skills/invokeSkill";
import { toolPermission } from "../permissions/meta";
import type { AgentTool, ToolRegistry } from "../ToolRegistry";
import { toolRegistry } from "../ToolRegistry";
import { asRecord, toolSchema } from "./schema";
import { failResult, okResult } from "./result";

export function createLoadSkillTool(deps: {
  skills?: SkillRegistry;
  tools?: ToolRegistry;
  documents?: SkillDocumentService;
} = {}): AgentTool {
  const skills = deps.skills ?? skillRegistry;
  const tools = deps.tools ?? toolRegistry;
  const documents = deps.documents ?? skillDocuments;
  return {
    name: "load_skill",
    description: "Load a skill by id and return its instructions. Pass file to read one supporting file from that skill folder (for example tests.md). Use when a listed skill matches the current task or when SKILL.md points at another file in the skill directory.",
    ...toolPermission("filesystem.read", "low"),
    timeoutMs: 8_000,
    mutate: false,
    parameters: toolSchema({
      skill: { type: "string", description: "Skill id (directory name), e.g. prefer-const" },
      args: { type: "string", description: "Optional arguments substituted for $ARGUMENTS and $0" },
      file: { type: "string", description: "Optional supporting file relative to the skill folder, e.g. tests.md" },
    }, ["skill"]),
    async execute(input, ctx) {
      const record = asRecord(input);
      const skillId = typeof record.skill === "string" ? record.skill.trim() : "";
      if (!skillId) return failResult("invalid_input", "skill is required.");
      const args = typeof record.args === "string" ? record.args : "";
      const file = typeof record.file === "string" ? record.file.trim() : "";
      const skill = await skills.resolve(skillId);
      if (!skill || !skills.isAvailable(skill)) {
        return failResult("unknown_skill", `Unknown skill "${skillId}".`);
      }
      try {
        assertModelMayLoad(skill, ctx.skillSession?.userInvokedIds ?? []);
      } catch (error) {
        if (error instanceof SkillInvokeError) {
          return failResult(error.code, error.message);
        }
        throw error;
      }
      const supportingFiles = await documents.listSupporting(skill.origin, skill.id).catch(() => []);
      if (file) {
        try {
          const content = await documents.readSupporting(skill.origin, skill.id, file);
          return okResult({
            skill: skill.id,
            origin: skill.origin,
            path: skill.sourcePath,
            file,
            content,
            supportingFiles,
          });
        } catch (error) {
          const message = error instanceof SkillDocumentError || error instanceof Error
            ? error.message
            : `Unable to read "${file}".`;
          const code = error instanceof SkillDocumentError ? error.code : "not_found";
          return failResult(code, message);
        }
      }
      const prompt = renderSkill(skill, args);
      const note = formatSupportingFilesNote(supportingFiles);
      if (ctx.skillSession) {
        applySkillToolGrants(skill, ctx.skillSession.grants, tools);
        recordSkillInvocation(ctx.skillSession, skill, "Loaded with load_skill");
      }
      return okResult({
        skill: skill.id,
        origin: skill.origin,
        path: skill.sourcePath,
        args,
        description: skill.description,
        prompt: note ? `${prompt}${note}` : prompt,
        supportingFiles,
      });
    },
  };
}
