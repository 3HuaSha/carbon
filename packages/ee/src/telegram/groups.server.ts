import type { Database } from "@carbon/database";
import {
  TELEGRAM_MAINTENANCE_GROUP_CHAT_ID,
  TELEGRAM_MOLD_GROUP_CHAT_ID,
  TELEGRAM_REPAIR_GROUP_CHAT_ID
} from "@carbon/env";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelegramCrewKind } from "./crew";
import { getTelegramCrewGroupChatIdFromMapping } from "./mapping.server";

/**
 * Resolve the Telegram chat_id for a crew group.
 *
 * Repair: `TELEGRAM_REPAIR_GROUP_CHAT_ID` → legacy
 * `TELEGRAM_MAINTENANCE_GROUP_CHAT_ID` → mapping `repair` → mapping `default`.
 * Mold: `TELEGRAM_MOLD_GROUP_CHAT_ID` → mapping `mold`.
 */
export async function getTelegramCrewGroupChatId(
  client: SupabaseClient<Database>,
  companyId: string,
  kind: TelegramCrewKind
): Promise<string | null> {
  if (kind === "repair") {
    const fromEnv =
      TELEGRAM_REPAIR_GROUP_CHAT_ID?.trim() ||
      TELEGRAM_MAINTENANCE_GROUP_CHAT_ID?.trim();
    if (fromEnv) return fromEnv;
  } else {
    const fromEnv = TELEGRAM_MOLD_GROUP_CHAT_ID?.trim();
    if (fromEnv) return fromEnv;
  }

  return getTelegramCrewGroupChatIdFromMapping(client, companyId, kind);
}

export async function getEmployeeTypeNamesByUserId(
  client: SupabaseClient<Database>,
  args: { companyId: string; userIds: string[] }
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const unique = Array.from(new Set(args.userIds.filter(Boolean)));
  if (unique.length === 0) return result;

  const { data: employees } = await client
    .from("employees")
    .select("id, employeeTypeId")
    .eq("companyId", args.companyId)
    .in("id", unique);

  const typeIds = Array.from(
    new Set(
      (employees ?? [])
        .map((row) => row.employeeTypeId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const typeNameById = new Map<string, string>();
  if (typeIds.length > 0) {
    const { data: types } = await client
      .from("employeeType")
      .select("id, name")
      .eq("companyId", args.companyId)
      .in("id", typeIds);
    for (const row of types ?? []) {
      if (row.name?.trim()) typeNameById.set(row.id, row.name.trim());
    }
  }

  for (const userId of unique) {
    result.set(userId, null);
  }
  for (const row of employees ?? []) {
    if (!row.id) continue;
    const name = row.employeeTypeId
      ? (typeNameById.get(row.employeeTypeId) ?? null)
      : null;
    result.set(row.id, name);
  }
  return result;
}
