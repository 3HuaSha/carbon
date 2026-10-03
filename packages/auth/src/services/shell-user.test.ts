import { describe, expect, it } from "vitest";
import { shellUserReadGate } from "./shell-user";

// Shape produced by @supabase/postgrest-js 2.80 when fetch rejects with
// AbortSignal.timeout's TimeoutError.
const timeoutError = {
  message: "TimeoutError: The operation was aborted due to timeout",
  details: "",
  hint: "",
  code: ""
};

// `.single()` on zero rows: missing user, or inactive (`active = true` filter).
const missingOrInactive = {
  code: "PGRST116",
  details: "The result contains 0 rows",
  hint: null,
  message: "JSON object requested, multiple (or no) rows returned"
};

describe("shellUserReadGate", () => {
  it("does not log out when the shell user read timed out", () => {
    expect(shellUserReadGate({ data: null, error: timeoutError })).toBe(
      "unavailable"
    );
  });

  it("logs out when the user row is missing or inactive", () => {
    expect(shellUserReadGate({ data: null, error: missingOrInactive })).toBe(
      "logout"
    );
  });

  it("serves the shell when the active user row is present", () => {
    expect(
      shellUserReadGate({
        data: { id: "user-1", active: true },
        error: null
      })
    ).toBe("serve");
  });
});
