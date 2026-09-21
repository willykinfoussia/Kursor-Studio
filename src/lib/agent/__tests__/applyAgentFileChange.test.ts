import { describe, expect, it } from "vitest";
import { shouldApplyAgentFileChange } from "../applyAgentFileChange";

describe("shouldApplyAgentFileChange", () => {
  it("does not open the editor for reads", () => {
    expect(shouldApplyAgentFileChange("read_file")).toBe(false);
    expect(shouldApplyAgentFileChange("list_files")).toBe(false);
    expect(shouldApplyAgentFileChange("search_files")).toBe(false);
  });

  it("opens the editor after real file mutations", () => {
    expect(shouldApplyAgentFileChange("write_file")).toBe(true);
    expect(shouldApplyAgentFileChange("create_file")).toBe(true);
    expect(shouldApplyAgentFileChange("delete_file")).toBe(true);
    expect(shouldApplyAgentFileChange("apply_patch")).toBe(true);
  });
});
