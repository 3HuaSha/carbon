import { getCarbonServiceRole } from "@carbon/auth/client.server";
import {
  clearTelegramPendingBind,
  consumeTelegramBindNonce,
  findEmployeesByEmailForTelegramBind,
  getTelegramPendingBind,
  getUserByTelegramChatId,
  getUserByTelegramUserId,
  isTelegramCommand,
  linkTelegramUser,
  markMaintenanceAssignTelegramCompleted,
  parseTelegramSetGroupKind,
  resolveTelegramBindCompanyId,
  runTelegramMaintenanceAction,
  setTelegramCrewGroupChatId,
  setTelegramPendingBind,
  TELEGRAM_CB_COMPLETE,
  TELEGRAM_CB_START,
  TELEGRAM_CREW_LABELS_ZH,
  TELEGRAM_PIN_LOCKOUT_PREFIX,
  unlinkTelegramByChatId
} from "@carbon/ee/telegram.server";
import {
  MES_INTERNAL_URL,
  SHOP_INTERNAL_SECRET,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME,
  TELEGRAM_COMPANY_ID,
  TELEGRAM_WEBHOOK_SECRET
} from "@carbon/env";
import { AccountLockout, redis } from "@carbon/kv";
import {
  answerTelegramCallbackQuery,
  editTelegramMessage,
  sendTelegramMessage
} from "@carbon/lib/telegram.server";
import { getLogger } from "@carbon/logger";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { getDatabaseClient } from "~/services/database.server";

export const config = { runtime: "nodejs" };

const logger = getLogger("erp", "telegram", "webhook");

/** Rate-limit failed email bind attempts per chat (email acts as bind secret). */
const bindLockout = new AccountLockout({
  redis,
  prefix: TELEGRAM_PIN_LOCKOUT_PREFIX,
  maxAttempts: 8,
  window: "15 m"
});

const LOCKED_BIND_ERROR = "尝试次数过多，请稍后再试";

const BIND_INTRO =
  "欢迎使用维修通知机器人。\n\n请发送你在 Carbon 里登记的邮箱完成绑定（区分大小写不敏感）。\n之后派工通知会推到这里，开始/完成不用再验证。";

/**
 * Let MES run the same 已修好 提醒 / push / 待开机 follow-up as a PWA Complete.
 * Best-effort: the dispatch is already completed, so a failure only logs.
 */
async function notifyMesRepairComplete(companyId: string, dispatchId: string) {
  if (!MES_INTERNAL_URL || !SHOP_INTERNAL_SECRET) return;
  try {
    const response = await fetch(
      `${MES_INTERNAL_URL.replace(/\/$/, "")}/api/internal/shop/repair-complete`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-shop-internal-secret": SHOP_INTERNAL_SECRET
        },
        body: JSON.stringify({ companyId, dispatchId }),
        signal: AbortSignal.timeout(8000)
      }
    );
    if (!response.ok) {
      logger.warn("MES repair-complete hook rejected", {
        companyId,
        dispatchId,
        status: response.status
      });
    }
  } catch (err) {
    logger.warn("MES repair-complete hook failed", {
      companyId,
      dispatchId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

function isValidTelegramSecret(request: Request): boolean {
  if (!TELEGRAM_WEBHOOK_SECRET) return false;
  const header = request.headers.get("x-telegram-bot-api-secret-token");
  return header === TELEGRAM_WEBHOOK_SECRET;
}

/** Health / BotFather reachability — no secrets. */
export async function loader(_args: LoaderFunctionArgs) {
  return data({
    ok: true,
    bot: TELEGRAM_BOT_USERNAME ? `@${TELEGRAM_BOT_USERNAME}` : null,
    configured: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_WEBHOOK_SECRET)
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  if (!isValidTelegramSecret(request)) {
    logger.error("Rejected Telegram webhook with invalid secret token", {
      hasSecret: Boolean(TELEGRAM_WEBHOOK_SECRET)
    });
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  if (!TELEGRAM_BOT_TOKEN) {
    return data({ error: "Bot not configured" }, { status: 503 });
  }

  let update: Record<string, unknown>;
  try {
    update = (await request.json()) as Record<string, unknown>;
  } catch {
    return data({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query as TelegramCallbackQuery);
    } else if (update.message) {
      await handleMessage(update.message as TelegramMessage);
    } else if (update.my_chat_member) {
      await handleMyChatMember(update.my_chat_member as TelegramMyChatMember);
    }
  } catch (err) {
    logger.error("Telegram webhook handler failed", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    });
  }

  // Always 200 so Telegram does not retry forever on business errors.
  return data({ ok: true });
}

type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: { id: number; type: string; title?: string };
  from?: { id: number; username?: string; first_name?: string };
};

type TelegramCallbackQuery = {
  id: string;
  data?: string;
  from: { id: number; username?: string; first_name?: string };
  message?: {
    message_id: number;
    chat: { id: number; type?: string };
    text?: string;
  };
};

type TelegramMyChatMember = {
  chat: { id: number; type: string; title?: string };
  new_chat_member?: { status?: string };
};

async function handleMyChatMember(update: TelegramMyChatMember) {
  const chatId = String(update.chat.id);
  const status = update.new_chat_member?.status ?? "unknown";
  logger.info("Telegram bot chat membership changed", {
    chatId,
    chatType: update.chat.type,
    title: update.chat.title ?? null,
    status
  });
  if (
    (update.chat.type === "group" || update.chat.type === "supergroup") &&
    (status === "member" || status === "administrator")
  ) {
    await reply(
      chatId,
      `已加入群组。\nchat_id: \`${chatId}\`\n\n在本群发送：\n/setgroup repair — 设为维修群\n/setgroup mold — 设为模房群\n（/setgroup 无参数 = 维修群）\n\n或设 Railway：TELEGRAM_REPAIR_GROUP_CHAT_ID / TELEGRAM_MOLD_GROUP_CHAT_ID\n也可发 /chatid 查看。`
    );
  }
}

async function handleMessage(message: TelegramMessage) {
  const chatId = String(message.chat.id);
  const text = (message.text ?? "").trim();
  if (!text) return;

  if (isTelegramCommand(text, "start")) {
    // Deep-link payload: `/start <nonce>` or `/start@bot <nonce>`.
    const afterCmd = text.replace(/^\/start(?:@\S+)?/i, "").trim();
    await handleStart(chatId, message, afterCmd);
    return;
  }

  if (isTelegramCommand(text, "chatid") || isTelegramCommand(text, "groupid")) {
    logger.info("Telegram /chatid requested", {
      chatId,
      chatType: message.chat.type,
      title: message.chat.title ?? null
    });
    await reply(
      chatId,
      `chat_id: ${chatId}\ntype: ${message.chat.type}${
        message.chat.title ? `\ntitle: ${message.chat.title}` : ""
      }\n\n维修群：/setgroup repair（或 /setgroup）\n模房群：/setgroup mold\n或 Railway TELEGRAM_REPAIR_GROUP_CHAT_ID / TELEGRAM_MOLD_GROUP_CHAT_ID`
    );
    return;
  }

  if (isTelegramCommand(text, "setgroup")) {
    await handleSetGroup(message, text);
    return;
  }

  if (
    isTelegramCommand(text, "bind") ||
    text === "绑定" ||
    text === "绑定账号"
  ) {
    // Bind is private-chat only (email + chat↔user mapping).
    if (message.chat.type !== "private") {
      await reply(
        chatId,
        "请私聊机器人完成绑定（发送 /bind），群里只用于派工通知（完成请在私聊点「完成」）。"
      );
      return;
    }
    await beginTelegramOnlyBind(chatId);
    return;
  }

  if (isTelegramCommand(text, "unlink")) {
    if (message.chat.type !== "private") {
      await reply(chatId, "请私聊机器人发送 /unlink。");
      return;
    }
    await handleUnlink(chatId);
    return;
  }

  if (isTelegramCommand(text, "status")) {
    if (message.chat.type !== "private") {
      await reply(chatId, "请私聊机器人发送 /status。");
      return;
    }
    await handleStatus(chatId);
    return;
  }

  const pending = await getTelegramPendingBind(chatId);
  if (pending?.step === "email") {
    await handleEmailBindAttempt(chatId, message, pending.companyId, text);
    return;
  }

  // Ignore free-form chatter in groups; bind prompts are private-only.
  if (message.chat.type !== "private") return;

  const mapping = await getUserByTelegramChatId(getCarbonServiceRole(), chatId);
  if (!mapping) {
    await reply(
      chatId,
      "尚未绑定 Carbon 账号。\n\n请发送 /bind，或直接发送你的邮箱开始绑定。"
    );
  }
}

async function handleStart(
  chatId: string,
  message: TelegramMessage,
  startPayload: string
) {
  if (!startPayload) {
    const mapping = await getUserByTelegramChatId(
      getCarbonServiceRole(),
      chatId
    );
    if (mapping) {
      await reply(
        chatId,
        "已绑定。收到维修派工时会通知你，可直接点「开始 / 完成」。发送 /unlink 解除绑定；发送 /bind 可重新绑定。"
      );
      return;
    }
    await beginTelegramOnlyBind(chatId);
    return;
  }

  // Optional secondary: MES deep-link nonce → bind immediately (MES already identified).
  const bind = await consumeTelegramBindNonce(startPayload);
  if (!bind) {
    await reply(
      chatId,
      "绑定链接无效或已过期。\n\n也可直接在此绑定：请发送你的邮箱。"
    );
    await beginTelegramOnlyBind(chatId);
    return;
  }

  const client = getCarbonServiceRole();
  const employee = await client
    .from("employees")
    .select("id, name")
    .eq("id", bind.employeeId)
    .eq("companyId", bind.companyId)
    .eq("active", true)
    .maybeSingle();

  if (!employee.data) {
    await reply(chatId, "账号不存在或已停用。也可发送邮箱重新绑定。");
    return;
  }

  await clearTelegramPendingBind(chatId);
  await linkTelegramUser(getDatabaseClient(), {
    companyId: bind.companyId,
    userId: bind.employeeId,
    chatId,
    telegramUserId: message.from?.id,
    username: message.from?.username ?? null,
    createdBy: bind.employeeId
  });

  await reply(
    chatId,
    `已绑定到 ${employee.data.name}。之后维修派工会推送到这里，可直接点「开始 / 完成」。`
  );
}

async function beginTelegramOnlyBind(chatId: string) {
  const client = getCarbonServiceRole();
  const company = await resolveTelegramBindCompanyId(
    client,
    TELEGRAM_COMPANY_ID || undefined
  );
  if (!company.ok) {
    await reply(
      chatId,
      company.reason === "ambiguous"
        ? "无法确定公司，请联系管理员配置 TELEGRAM_COMPANY_ID，或使用 MES「绑定 Telegram」链接。"
        : "绑定暂不可用，请联系管理员。"
    );
    return;
  }

  const ok = await setTelegramPendingBind(chatId, {
    step: "email",
    companyId: company.companyId
  });
  if (!ok) {
    await reply(chatId, "暂时无法开始绑定，请稍后重试。");
    return;
  }

  await reply(chatId, BIND_INTRO);
}

async function handleEmailBindAttempt(
  chatId: string,
  message: TelegramMessage,
  companyId: string,
  text: string
) {
  if (text.startsWith("/")) {
    await reply(chatId, "请先发送你的邮箱（不要发命令）。");
    return;
  }

  const lockoutKey = `email:${companyId}:${chatId}`;
  const matches = await findEmployeesByEmailForTelegramBind(
    getCarbonServiceRole(),
    { companyId, query: text }
  );

  if (matches.length === 0) {
    const attempt = await bindLockout.recordFailure(lockoutKey);
    await reply(
      chatId,
      attempt.locked
        ? LOCKED_BIND_ERROR
        : "未找到匹配的邮箱。请重新发送 Carbon 里登记的完整邮箱。"
    );
    return;
  }

  if (matches.length > 1) {
    const list = matches
      .map((m, i) => `${i + 1}. ${m.name} <${m.email}>`)
      .join("\n");
    await reply(
      chatId,
      `找到多个匹配，请发送完整邮箱（与下列一致）：\n${list}`
    );
    return;
  }

  const employee = matches[0]!;
  await bindLockout.reset(lockoutKey);
  await clearTelegramPendingBind(chatId);

  await linkTelegramUser(getDatabaseClient(), {
    companyId,
    userId: employee.id,
    chatId,
    telegramUserId: message.from?.id,
    username: message.from?.username ?? null,
    createdBy: employee.id
  });

  await reply(
    chatId,
    `已绑定到 ${employee.name}。之后维修派工会推送到这里，可直接点「开始 / 完成」。`
  );
}

async function handleSetGroup(message: TelegramMessage, text: string) {
  const chatId = String(message.chat.id);
  if (message.chat.type !== "group" && message.chat.type !== "supergroup") {
    await reply(
      chatId,
      "请在目标群里发送 /setgroup repair 或 /setgroup mold（私聊无效）。也可先发 /chatid 查看 chat_id。"
    );
    return;
  }

  const kind = parseTelegramSetGroupKind(text);
  if (!kind) {
    await reply(
      chatId,
      "用法：/setgroup repair（维修群）或 /setgroup mold（模房群）。\n无参数时默认维修群。"
    );
    return;
  }

  const company = await resolveTelegramBindCompanyId(
    getCarbonServiceRole(),
    TELEGRAM_COMPANY_ID || undefined
  );
  if (!company.ok) {
    await reply(
      chatId,
      company.reason === "ambiguous"
        ? "无法确定公司，请联系管理员配置 TELEGRAM_COMPANY_ID。"
        : "暂无法保存群组，请联系管理员。"
    );
    return;
  }

  // createdBy FK → user(id). Never store Telegram numeric ids there (that
  // made /setgroup throw and stay silent). Prefer bound Carbon user if any.
  let createdBy: string | undefined;
  if (message.from?.id != null) {
    const actor = await getUserByTelegramUserId(
      getCarbonServiceRole(),
      message.from.id
    );
    createdBy = actor?.userId;
  }

  const labelZh = TELEGRAM_CREW_LABELS_ZH[kind];
  const envHint =
    kind === "repair"
      ? "TELEGRAM_REPAIR_GROUP_CHAT_ID（或旧名 TELEGRAM_MAINTENANCE_GROUP_CHAT_ID）"
      : "TELEGRAM_MOLD_GROUP_CHAT_ID";

  try {
    const db = getDatabaseClient();
    await setTelegramCrewGroupChatId(db, {
      companyId: company.companyId,
      kind,
      chatId,
      title: message.chat.title ?? null,
      createdBy,
      telegramFromId: message.from?.id
    });

    logger.info("Telegram crew group chat configured", {
      chatId,
      kind,
      companyId: company.companyId,
      title: message.chat.title ?? null
    });

    await reply(
      chatId,
      `已保存${labelZh}群 chat_id：${chatId}\n指派给${labelZh}人员时，派工通知会发到本群（并私聊被指派人；「完成」仅在私聊）。\n也可设 Railway：${envHint}`
    );
  } catch (err) {
    logger.error("Failed to save Telegram crew group", {
      chatId,
      kind,
      companyId: company.companyId,
      error: err instanceof Error ? err.message : String(err)
    });
    await reply(
      chatId,
      `保存${labelZh}群失败，请稍后重试。也可先发 /chatid 查看 chat_id 并联系管理员。`
    );
  }
}

async function handleUnlink(chatId: string) {
  const db = getDatabaseClient();
  const client = getCarbonServiceRole();
  const removed = await unlinkTelegramByChatId(db, client, chatId);
  await clearTelegramPendingBind(chatId);
  if (!removed) {
    await reply(chatId, "当前没有绑定。发送 /bind 可开始绑定。");
    return;
  }
  await reply(chatId, "已解除绑定。发送 /bind 可重新绑定。");
}

async function handleStatus(chatId: string) {
  const mapping = await getUserByTelegramChatId(getCarbonServiceRole(), chatId);
  if (!mapping) {
    await reply(chatId, "未绑定。发送 /bind，或直接发送邮箱开始绑定。");
    return;
  }
  const employee = await getCarbonServiceRole()
    .from("employees")
    .select("name")
    .eq("id", mapping.userId)
    .eq("companyId", mapping.companyId)
    .maybeSingle();
  await reply(
    chatId,
    `已绑定：${employee.data?.name ?? mapping.userId}\n发送 /unlink 可解除。`
  );
}

async function handleCallbackQuery(query: TelegramCallbackQuery) {
  // Message lives in private or group chat; identity is always the clicker.
  const messageChatId = String(query.message?.chat.id ?? query.from.id);
  const telegramUserId = String(query.from.id);
  const chatType = query.message?.chat.type;
  const isGroupChat =
    chatType === "group" ||
    chatType === "supergroup" ||
    (!chatType && messageChatId !== telegramUserId);
  const callbackData = query.data ?? "";
  const messageId = query.message?.message_id;

  const mapping = await getUserByTelegramUserId(
    getCarbonServiceRole(),
    telegramUserId
  );
  if (!mapping) {
    await answerTelegramCallbackQuery({
      callbackQueryId: query.id,
      text: "请先私聊机器人绑定（/bind）",
      showAlert: true
    });
    if (!isGroupChat) {
      await reply(messageChatId, "请先绑定：发送 /bind，或发送你的邮箱。");
    }
    return;
  }

  let action: "Start" | "Complete" | null = null;
  let dispatchId: string | null = null;
  if (callbackData.startsWith(TELEGRAM_CB_START)) {
    action = "Start";
    dispatchId = callbackData.slice(TELEGRAM_CB_START.length);
  } else if (callbackData.startsWith(TELEGRAM_CB_COMPLETE)) {
    action = "Complete";
    dispatchId = callbackData.slice(TELEGRAM_CB_COMPLETE.length);
  }

  if (!action || !dispatchId) {
    await answerTelegramCallbackQuery({
      callbackQueryId: query.id,
      text: "未知操作"
    });
    return;
  }

  // Complete (and Start) only from private DM — groups are peer-visible only.
  if (isGroupChat) {
    await answerTelegramCallbackQuery({
      callbackQueryId: query.id,
      text: "请私聊机器人点「完成」",
      showAlert: true
    });
    return;
  }

  const result = await runTelegramMaintenanceAction(getCarbonServiceRole(), {
    action,
    dispatchId,
    companyId: mapping.companyId,
    userId: mapping.userId
  });

  await answerTelegramCallbackQuery({
    callbackQueryId: query.id,
    text: result.message,
    showAlert: !result.ok
  });

  if (result.ok && action === "Complete") {
    await notifyMesRepairComplete(mapping.companyId, dispatchId);
    // Edit every stored assign message (all DMs + crew group) to「已完成 ✓」.
    try {
      const { edited } = await markMaintenanceAssignTelegramCompleted(
        getCarbonServiceRole(),
        {
          companyId: mapping.companyId,
          dispatchId,
          force: true
        }
      );
      // Fallback if assign ran before message-id tracking existed.
      if (edited === 0 && messageId) {
        await editTelegramMessage({
          chatId: messageChatId,
          messageId,
          text: "已完成 ✓",
          replyMarkup: { inline_keyboard: [] }
        });
      }
    } catch (err) {
      logger.warn("Failed to edit Telegram assign messages on complete", {
        err
      });
      if (messageId) {
        try {
          await editTelegramMessage({
            chatId: messageChatId,
            messageId,
            text: "已完成 ✓",
            replyMarkup: { inline_keyboard: [] }
          });
        } catch {
          // ignore
        }
      }
    }
  } else if (
    result.ok &&
    action === "Start" &&
    messageId &&
    query.message?.text
  ) {
    const actor =
      query.from.username != null
        ? `@${query.from.username}`
        : (query.from.first_name ?? "操作员");
    try {
      await editTelegramMessage({
        chatId: messageChatId,
        messageId,
        text: `${query.message.text}\n\n✅ 已开始（${actor}）`,
        replyMarkup: { inline_keyboard: [] }
      });
    } catch (err) {
      logger.warn("Failed to edit Telegram message after start", { err });
    }
  } else if (!result.ok) {
    await reply(messageChatId, result.message);
  }
}

async function reply(chatId: string, text: string) {
  await sendTelegramMessage({
    chatId,
    text,
    force: true
  });
}
