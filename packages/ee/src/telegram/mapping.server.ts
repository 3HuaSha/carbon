import type { Database } from "@carbon/database";
import type { Kysely, KyselyDatabase } from "@carbon/database/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMappingService } from "../accounting/core/external-mapping";
import { TELEGRAM_INTEGRATION, TELEGRAM_USER_ENTITY } from "./constants";

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

export async function getTelegramChatIdForUser(
  client: SupabaseClient<Database>,
  args: { companyId: string; userId: string }
): Promise<string | null> {
  const { data, error } = await client
    .from("externalIntegrationMapping")
    .select("externalId")
    .eq("companyId", args.companyId)
    .eq("integration", TELEGRAM_INTEGRATION)
    .eq("entityType", TELEGRAM_USER_ENTITY)
    .eq("entityId", args.userId)
    .maybeSingle();

  if (error || !data?.externalId) return null;
  return data.externalId;
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
