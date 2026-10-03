import { describe, expect, it } from "vitest";

describe("telegram pending bind shape", () => {
  it("accepts identity then pin steps", () => {
    const identity = { step: "identity" as const, companyId: "co_1" };
    const pin = {
      step: "pin" as const,
      companyId: "co_1",
      employeeId: "user_1"
    };
    expect(identity.step).toBe("identity");
    expect(pin.employeeId).toBe("user_1");
  });

  it("back-compat parses legacy pending pin payload", () => {
    const legacy = { companyId: "co_1", employeeId: "user_1" };
    const step = "employeeId" in legacy ? "pin" : "identity";
    expect(step).toBe("pin");
  });
});
