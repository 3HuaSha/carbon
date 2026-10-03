import { TELEGRAM_CB_COMPLETE, TELEGRAM_CB_START } from "./constants";

/** Chinese label for shop downtime / dispatch kind. */
export function shopDispatchKindLabelZh(
  shopKind: string | null | undefined
): string {
  if (shopKind === "planned") return "计划停机";
  if (shopKind === "break") return "休息";
  return "故障";
}

/**
 * Private DM copy for a maintenance assignment.
 *
 * 🔧 您有一条新的维修派单
 * 机台：{workCenterName}
 * 类型：{type}
 * 派单人：{assignerName}
 */
export function buildMaintenanceTelegramDmText(args: {
  workCenterName: string;
  typeLabel: string;
  assignerName: string;
}): string {
  return [
    "🔧 您有一条新的维修派单",
    `机台：${args.workCenterName}`,
    `类型：${args.typeLabel}`,
    `派单人：${args.assignerName}`
  ].join("\n");
}

/**
 * Maintenance group copy for a maintenance assignment (different from DM).
 *
 * 📢 维修动态 · {workCenterName}
 * 类型：{type}
 * 已指派给 {assigneeName}（派单人：{assignerName}）
 */
export function buildMaintenanceTelegramGroupText(args: {
  workCenterName: string;
  typeLabel: string;
  assigneeName: string;
  assignerName: string;
}): string {
  return [
    `📢 维修动态 · ${args.workCenterName}`,
    `类型：${args.typeLabel}`,
    `已指派给 ${args.assigneeName}（派单人：${args.assignerName}）`
  ].join("\n");
}

/** Prefer @username; otherwise Carbon employee display name. */
export function formatTelegramAssigneeMention(args: {
  name?: string | null;
  username?: string | null;
}): string | null {
  const username = args.username?.replace(/^@/, "").trim();
  if (username) return `@${username}`;
  const name = args.name?.trim();
  return name || null;
}

export function buildMaintenanceTelegramButtons(dispatchId: string) {
  return {
    inline_keyboard: [
      [
        {
          text: "开始",
          callback_data: `${TELEGRAM_CB_START}${dispatchId}`
        },
        {
          text: "完成",
          callback_data: `${TELEGRAM_CB_COMPLETE}${dispatchId}`
        }
      ]
    ]
  };
}
