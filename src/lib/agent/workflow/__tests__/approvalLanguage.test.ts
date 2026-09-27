import { describe, expect, it } from "vitest";
import { isAffirmativeReply, isDesignApprovalReply, isDesignRejectionReply } from "../approvalLanguage";

describe("approval replies", () => {
  it("treats a design yes as affirmative and as design approval", () => {
    expect(isAffirmativeReply("design_yes")).toBe(true);
    expect(isDesignApprovalReply("design_yes")).toBe(true);
    expect(isDesignRejectionReply("design_yes")).toBe(false);
  });

  it("treats a soft agreement as affirmative but not a design yes", () => {
    expect(isAffirmativeReply("affirmative")).toBe(true);
    expect(isDesignApprovalReply("affirmative")).toBe(false);
    expect(isDesignRejectionReply("affirmative")).toBe(false);
  });

  it("treats a design no as a rejection", () => {
    expect(isDesignRejectionReply("design_no")).toBe(true);
    expect(isAffirmativeReply("design_no")).toBe(false);
    expect(isDesignApprovalReply("design_no")).toBe(false);
  });

  it("treats none as neither approval nor rejection", () => {
    expect(isAffirmativeReply("none")).toBe(false);
    expect(isDesignApprovalReply("none")).toBe(false);
    expect(isDesignRejectionReply("none")).toBe(false);
  });
});
