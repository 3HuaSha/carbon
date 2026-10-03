import type { Database } from "@carbon/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TelegramEmployeeMatch = {
  id: string;
  name: string;
  email: string | null;
};

/**
 * Resolve the company used for Telegram-only bind (no MES deep-link payload).
 * Prefer TELEGRAM_COMPANY_ID; else the sole company in the database (single-tenant).
 */
export async function resolveTelegramBindCompanyId(
  client: SupabaseClient<Database>,
  preferredCompanyId: string | undefined
): Promise<
  | { ok: true; companyId: string }
  | { ok: false; reason: "missing" | "ambiguous" }
> {
  if (preferredCompanyId?.trim()) {
    const { data } = await client
      .from("company")
      .select("id")
      .eq("id", preferredCompanyId.trim())
      .maybeSingle();
    if (data?.id) return { ok: true, companyId: data.id };
    return { ok: false, reason: "missing" };
  }

  const { data, error } = await client.from("company").select("id").limit(2);
  if (error || !data?.length) return { ok: false, reason: "missing" };
  if (data.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, companyId: data[0]!.id };
}

function looksLikeEmail(value: string): boolean {
  // Practical check — full RFC not needed for bind UX.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Find active employees by email for Telegram bind (case-insensitive).
 * Exact email match first; if none and the query is not a full email,
 * fall back to substring matches and ask the caller to clarify when >1.
 * Synthetic console emails (`@console.internal`) never match.
 */
export async function findEmployeesByEmailForTelegramBind(
  client: SupabaseClient<Database>,
  args: { companyId: string; query: string }
): Promise<TelegramEmployeeMatch[]> {
  const q = args.query.trim();
  if (!q) return [];

  const { data, error } = await client
    .from("employees")
    .select("id, name, email")
    .eq("companyId", args.companyId)
    .eq("active", true)
    .limit(500);

  if (error || !data?.length) return [];

  const lower = q.toLowerCase();
  const rows = data
    .filter((row): row is typeof row & { id: string; email: string } =>
      Boolean(row.id && row.email)
    )
    .filter((row) => !row.email.toLowerCase().endsWith("@console.internal"));

  const exact = rows.filter((row) => row.email.toLowerCase() === lower);
  if (exact.length > 0) {
    return exact.map((row) => ({
      id: row.id,
      name: row.name ?? row.id,
      email: row.email
    }));
  }

  // Full email typed but no match — do not broaden (avoids guessing).
  if (looksLikeEmail(q)) return [];

  const partial = rows
    .filter((row) => {
      const email = row.email.toLowerCase();
      const local = email.split("@")[0] ?? "";
      return email.includes(lower) || local === lower;
    })
    .map((row) => ({
      id: row.id,
      name: row.name ?? row.id,
      email: row.email
    }));

  return partial.slice(0, 8);
}

/**
 * @deprecated Prefer findEmployeesByEmailForTelegramBind — name/工号 bind retired.
 * Kept for tests / callers that still pass a free-text query.
 */
export async function findEmployeesForTelegramBind(
  client: SupabaseClient<Database>,
  args: { companyId: string; query: string }
): Promise<TelegramEmployeeMatch[]> {
  return findEmployeesByEmailForTelegramBind(client, args);
}
