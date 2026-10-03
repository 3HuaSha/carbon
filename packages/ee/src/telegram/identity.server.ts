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

/**
 * Find active employees by 工号/姓名/邮箱 for Telegram bind.
 * Carbon has no dedicated employee-code column — match name, email local-part, or UUID id.
 */
export async function findEmployeesForTelegramBind(
  client: SupabaseClient<Database>,
  args: { companyId: string; query: string }
): Promise<TelegramEmployeeMatch[]> {
  const q = args.query.trim();
  if (!q) return [];

  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
  if (uuidLike) {
    const { data } = await client
      .from("employees")
      .select("id, name, email")
      .eq("companyId", args.companyId)
      .eq("active", true)
      .eq("id", q)
      .maybeSingle();
    if (data?.id) {
      return [
        {
          id: data.id,
          name: data.name ?? data.id,
          email: data.email
        }
      ];
    }
  }

  // Single-tenant demos keep operator counts small; filter in process so we
  // do not depend on PostgREST `.or()` escaping for Chinese names / 工号.
  const { data, error } = await client
    .from("employees")
    .select("id, name, email, firstName, lastName")
    .eq("companyId", args.companyId)
    .eq("active", true)
    .limit(500);

  if (error || !data?.length) return [];

  const lower = q.toLowerCase();
  const matches = data
    .filter((row): row is typeof row & { id: string } => Boolean(row.id))
    .filter((row) => {
      const parts = [
        row.name,
        row.email,
        row.firstName,
        row.lastName,
        row.email?.split("@")[0]
      ]
        .filter((v): v is string => Boolean(v))
        .map((v) => v.toLowerCase());
      return parts.some((p) => p === lower || p.includes(lower));
    })
    .map((row) => ({
      id: row.id,
      name: row.name ?? row.id,
      email: row.email
    }));

  matches.sort((a, b) => {
    const aExact = a.name.toLowerCase() === lower ? 0 : 1;
    const bExact = b.name.toLowerCase() === lower ? 0 : 1;
    return aExact - bExact;
  });

  return matches.slice(0, 8);
}
