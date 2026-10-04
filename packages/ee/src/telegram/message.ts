import { TELEGRAM_CB_COMPLETE } from "./constants";

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
 * Crew group copy for a maintenance assignment (different from DM).
 * No Complete button — peers discuss here; actions stay in private DM.
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

/**
 * Replacement text for every stored assign message (DM + group) after Complete.
 *
 * 已完成 ✓
 * 机台：{workCenterName}
 * 问题：{problem}
 */
export function buildMaintenanceTelegramCompletedText(args: {
  workCenterName: string;
  problem: string;
}): string {
  const machine = args.workCenterName.trim() || "未知机台";
  const problem = args.problem.trim() || "—";
  return ["已完成 ✓", `机台：${machine}`, `问题：${problem}`].join("\n");
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

/**
 * Assign notify markup for **private DM only**: Complete (no Start).
 * Do not attach to group messages.
 */
export function buildMaintenanceTelegramButtons(dispatchId: string) {
  return {
    inline_keyboard: [
      [
        {
          text: "完成",
          callback_data: `${TELEGRAM_CB_COMPLETE}${dispatchId}`
        }
      ]
    ]
  };
}
