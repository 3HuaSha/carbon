import type { Database } from "@carbon/database";
import {
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
  buildMaintenanceTelegramDmText,
  buildMaintenanceTelegramGroupText,
  shopDispatchKindLabelZh
} from "./message";

const log = getLogger("ee", "telegram-notify");

export type MaintenanceAssignmentTelegramResult = {
  /** Assignee has no Telegram user mapping. */
  telegramUnbound: boolean;
  dmSent: boolean;
  groupSent: boolean;
};

async function getEmployeeDisplayName(
  client: SupabaseClient<Database>,
  args: { companyId: string; userId: string }
): Promise<string | null> {
  const { data } = await client
    .from("employees")
    .select("name")
    .eq("id", args.userId)
    .eq("companyId", args.companyId)
    .maybeSingle();
  const name = data?.name?.trim();
  return name || null;
}

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
    /** Primary Carbon assignee (single `maintenanceDispatch.assignee`). */
    assigneeUserId: string;
    /**
     * Extra people selected in the shop assign UI. Each gets a private DM;
     * the group message lists all notified names. Defaults to [assignee].
     */
    notifyUserIds?: string[];
    /** Assigner / actor user id (`from` on the notify event). */
    assignerUserId: string;
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
    (dispatch.workCenter as { name?: string } | null)?.name?.trim() ||
    "未知机台";
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
  const typeLabel = shopDispatchKindLabelZh(shopKind);

  const notifyUserIds = Array.from(
    new Set(
      (args.notifyUserIds?.length
        ? args.notifyUserIds
        : [args.assigneeUserId]
      ).filter(Boolean)
    )
  );

  const nameIds = Array.from(
    new Set([...notifyUserIds, args.assigneeUserId, args.assignerUserId])
  );
  const nameEntries = await Promise.all(
    nameIds.map(async (userId) => {
      const name = await getEmployeeDisplayName(client, {
        companyId: args.companyId,
        userId
      });
      return [userId, name] as const;
    })
  );
  const nameById = new Map(nameEntries);

  const assignerDisplay = nameById.get(args.assignerUserId) ?? "未命名";
  const replyMarkup = buildMaintenanceTelegramButtons(args.dispatchId);

  let dmSent = false;
  let primaryMapped = false;
  const notifiedDisplays: string[] = [];

  for (const userId of notifyUserIds) {
    const mapping = await getTelegramMappingForUser(client, {
      companyId: args.companyId,
      userId
    });
    if (userId === args.assigneeUserId && mapping) {
      primaryMapped = true;
    }
    if (!mapping) continue;

    const display = nameById.get(userId) ?? "未命名";
    notifiedDisplays.push(display);

    try {
      await sendTelegramMessage({
        chatId: mapping.chatId,
        text: buildMaintenanceTelegramDmText({
          workCenterName,
          typeLabel,
          assignerName: assignerDisplay
        }),
        replyMarkup,
        force: true
      });
      dmSent = true;
      log.info("Telegram sync DM sent", {
        companyId: args.companyId,
        dispatchId: args.dispatchId,
        chatId: mapping.chatId,
        userId
      });
    } catch (err) {
      log.error("Telegram sync DM failed", {
        companyId: args.companyId,
        dispatchId: args.dispatchId,
        userId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  const groupAssigneeDisplay =
    notifiedDisplays.length > 0
      ? notifiedDisplays.join("、")
      : (nameById.get(args.assigneeUserId) ?? "未命名");

  const groupChatId =
    TELEGRAM_MAINTENANCE_GROUP_CHAT_ID?.trim() ||
    (await getTelegramMaintenanceGroupChatId(client, args.companyId));

  let groupSent = false;
  if (groupChatId) {
    try {
      await sendTelegramMessage({
        chatId: groupChatId,
        text: buildMaintenanceTelegramGroupText({
          workCenterName,
          typeLabel,
          assigneeName: groupAssigneeDisplay,
          assignerName: assignerDisplay
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
    telegramUnbound: !primaryMapped,
    dmSent,
    groupSent
  };
}
