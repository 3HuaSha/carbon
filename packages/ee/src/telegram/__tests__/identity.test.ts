import { describe, expect, it } from "vitest";

/** Pure helpers mirroring identity.server match rules for unit coverage. */
function matchEmployeesByEmail(
  rows: { id: string; name: string; email: string }[],
  query: string
) {
  const q = query.trim();
  if (!q) return [];
  const lower = q.toLowerCase();
  const usable = rows.filter(
    (r) => !r.email.toLowerCase().endsWith("@console.internal")
  );
  const exact = usable.filter((r) => r.email.toLowerCase() === lower);
  if (exact.length > 0) return exact;
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q);
  if (looksLikeEmail) return [];
  return usable
    .filter((r) => {
      const email = r.email.toLowerCase();
      const local = email.split("@")[0] ?? "";
      return email.includes(lower) || local === lower;
    })
    .slice(0, 8);
}

describe("telegram email bind matching", () => {
  const rows = [
    { id: "1", name: "Alice", email: "Alice@Factory.com" },
    { id: "2", name: "Bob", email: "bob@factory.com" },
    { id: "3", name: "Console", email: "uuid@console.internal" },
    { id: "4", name: "Ali", email: "ali.chen@other.com" }
  ];

  it("matches email case-insensitively", () => {
    const hits = matchEmployeesByEmail(rows, "alice@factory.com");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.id).toBe("1");
  });

  it("ignores synthetic console emails", () => {
    expect(matchEmployeesByEmail(rows, "uuid@console.internal")).toEqual([]);
  });

  it("returns multiple partial matches for clarification", () => {
    const hits = matchEmployeesByEmail(rows, "ali");
    expect(hits.map((h) => h.id).sort()).toEqual(["1", "4"]);
  });

  it("does not broaden when a full email has no match", () => {
    expect(matchEmployeesByEmail(rows, "nobody@factory.com")).toEqual([]);
  });
});
