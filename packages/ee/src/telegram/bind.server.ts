import { redis } from "@carbon/kv";
import { nanoid } from "nanoid";
import {
  TELEGRAM_BIND_NONCE_PREFIX,
  TELEGRAM_BIND_TTL_SECONDS,
  TELEGRAM_PENDING_PIN_PREFIX,
  TELEGRAM_PENDING_PIN_TTL_SECONDS
} from "./constants";

export type TelegramBindPayload = {
  companyId: string;
  employeeId: string;
};

/** Multi-step Telegram-only bind (工号/姓名 → PIN). Deep-link bind jumps to `pin`. */
export type TelegramPendingBind =
  | { step: "identity"; companyId: string }
  | { step: "pin"; companyId: string; employeeId: string };

/**
 * Creates a short-lived bind nonce for the Telegram deep-link start payload.
 * Telegram limits `start` to 64 characters, so we store identity in Redis and
 * put only the nonce in `https://t.me/<bot>?start=<nonce>`.
 */
export async function createTelegramBindNonce(
  payload: TelegramBindPayload
): Promise<string | null> {
  const nonce = nanoid(21);
  const key = `${TELEGRAM_BIND_NONCE_PREFIX}${nonce}`;
  const result = await redis.set(
    key,
    JSON.stringify(payload),
    "EX",
    TELEGRAM_BIND_TTL_SECONDS
  );
  if (result === null) return null;
  return nonce;
}

export async function consumeTelegramBindNonce(
  nonce: string
): Promise<TelegramBindPayload | null> {
  const key = `${TELEGRAM_BIND_NONCE_PREFIX}${nonce}`;
  const raw = await redis.get(key);
  if (!raw || typeof raw !== "string") return null;
  await redis.del(key);
  try {
    const parsed = JSON.parse(raw) as TelegramBindPayload;
    if (!parsed.companyId || !parsed.employeeId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setTelegramPendingBind(
  chatId: string,
  payload: TelegramPendingBind
): Promise<boolean> {
  const key = `${TELEGRAM_PENDING_PIN_PREFIX}${chatId}`;
  const result = await redis.set(
    key,
    JSON.stringify(payload),
    "EX",
    TELEGRAM_PENDING_PIN_TTL_SECONDS
  );
  return result !== null;
}

/** @deprecated Prefer setTelegramPendingBind — kept for deep-link callers. */
export async function setTelegramPendingPin(
  chatId: string,
  payload: TelegramBindPayload
): Promise<boolean> {
  return setTelegramPendingBind(chatId, { step: "pin", ...payload });
}

export async function getTelegramPendingBind(
  chatId: string
): Promise<TelegramPendingBind | null> {
  const key = `${TELEGRAM_PENDING_PIN_PREFIX}${chatId}`;
  const raw = await redis.get(key);
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TelegramPendingBind> & {
      companyId?: string;
      employeeId?: string;
      step?: string;
    };
    if (!parsed.companyId) return null;
    // Back-compat: older pending rows were `{ companyId, employeeId }` only.
    if (parsed.step === "identity") {
      return { step: "identity", companyId: parsed.companyId };
    }
    if (parsed.employeeId) {
      return {
        step: "pin",
        companyId: parsed.companyId,
        employeeId: parsed.employeeId
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** @deprecated Prefer getTelegramPendingBind. */
export async function getTelegramPendingPin(
  chatId: string
): Promise<TelegramBindPayload | null> {
  const pending = await getTelegramPendingBind(chatId);
  if (!pending || pending.step !== "pin") return null;
  return { companyId: pending.companyId, employeeId: pending.employeeId };
}

export async function clearTelegramPendingPin(chatId: string): Promise<void> {
  await redis.del(`${TELEGRAM_PENDING_PIN_PREFIX}${chatId}`);
}

export const clearTelegramPendingBind = clearTelegramPendingPin;
