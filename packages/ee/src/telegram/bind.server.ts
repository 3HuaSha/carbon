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

export async function setTelegramPendingPin(
  chatId: string,
  payload: TelegramBindPayload
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

export async function getTelegramPendingPin(
  chatId: string
): Promise<TelegramBindPayload | null> {
  const key = `${TELEGRAM_PENDING_PIN_PREFIX}${chatId}`;
  const raw = await redis.get(key);
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as TelegramBindPayload;
    if (!parsed.companyId || !parsed.employeeId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearTelegramPendingPin(chatId: string): Promise<void> {
  await redis.del(`${TELEGRAM_PENDING_PIN_PREFIX}${chatId}`);
}
