import { TELEGRAM_CB_COMPLETE, TELEGRAM_CB_START } from "./constants";

export function buildMaintenanceTelegramText(args: {
  description: string;
  details: Array<{ label: string; value: string }>;
  shopUrl: string;
}): string {
  const lines = [
    `🔧 ${args.description}`,
    ...args.details.map((d) => `${d.label}: ${d.value}`),
    "",
    `打开 MES: ${args.shopUrl}`
  ];
  return lines.join("\n");
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
