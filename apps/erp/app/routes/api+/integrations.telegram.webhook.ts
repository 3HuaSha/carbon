import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { verifyEmployeePin } from "@carbon/ee/console.server";
import {
  clearTelegramPendingBind,
  consumeTelegramBindNonce,
  findEmployeesForTelegramBind,
  getTelegramPendingBind,
  getUserByTelegramChatId,
  linkTelegramUser,
  resolveTelegramBindCompanyId,
  runTelegramMaintenanceAction,
  setTelegramPendingBind,
  TELEGRAM_CB_COMPLETE,
  TELEGRAM_CB_START,
  TELEGRAM_PIN_LOCKOUT_PREFIX,
  unlinkTelegramByChatId
} from "@carbon/ee/telegram.server";
import {
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

const pinLockout = new AccountLockout({
  redis,
  prefix: TELEGRAM_PIN_LOCKOUT_PREFIX,
  maxAttempts: 5,
  window: "15 m"
});

const GENERIC_PIN_ERROR = "PIN 不正确，请重试";
const LOCKED_PIN_ERROR = "尝试次数过多，请稍后再试";

const BIND_INTRO =
  "欢迎使用维修通知机器人。\n\n请发送你的工号或姓名（与 MES 操作员一致），然后输入 4 位 PIN 完成绑定。\n之后派工通知会推到这里，开始/完成不用再输 PIN。";

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
    }
  } catch (err) {
    logger.error("Telegram webhook handler failed", { error: err });
  }

  // Always 200 so Telegram does not retry forever on business errors.
  return data({ ok: true });
}

type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: { id: number; type: string };
  from?: { id: number; username?: string; first_name?: string };
};

type TelegramCallbackQuery = {
  id: string;
  data?: string;
  from: { id: number; username?: string; first_name?: string };
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
};

async function handleMessage(message: TelegramMessage) {
  const chatId = String(message.chat.id);
  const text = (message.text ?? "").trim();
  if (!text) return;

  if (text.startsWith("/start")) {
    const payload = text.slice("/start".length).trim();
    await handleStart(chatId, message, payload);
    return;
  }

  if (
    text === "/bind" ||
    text.startsWith("/bind@") ||
    text === "绑定" ||
    text === "绑定账号"
  ) {
    await beginTelegramOnlyBind(chatId);
    return;
  }

  if (text === "/unlink" || text.startsWith("/unlink@")) {
    await handleUnlink(chatId);
    return;
  }

  if (text === "/status" || text.startsWith("/status@")) {
    await handleStatus(chatId);
    return;
  }

  const pending = await getTelegramPendingBind(chatId);
  if (pending?.step === "identity") {
    await handleIdentityAttempt(chatId, pending.companyId, text);
    return;
  }
  if (pending?.step === "pin") {
    await handlePinAttempt(chatId, message, pending, text);
    return;
  }

  const mapping = await getUserByTelegramChatId(getCarbonServiceRole(), chatId);
  if (!mapping) {
    await reply(
      chatId,
      "尚未绑定 Carbon 操作员。\n\n请发送 /bind，或直接发送你的工号/姓名开始绑定。"
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

  // Optional secondary: MES deep-link nonce → ask PIN only.
  const bind = await consumeTelegramBindNonce(startPayload);
  if (!bind) {
    await reply(
      chatId,
      "绑定链接无效或已过期。\n\n也可直接在此绑定：请发送你的工号或姓名。"
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
    await reply(chatId, "操作员不存在或已停用。也可发送工号或姓名重新绑定。");
    return;
  }

  const ok = await setTelegramPendingBind(chatId, {
    step: "pin",
    companyId: bind.companyId,
    employeeId: bind.employeeId
  });
  if (!ok) {
    await reply(chatId, "暂时无法开始绑定，请稍后重试。");
    return;
  }

  await reply(
    chatId,
    `正在绑定到 ${employee.data.name}。\n请输入你的 4 位操作员 PIN（仅本次绑定需要，之后开始/完成不用 PIN）。`
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
    step: "identity",
    companyId: company.companyId
  });
  if (!ok) {
    await reply(chatId, "暂时无法开始绑定，请稍后重试。");
    return;
  }

  await reply(chatId, BIND_INTRO);
}

async function handleIdentityAttempt(
  chatId: string,
  companyId: string,
  text: string
) {
  if (text.startsWith("/")) {
    await reply(chatId, "请先发送你的工号或姓名（不要发命令）。");
    return;
  }

  const matches = await findEmployeesForTelegramBind(getCarbonServiceRole(), {
    companyId,
    query: text
  });

  if (matches.length === 0) {
    await reply(
      chatId,
      "未找到匹配的操作员。请重新发送工号或姓名（与 MES 里显示的一致）。"
    );
    return;
  }

  if (matches.length > 1) {
    const list = matches.map((m, i) => `${i + 1}. ${m.name}`).join("\n");
    await reply(
      chatId,
      `找到多人，请发送更完整的姓名（与下列一致）：\n${list}`
    );
    return;
  }

  const employee = matches[0]!;
  const ok = await setTelegramPendingBind(chatId, {
    step: "pin",
    companyId,
    employeeId: employee.id
  });
  if (!ok) {
    await reply(chatId, "暂时无法继续绑定，请稍后重试。");
    return;
  }

  await reply(
    chatId,
    `已找到：${employee.name}\n请输入你的 4 位操作员 PIN（仅本次绑定需要）。`
  );
}

async function handlePinAttempt(
  chatId: string,
  message: TelegramMessage,
  pending: { companyId: string; employeeId: string },
  text: string
) {
  if (!/^\d{4}$/.test(text)) {
    await reply(chatId, "请输入 4 位数字 PIN。");
    return;
  }

  const lockoutKey = `${pending.companyId}:${pending.employeeId}`;
  const attempt = await pinLockout.recordFailure(lockoutKey);
  if (attempt.locked) {
    await reply(chatId, LOCKED_PIN_ERROR);
    return;
  }

  const db = getDatabaseClient();
  const verified = await verifyEmployeePin(db, {
    employeeId: pending.employeeId,
    companyId: pending.companyId,
    pin: text
  });

  if (!verified.hasPin || !verified.valid) {
    await reply(chatId, GENERIC_PIN_ERROR);
    return;
  }

  await pinLockout.reset(lockoutKey);
  await clearTelegramPendingBind(chatId);

  await linkTelegramUser(db, {
    companyId: pending.companyId,
    userId: pending.employeeId,
    chatId,
    telegramUserId: message.from?.id,
    username: message.from?.username ?? null,
    createdBy: pending.employeeId
  });

  const client = getCarbonServiceRole();
  const employee = await client
    .from("employees")
    .select("name")
    .eq("id", pending.employeeId)
    .eq("companyId", pending.companyId)
    .maybeSingle();

  await reply(
    chatId,
    `已绑定到 ${employee.data?.name ?? "操作员"}。之后维修派工会推送到这里，可直接点「开始 / 完成」。`
  );
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
    await reply(chatId, "未绑定。发送 /bind，或直接发送工号/姓名开始绑定。");
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
  const chatId = String(query.message?.chat.id ?? query.from.id);
  const callbackData = query.data ?? "";
  const messageId = query.message?.message_id;

  const mapping = await getUserByTelegramChatId(getCarbonServiceRole(), chatId);
  if (!mapping) {
    await answerTelegramCallbackQuery({
      callbackQueryId: query.id,
      text: "请先绑定",
      showAlert: true
    });
    await reply(chatId, "请先绑定：发送 /bind，或发送你的工号/姓名。");
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

  if (result.ok && messageId && query.message?.text) {
    const suffix = action === "Start" ? "\n\n✅ 已开始" : "\n\n✅ 已完成";
    try {
      await editTelegramMessage({
        chatId,
        messageId,
        text: `${query.message.text}${suffix}`,
        replyMarkup: { inline_keyboard: [] }
      });
    } catch (err) {
      logger.warn("Failed to edit Telegram message after action", { err });
    }
  } else if (!result.ok) {
    await reply(chatId, result.message);
  }
}

async function reply(chatId: string, text: string) {
  await sendTelegramMessage({
    chatId,
    text,
    force: true
  });
}
