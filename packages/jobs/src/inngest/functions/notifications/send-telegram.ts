import { TELEGRAM_BOT_TOKEN } from "@carbon/env";
import { sendTelegramMessage } from "@carbon/lib/telegram.server";
import { inngest } from "../../client";

export const sendTelegramFunction = inngest.createFunction(
  {
    id: "send-telegram",
    retries: 3
  },
  { event: "carbon/send-telegram" },
  async ({ event, step }) => {
    const { chatId, text, replyMarkup, parseMode, companyId } = event.data;

    if (!TELEGRAM_BOT_TOKEN) {
      return { success: false, skipped: "telegram-bot-token-missing" };
    }

    await step.run("post-message", async () => {
      await sendTelegramMessage({
        chatId,
        text,
        replyMarkup,
        parseMode,
        // Production sends always; localhost no-op is inside the helper.
        force: false
      });
    });

    return { success: true, companyId };
  }
);
