import type { Database } from "@carbon/database";
import {
  getMESUrl,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_MAINTENANCE_GROUP_CHAT_ID
} from "@carbon/env";
import { sendTelegramMessage } from "@carbon/lib/telegram.server";
import { getLogger } from "@carbon/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getTelegramMaintenanceGroupChatId,
  getTelegramMappingForUser
} from "./mapping.server";
import {
  buildMaintenanceTelegramButtons,
  buildMaintenanceTelegramText,
  formatTelegramAssigneeMention
} from "./message";

const log = getLogger("ee", "telegram-notify");

export type MaintenanceAssignmentTelegramResult = {
  /** Assignee has no Telegram user mapping. */
  telegramUnbound: boolean;
  dmSent: boolean;
  groupSent: boolean;
};

/**
 * Synchronous dual notify (private DM + maintenance group) for a maintenance
 * assignment. Used when Inngest is unreachable (Railway demos often set
 * `INNGEST_DEV` with no local/cloud Inngest — `trigger("notify")` fails and
 * `carbon/send-telegram` never runs).
 *
 * Prefer the Inngest path when it works; call this only as a fallback so we
 * do not double-send.
 */
export async function sendMaintenanceAssignmentTelegram(
  client: SupabaseClient<Database>,
  args: {
    companyId: string;
    dispatchId: string;
    assigneeUserId: string;
  }
): Promise<MaintenanceAssignmentTelegramResult> {
  if (!TELEGRAM_BOT_TOKEN) {
    log.warn("Skipping Telegram sync notify — TELEGRAM_BOT_TOKEN unset");
    return { telegramUnbound: true, dmSent: false, groupSent: false };
  }

  const { data: dispatch, error } = await client
    .from("maintenanceDispatch")
    .select(
      "id, maintenanceDispatchId, workCenterId, priority, severity, status, content, oeeImpact, workCenter(id, name)"
    )
    .eq("id", args.dispatchId)
    .eq("companyId", args.companyId)
    .maybeSingle();

  if (error || !dispatch) {
    log.error("Telegram sync notify: dispatch not found", {
      companyId: args.companyId,
      dispatchId: args.dispatchId,
      error
    });
    return { telegramUnbound: true, dmSent: false, groupSent: false };
  }

  const workCenterName =
    (dispatch.workCenter as { name?: string } | null)?.name ?? "Unknown";
  const workCenterId = dispatch.workCenterId ?? null;
  const readableId = dispatch.maintenanceDispatchId ?? args.dispatchId;
  const content = dispatch.content as
    | { shopKind?: string; note?: string }
    | null
    | undefined;
  const shopKind =
    content?.shopKind === "planned"
      ? "planned"
      : content?.shopKind === "break"
        ? "break"
        : content?.shopKind === "fault"
          ? "fault"
          : dispatch.oeeImpact === "Planned"
            ? "planned"
            : "fault";
  const note =
    typeof content?.note === "string" && content.note.trim()
      ? content.note.trim()
      : null;

  const shopPath = workCenterId ? `/shop/${workCenterId}` : "/shop";
  const shopUrl = `${getMESUrl()}${shopPath}`;
  const description = `Maintenance dispatch ${readableId} for ${workCenterName} assigned to you`;
  const detailRows = [
    { label: "Machine", value: workCenterName },
    { label: "Kind", value: shopKind },
    ...(dispatch.priority
      ? [{ label: "Priority", value: String(dispatch.priority) }]
      : []),
    ...(dispatch.severity
      ? [{ label: "Severity", value: String(dispatch.severity) }]
      : []),
    ...(dispatch.status
      ? [{ label: "Status", value: String(dispatch.status) }]
      : []),
    ...(note
      ? [
          {
            label: "Notes",
            value: note.length > 160 ? `${note.slice(0, 157)}…` : note
          }
        ]
      : [])
  ];
  const replyMarkup = buildMaintenanceTelegramButtons(args.dispatchId);

  const mapping = await getTelegramMappingForUser(client, {
    companyId: args.companyId,
    userId: args.assigneeUserId
  });

  let assigneeMention: string | null = null;
  let dmSent = false;

  if (mapping) {
    const { data: employee } = await client
      .from("employees")
      .select("name")
      .eq("id", args.assigneeUserId)
      .eq("companyId", args.companyId)
      .maybeSingle();

    assigneeMention = formatTelegramAssigneeMention({
      name: employee?.name,
      username:
        typeof mapping.metadata?.username === "string"
          ? mapping.metadata.username
          : null
    });

    try {
      await sendTelegramMessage({
        chatId: mapping.chatId,
        text: buildMaintenanceTelegramText({
          description,
          details: detailRows,
          shopUrl
        }),
        replyMarkup,
        force: true
      });
      dmSent = true;
      log.info("Telegram sync DM sent", {
        companyId: args.companyId,
        dispatchId: args.dispatchId,
        chatId: mapping.chatId
      });
    } catch (err) {
      log.error("Telegram sync DM failed", {
        companyId: args.companyId,
        dispatchId: args.dispatchId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  const groupChatId =
    TELEGRAM_MAINTENANCE_GROUP_CHAT_ID?.trim() ||
    (await getTelegramMaintenanceGroupChatId(client, args.companyId));

  let groupSent = false;
  if (groupChatId) {
    try {
      await sendTelegramMessage({
        chatId: groupChatId,
        text: buildMaintenanceTelegramText({
          description,
          details: detailRows,
          shopUrl,
          assigneeMention
        }),
        replyMarkup,
        force: true
      });
      groupSent = true;
      log.info("Telegram sync group sent", {
        companyId: args.companyId,
        dispatchId: args.dispatchId,
        chatId: groupChatId
      });
    } catch (err) {
      log.error("Telegram sync group failed", {
        companyId: args.companyId,
        dispatchId: args.dispatchId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  } else {
    log.info(
      "Telegram sync notify: no group chat_id (env or /setgroup mapping)"
    );
  }

  return {
    telegramUnbound: !mapping,
    dmSent,
    groupSent
  };
}
