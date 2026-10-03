import { TELEGRAM_CB_COMPLETE, TELEGRAM_CB_START } from "./constants";

export function buildMaintenanceTelegramText(args: {
  description: string;
  details: Array<{ label: string; value: string }>;
  shopUrl: string;
  /** Group notify: "@username" or display name of the assignee. */
  assigneeMention?: string | null;
}): string {
  const lines = [
    `🔧 ${args.description}`,
    ...(args.assigneeMention ? [`指派: ${args.assigneeMention}`] : []),
    ...args.details.map((d) => `${d.label}: ${d.value}`),
    "",
    `打开 MES: ${args.shopUrl}`
  ];
  return lines.join("\n");
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
