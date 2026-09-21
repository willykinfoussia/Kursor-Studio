import type { BuiltInMCPDefinition } from "../builtin/types";
import type { MCPServerConfig } from "../types";
import { validateServerConfig } from "../MCPConfig";
import { DependencyDetector } from "./DependencyDetector";
import type { SetupValidation } from "./types";

export class SetupValidator {
  constructor(private readonly detector: DependencyDetector) {}

  async validateDefinition(definition: BuiltInMCPDefinition, settings: Record<string, unknown>, config?: MCPServerConfig) {
    const validations = await this.detector.checkAll(definition, settings);
    if (config) {
      const check = validateServerConfig(config);
      validations.config = check.valid
        ? { status: "valid", message: "Configuration valid" }
        : { status: "error", message: check.errors.map((item) => item.message).join(" ") };
    }
    return validations;
  }

  canContinue(validations: Record<string, SetupValidation>, required: string[]) {
    return required.every((name) => validations[name]?.status !== "error");
  }
}
