import type { Database, Json } from "@carbon/database";
import { editTelegramMessage } from "@carbon/lib/telegram.server";
import { getLogger } from "@carbon/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelegramCrewKind } from "./crew";
import { buildMaintenanceTelegramCompletedText } from "./message";

const log = getLogger("ee", "telegram-messages");

/** Stored on `maintenanceDispatch.content.telegramAssignMessages`. */
export type TelegramAssignMessageRef = {
  chatId: string;
  messageId: number;
  channel: "dm" | "group";
  /** Set for crew group messages. */
  crewKind?: TelegramCrewKind;
};

export function parseTelegramAssignMessages(
  value: unknown
): TelegramAssignMessageRef[] {
  if (!Array.isArray(value)) return [];
  const out: TelegramAssignMessageRef[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const chatId = typeof row.chatId === "string" ? row.chatId : null;
    const messageId =
      typeof row.messageId === "number" && Number.isFinite(row.messageId)
        ? row.messageId
        : null;
    const channel =
      row.channel === "dm" || row.channel === "group" ? row.channel : null;
    if (!chatId || messageId == null || !channel) continue;
    const crewKind =
      row.crewKind === "repair" || row.crewKind === "mold"
        ? row.crewKind
        : undefined;
    out.push({ chatId, messageId, channel, crewKind });
  }
  return out;
}

function messageKey(ref: TelegramAssignMessageRef): string {
  return `${ref.chatId}:${ref.messageId}`;
}

/**
 * Merge assign message refs onto dispatch content (dedupe by chat+message id).
 */
export async function appendTelegramAssignMessages(
  client: SupabaseClient<Database>,
  args: {
    companyId: string;
    dispatchId: string;
    messages: TelegramAssignMessageRef[];
    updatedBy: string;
    /** Optional crew kinds to persist in the same write. */
    crewKinds?: TelegramCrewKind[];
  }
): Promise<void> {
  if (args.messages.length === 0 && !args.crewKinds?.length) return;

  const { data: dispatch } = await client
    .from("maintenanceDispatch")
    .select("content")
    .eq("id", args.dispatchId)
    .eq("companyId", args.companyId)
    .maybeSingle();

  const base =
    dispatch?.content &&
    typeof dispatch.content === "object" &&
    !Array.isArray(dispatch.content)
      ? (dispatch.content as Record<string, unknown>)
      : {};

  const existing = parseTelegramAssignMessages(base.telegramAssignMessages);
  const byKey = new Map(existing.map((m) => [messageKey(m), m]));
  for (const msg of args.messages) {
    byKey.set(messageKey(msg), msg);
  }

  const next: Record<string, unknown> = {
    ...base,
    telegramAssignMessages: Array.from(byKey.values())
  };
  if (args.crewKinds?.length) {
    next.telegramCrewKinds = args.crewKinds;
  }

  const { error } = await client
    .from("maintenanceDispatch")
    .update({
      content: next as Json,
      updatedBy: args.updatedBy
    })
    .eq("id", args.dispatchId)
    .eq("companyId", args.companyId);

  if (error) {
    log.warn("Failed to persist telegramAssignMessages", {
      companyId: args.companyId,
      dispatchId: args.dispatchId,
      error
    });
  }
}

/**
 * Edit every stored assign message (all DMs + crew group) to「已完成 ✓」
 * and clear inline keyboards. Used from Telegram Complete and shop Complete.
 */
export async function markMaintenanceAssignTelegramCompleted(
  client: SupabaseClient<Database>,
  args: {
    companyId: string;
    dispatchId: string;
    /** Bypass localhost skip (webhook / shop server). */
    force?: boolean;
  }
): Promise<{ edited: number }> {
  const { data: dispatch, error } = await client
    .from("maintenanceDispatch")
    .select("id, content, workCenter(id, name)")
    .eq("id", args.dispatchId)
    .eq("companyId", args.companyId)
    .maybeSingle();

  if (error || !dispatch) {
    log.warn("Complete edit: dispatch not found", {
      companyId: args.companyId,
      dispatchId: args.dispatchId
    });
    return { edited: 0 };
  }

  const content =
    dispatch.content &&
    typeof dispatch.content === "object" &&
    !Array.isArray(dispatch.content)
      ? (dispatch.content as Record<string, unknown>)
      : {};

  const messages = parseTelegramAssignMessages(content.telegramAssignMessages);
  if (messages.length === 0) {
    log.info("Complete edit: no stored assign messages", {
      companyId: args.companyId,
      dispatchId: args.dispatchId
    });
    return { edited: 0 };
  }

  const workCenterName =
    (dispatch.workCenter as { name?: string } | null)?.name?.trim() ||
    "未知机台";
  const note =
    typeof content.note === "string" && content.note.trim()
      ? content.note.trim()
      : "—";

  const text = buildMaintenanceTelegramCompletedText({
    workCenterName,
    problem: note
  });

  let edited = 0;
  for (const msg of messages) {
    try {
      await editTelegramMessage({
        chatId: msg.chatId,
        messageId: msg.messageId,
        text,
        replyMarkup: { inline_keyboard: [] }
      });
      edited += 1;
    } catch (err) {
      log.warn("Failed to edit Telegram assign message on complete", {
        companyId: args.companyId,
        dispatchId: args.dispatchId,
        chatId: msg.chatId,
        messageId: msg.messageId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  log.info("Telegram assign messages marked completed", {
    companyId: args.companyId,
    dispatchId: args.dispatchId,
    edited,
    total: messages.length
  });

  return { edited };
}
