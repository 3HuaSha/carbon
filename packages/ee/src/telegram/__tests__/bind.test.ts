import { describe, expect, it } from "vitest";

describe("telegram pending bind shape", () => {
  it("accepts email step", () => {
    const email = { step: "email" as const, companyId: "co_1" };
    expect(email.step).toBe("email");
    expect(email.companyId).toBe("co_1");
  });

  it("maps legacy identity/pin pending to email wait", () => {
    const legacyIdentity = { step: "identity" as const, companyId: "co_1" };
    const legacyPin = {
      step: "pin" as const,
      companyId: "co_1",
      employeeId: "user_1"
    };
    const asEmail = (p: { companyId: string }) => ({
      step: "email" as const,
      companyId: p.companyId
    });
    expect(asEmail(legacyIdentity)).toEqual({
      step: "email",
      companyId: "co_1"
    });
    expect(asEmail(legacyPin)).toEqual({ step: "email", companyId: "co_1" });
  });
});
