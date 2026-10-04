import type { Database } from "@carbon/database";
import type { Kysely, KyselyDatabase } from "@carbon/database/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMappingService } from "../accounting/core/external-mapping";
import {
  TELEGRAM_CREW_GROUP_ENTITY_ID,
  TELEGRAM_INTEGRATION,
  TELEGRAM_MAINTENANCE_GROUP_ENTITY,
  TELEGRAM_MAINTENANCE_GROUP_ENTITY_ID,
  TELEGRAM_USER_ENTITY
} from "./constants";
import type { TelegramCrewKind } from "./crew";

export type TelegramUserMapping = {
  companyId: string;
  userId: string;
  chatId: string;
  metadata: Record<string, unknown> | null;
};

export async function linkTelegramUser(
  db: Kysely<KyselyDatabase>,
  args: {
    companyId: string;
    userId: string;
    chatId: string;
    telegramUserId?: number | string;
    username?: string | null;
    createdBy?: string;
  }
): Promise<void> {
  const mapping = createMappingService(db, args.companyId);
  // One chat → one user per company: clear any prior binding of this chat.
  const existingForChat = await mapping.getByExternalId(
    TELEGRAM_INTEGRATION,
    args.chatId,
    TELEGRAM_USER_ENTITY
  );
  if (existingForChat && existingForChat.entityId !== args.userId) {
    await mapping.unlink(
      TELEGRAM_USER_ENTITY,
      existingForChat.entityId,
      TELEGRAM_INTEGRATION
    );
  }

  await mapping.link(
    TELEGRAM_USER_ENTITY,
    args.userId,
    TELEGRAM_INTEGRATION,
    args.chatId,
    {
      createdBy: args.createdBy ?? args.userId,
      metadata: {
        telegramUserId: args.telegramUserId
          ? String(args.telegramUserId)
          : undefined,
        username: args.username ?? undefined,
        boundAt: new Date().toISOString()
      }
    }
  );
}

export async function unlinkTelegramUser(
  db: Kysely<KyselyDatabase>,
  args: { companyId: string; userId: string }
): Promise<void> {
  const mapping = createMappingService(db, args.companyId);
  await mapping.unlink(TELEGRAM_USER_ENTITY, args.userId, TELEGRAM_INTEGRATION);
}

export async function getTelegramMappingForUser(
  client: SupabaseClient<Database>,
  args: { companyId: string; userId: string }
): Promise<TelegramUserMapping | null> {
  const { data, error } = await client
    .from("externalIntegrationMapping")
    .select("companyId, entityId, externalId, metadata")
    .eq("companyId", args.companyId)
    .eq("integration", TELEGRAM_INTEGRATION)
    .eq("entityType", TELEGRAM_USER_ENTITY)
    .eq("entityId", args.userId)
    .maybeSingle();

  if (error || !data?.companyId || !data.entityId || !data.externalId) {
    return null;
  }
  return {
    companyId: data.companyId,
    userId: data.entityId,
    chatId: data.externalId,
    metadata: (data.metadata as Record<string, unknown> | null) ?? null
  };
}

export async function getTelegramChatIdForUser(
  client: SupabaseClient<Database>,
  args: { companyId: string; userId: string }
): Promise<string | null> {
  const mapping = await getTelegramMappingForUser(client, args);
  return mapping?.chatId ?? null;
}

/**
 * Resolve a Telegram chat to a Carbon user. Chat ids are globally unique, so
 * we look up without companyId first, then return company-scoped identity.
 */
export async function getUserByTelegramChatId(
  client: SupabaseClient<Database>,
  chatId: string
): Promise<TelegramUserMapping | null> {
  const { data, error } = await client
    .from("externalIntegrationMapping")
    .select("companyId, entityId, externalId, metadata")
    .eq("integration", TELEGRAM_INTEGRATION)
    .eq("entityType", TELEGRAM_USER_ENTITY)
    .eq("externalId", chatId)
    .limit(1)
    .maybeSingle();

  if (error || !data?.companyId || !data.entityId || !data.externalId) {
    return null;
  }
  return {
    companyId: data.companyId,
    userId: data.entityId,
    chatId: data.externalId,
    metadata: (data.metadata as Record<string, unknown> | null) ?? null
  };
}

/**
 * Resolve the Telegram *user* who clicked a button (or sent a message).
 * Prefer `metadata.telegramUserId` so group callbacks work (group chat_id ≠
 * user id). Fall back to private-chat equality (`externalId === from.id`).
 */
export async function getUserByTelegramUserId(
  client: SupabaseClient<Database>,
  telegramUserId: string | number
): Promise<TelegramUserMapping | null> {
  const id = String(telegramUserId);
  const { data, error } = await client
    .from("externalIntegrationMapping")
    .select("companyId, entityId, externalId, metadata")
    .eq("integration", TELEGRAM_INTEGRATION)
    .eq("entityType", TELEGRAM_USER_ENTITY)
    .filter("metadata->>telegramUserId", "eq", id)
    .limit(1)
    .maybeSingle();

  if (!error && data?.companyId && data.entityId && data.externalId) {
    return {
      companyId: data.companyId,
      userId: data.entityId,
      chatId: data.externalId,
      metadata: (data.metadata as Record<string, unknown> | null) ?? null
    };
  }

  // Private chats: chat_id === user id; older binds may lack metadata key.
  return getUserByTelegramChatId(client, id);
}

export async function unlinkTelegramByChatId(
  db: Kysely<KyselyDatabase>,
  client: SupabaseClient<Database>,
  chatId: string
): Promise<TelegramUserMapping | null> {
  const mapping = await getUserByTelegramChatId(client, chatId);
  if (!mapping) return null;
  await unlinkTelegramUser(db, {
    companyId: mapping.companyId,
    userId: mapping.userId
  });
  return mapping;
}

/**
 * Persist a crew group chat for assign notify (DM + crew group).
 * Prefer Railway `TELEGRAM_REPAIR_GROUP_CHAT_ID` / `TELEGRAM_MOLD_GROUP_CHAT_ID`;
 * this mapping is the runtime fallback after `/setgroup repair|mold`.
 */
export async function setTelegramCrewGroupChatId(
  db: Kysely<KyselyDatabase>,
  args: {
    companyId: string;
    kind: TelegramCrewKind;
    chatId: string;
    title?: string | null;
    /** Carbon `user.id` only — never a Telegram numeric user id (FK). */
    createdBy?: string;
    /** Telegram `from.id` of whoever ran `/setgroup` (metadata only). */
    telegramFromId?: string | number;
  }
): Promise<void> {
  const mapping = createMappingService(db, args.companyId);
  await mapping.link(
    TELEGRAM_MAINTENANCE_GROUP_ENTITY,
    TELEGRAM_CREW_GROUP_ENTITY_ID[args.kind],
    TELEGRAM_INTEGRATION,
    args.chatId,
    {
      createdBy: args.createdBy,
      metadata: {
        kind: args.kind,
        title: args.title ?? undefined,
        setAt: new Date().toISOString(),
        telegramFromId: args.telegramFromId
          ? String(args.telegramFromId)
          : undefined
      }
    }
  );
}

/**
 * @deprecated Use `setTelegramCrewGroupChatId` with `kind: "repair"`.
 * Bare `/setgroup` still routes here → repair.
 */
export async function setTelegramMaintenanceGroupChatId(
  db: Kysely<KyselyDatabase>,
  args: {
    companyId: string;
    chatId: string;
    title?: string | null;
    createdBy?: string;
    telegramFromId?: string | number;
  }
): Promise<void> {
  await setTelegramCrewGroupChatId(db, { ...args, kind: "repair" });
}

/**
 * Mapping-only lookup for a crew group. Repair also accepts legacy
 * `entityId = "default"` from the pre-dual-group `/setgroup`.
 */
export async function getTelegramCrewGroupChatIdFromMapping(
  client: SupabaseClient<Database>,
  companyId: string,
  kind: TelegramCrewKind
): Promise<string | null> {
  const entityIds =
    kind === "repair"
      ? [
          TELEGRAM_CREW_GROUP_ENTITY_ID.repair,
          TELEGRAM_CREW_GROUP_ENTITY_ID.legacy,
          TELEGRAM_MAINTENANCE_GROUP_ENTITY_ID
        ]
      : [TELEGRAM_CREW_GROUP_ENTITY_ID.mold];

  const { data, error } = await client
    .from("externalIntegrationMapping")
    .select("externalId, entityId")
    .eq("companyId", companyId)
    .eq("integration", TELEGRAM_INTEGRATION)
    .eq("entityType", TELEGRAM_MAINTENANCE_GROUP_ENTITY)
    .in("entityId", entityIds);

  if (error || !data?.length) return null;

  // Prefer explicit `repair` over legacy `default`.
  const preferred = data.find(
    (row) => row.entityId === TELEGRAM_CREW_GROUP_ENTITY_ID[kind]
  );
  if (preferred?.externalId) return preferred.externalId;
  const legacy = data.find(
    (row) => row.entityId === TELEGRAM_CREW_GROUP_ENTITY_ID.legacy
  );
  return legacy?.externalId ?? null;
}

/**
 * @deprecated Use `getTelegramCrewGroupChatId` / env repair vars.
 * Returns the repair (or legacy default) mapping only — no env.
 */
export async function getTelegramMaintenanceGroupChatId(
  client: SupabaseClient<Database>,
  companyId: string
): Promise<string | null> {
  return getTelegramCrewGroupChatIdFromMapping(client, companyId, "repair");
}
