import { describe, expect, it } from "vitest";
import { isAffirmativeReply, isDesignApprovalReply, isDesignRejectionReply } from "../approvalLanguage";

describe("isAffirmativeReply", () => {
  it("accepts English and French short yes replies", () => {
    expect(isAffirmativeReply("yes")).toBe(true);
    expect(isAffirmativeReply("Y")).toBe(true);
    expect(isAffirmativeReply("oui")).toBe(true);
    expect(isAffirmativeReply("oui je valide")).toBe(true);
    expect(isAffirmativeReply("Yes, proceed")).toBe(true);
    expect(isAffirmativeReply("Yes, I approve")).toBe(true);
    expect(isAffirmativeReply("Oui, c'est bon")).toBe(true);
    expect(isAffirmativeReply("Oui, j'approuve")).toBe(true);
    expect(isAffirmativeReply("d'accord")).toBe(true);
    expect(isAffirmativeReply("approve")).toBe(true);
  });

  it("rejects negatives and long unrelated text", () => {
    expect(isAffirmativeReply("no")).toBe(false);
    expect(isAffirmativeReply("non")).toBe(false);
    expect(isAffirmativeReply("oui mais change la stack")).toBe(false);
    expect(isAffirmativeReply("please rewrite the whole architecture from scratch with details")).toBe(false);
  });
});

describe("isDesignApprovalReply", () => {
  it("accepts an explicit yes after brainstorming", () => {
    expect(isDesignApprovalReply("oui")).toBe(true);
    expect(isDesignApprovalReply("yes")).toBe(true);
    expect(isDesignApprovalReply("y")).toBe(true);
    expect(isDesignApprovalReply("je valide")).toBe(true);
    expect(isDesignApprovalReply("c'est bon")).toBe(true);
    expect(isDesignApprovalReply("c'est validé")).toBe(true);
    expect(isDesignApprovalReply("valide")).toBe(true);
    expect(isDesignApprovalReply("approved")).toBe(true);
    expect(isDesignApprovalReply("oui je valide")).toBe(true);
    expect(isDesignApprovalReply("Yes, proceed")).toBe(true);
    expect(isDesignApprovalReply("Yes, I approve")).toBe(true);
    expect(isDesignApprovalReply("Oui, c'est bon")).toBe(true);
    expect(isDesignApprovalReply("oui c'est bon")).toBe(true);
    expect(isDesignApprovalReply("Oui, j'approuve")).toBe(true);
    expect(isDesignApprovalReply("oui j’approuve")).toBe(true);
    expect(isDesignApprovalReply("j'approuve")).toBe(true);
  });

  it("rejects loose acknowledgements used during Q&A", () => {
    expect(isDesignApprovalReply("ok")).toBe(false);
    expect(isDesignApprovalReply("d'accord")).toBe(false);
    expect(isDesignApprovalReply("sure")).toBe(false);
    expect(isDesignApprovalReply("go")).toBe(false);
    expect(isDesignApprovalReply("1")).toBe(false);
    expect(isDesignApprovalReply("c'est ok")).toBe(false);
  });
});

describe("isDesignRejectionReply", () => {
  it("accepts a short no and a no that refuses stack or local", () => {
    expect(isDesignRejectionReply("non")).toBe(true);
    expect(isDesignRejectionReply("no")).toBe(true);
    expect(isDesignRejectionReply("non je veux une application local")).toBe(true);
    expect(isDesignRejectionReply("non architecture pas bonne")).toBe(true);
  });

  it("rejects yes and unrelated text", () => {
    expect(isDesignRejectionReply("oui")).toBe(false);
    expect(isDesignRejectionReply("Oui, c'est bon")).toBe(false);
    expect(isDesignRejectionReply("please rewrite the whole architecture from scratch with details")).toBe(false);
  });
});
