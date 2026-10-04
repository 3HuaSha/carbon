import type { Database } from "@carbon/database";
import { TELEGRAM_BOT_TOKEN } from "@carbon/env";
import { sendTelegramMessage } from "@carbon/lib/telegram.server";
import { getLogger } from "@carbon/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveTelegramCrewNotifyTargets,
  type TelegramCrewKind
} from "./crew";
import {
  getEmployeeTypeNamesByUserId,
  getTelegramCrewGroupChatId
} from "./groups.server";
import { getTelegramMappingForUser } from "./mapping.server";
import {
  buildMaintenanceTelegramButtons,
  buildMaintenanceTelegramDmText,
  buildMaintenanceTelegramGroupText,
  shopDispatchKindLabelZh
} from "./message";
import {
  appendTelegramAssignMessages,
  type TelegramAssignMessageRef
} from "./messages.server";

const log = getLogger("ee", "telegram-notify");

export type MaintenanceAssignmentTelegramResult = {
  /** Primary assignee has no Telegram user mapping. */
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
 * Synchronous dual notify (private DM + crew group(s)) for a maintenance
 * assignment. Used when Inngest is unreachable (Railway demos often set
 * `INNGEST_DEV` with no local/cloud Inngest — `trigger("notify")` fails and
 * `carbon/send-telegram` never runs).
 *
 * Prefer the Inngest path when it works; call this only as a fallback so we
 * do not double-send.
 *
 * Persists Telegram `chat_id` + `message_id` for every outbound assign message
 * so Complete can edit them all to「已完成 ✓」.
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
     * crew groups are chosen from 维修/模房 among these people.
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
  const typeById = await getEmployeeTypeNamesByUserId(client, {
    companyId: args.companyId,
    userIds: notifyUserIds
  });

  const assignerDisplay = nameById.get(args.assignerUserId) ?? "未命名";
  const dmReplyMarkup = buildMaintenanceTelegramButtons(args.dispatchId);

  let dmSent = false;
  let primaryMapped = false;
  const notifiedPeople: Array<{
    displayName: string;
    employeeTypeName: string | null;
  }> = [];
  const messageRefs: TelegramAssignMessageRef[] = [];

  for (const userId of notifyUserIds) {
    const display = nameById.get(userId) ?? "未命名";
    notifiedPeople.push({
      displayName: display,
      employeeTypeName: typeById.get(userId) ?? null
    });

    const mapping = await getTelegramMappingForUser(client, {
      companyId: args.companyId,
      userId
    });
    if (userId === args.assigneeUserId && mapping) {
      primaryMapped = true;
    }
    if (!mapping) continue;

    try {
      const sent = await sendTelegramMessage({
        chatId: mapping.chatId,
        text: buildMaintenanceTelegramDmText({
          workCenterName,
          typeLabel,
          assignerName: assignerDisplay
        }),
        replyMarkup: dmReplyMarkup,
        force: true
      });
      dmSent = true;
      if (sent?.messageId != null) {
        messageRefs.push({
          chatId: mapping.chatId,
          messageId: sent.messageId,
          channel: "dm"
        });
      }
      log.info("Telegram sync DM sent", {
        companyId: args.companyId,
        dispatchId: args.dispatchId,
        chatId: mapping.chatId,
        userId,
        messageId: sent?.messageId
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

  const crewTargets = resolveTelegramCrewNotifyTargets(notifiedPeople);
  const crewKinds = Object.keys(crewTargets) as TelegramCrewKind[];

  let groupSent = false;
  for (const kind of crewKinds) {
    const names = crewTargets[kind];
    if (!names?.length) continue;

    const groupChatId = await getTelegramCrewGroupChatId(
      client,
      args.companyId,
      kind
    );
    if (!groupChatId) {
      log.info("Telegram sync notify: no group chat_id for crew", {
        companyId: args.companyId,
        kind
      });
      continue;
    }

    try {
      // Group: text only — Complete button stays on private DM.
      const sent = await sendTelegramMessage({
        chatId: groupChatId,
        text: buildMaintenanceTelegramGroupText({
          workCenterName,
          typeLabel,
          assigneeName: names.join("、"),
          assignerName: assignerDisplay
        }),
        force: true
      });
      groupSent = true;
      if (sent?.messageId != null) {
        messageRefs.push({
          chatId: groupChatId,
          messageId: sent.messageId,
          channel: "group",
          crewKind: kind
        });
      }
      log.info("Telegram sync group sent", {
        companyId: args.companyId,
        dispatchId: args.dispatchId,
        kind,
        chatId: groupChatId,
        messageId: sent?.messageId
      });
    } catch (err) {
      log.error("Telegram sync group failed", {
        companyId: args.companyId,
        dispatchId: args.dispatchId,
        kind,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  await appendTelegramAssignMessages(client, {
    companyId: args.companyId,
    dispatchId: args.dispatchId,
    messages: messageRefs,
    crewKinds,
    updatedBy: args.assignerUserId
  });

  return {
    telegramUnbound: !primaryMapped,
    dmSent,
    groupSent
  };
}
