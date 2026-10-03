import { assertIsPost, TELEGRAM_BOT_USERNAME } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { createTelegramBindNonce } from "@carbon/ee/telegram.server";
import { getTelegramBotDeepLink } from "@carbon/lib/telegram.server";
import { getLogger } from "@carbon/logger";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";

const logger = getLogger("mes", "telegram-bind");

/**
 * Creates a short-lived MES → Telegram deep link for the current operator.
 * The start payload is a Redis nonce (Telegram limits start to 64 chars);
 * the bot asks for the operator PIN once, then stores chat↔user mapping.
 */
export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { companyId, userId } = await requirePermissions(request, {});

  const nonce = await createTelegramBindNonce({
    companyId,
    employeeId: userId
  });

  if (!nonce) {
    logger.error("Failed to create Telegram bind nonce (Redis down?)", {
      companyId,
      userId
    });
    return data(
      { ok: false as const, error: "Unable to start Telegram bind" },
      { status: 503 }
    );
  }

  const url = getTelegramBotDeepLink(nonce);
  return data({
    ok: true as const,
    url,
    botUsername: TELEGRAM_BOT_USERNAME.replace(/^@/, "")
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermissions(request, {});
  return data({
    botUsername: TELEGRAM_BOT_USERNAME.replace(/^@/, ""),
    botUrl: getTelegramBotDeepLink()
  });
}
