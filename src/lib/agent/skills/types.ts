export type SkillDefinition = {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  instructions: string;
  allowedTools: string[];
  modelPreference: string | null;
  version: string;
  enabled: boolean;
  origin: "builtin" | "project" | "global";
  sourcePath?: string;
  requiredCapabilities?: string[];
  preferredMcp?: string[];
  disableModelInvocation: boolean;
  userInvocable: boolean;
};

export interface SkillCatalogEntry {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  version: string;
  enabled: boolean;
  origin: SkillDefinition["origin"];
  sourcePath?: string;
  allowedTools: string[];
  modelPreference: string | null;
  disableModelInvocation: boolean;
  userInvocable: boolean;
}

export interface SelectedSkill extends SkillDefinition {
  score: number;
}

export interface SkillListingItem {
  skill: SkillDefinition;
  detail: boolean;
  score: number;
}
