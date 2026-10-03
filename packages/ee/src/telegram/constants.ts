export const TELEGRAM_INTEGRATION = "telegram" as const;
export const TELEGRAM_USER_ENTITY = "user" as const;

/** Redis key prefixes for bind flow (nonce + pending PIN). */
export const TELEGRAM_BIND_NONCE_PREFIX = "@carbon/telegram-bind:";
export const TELEGRAM_PENDING_PIN_PREFIX = "@carbon/telegram-pending-pin:";
export const TELEGRAM_PIN_LOCKOUT_PREFIX = "@carbon/telegram-pin";

export const TELEGRAM_BIND_TTL_SECONDS = 15 * 60;
export const TELEGRAM_PENDING_PIN_TTL_SECONDS = 10 * 60;

/** Inline callback_data prefixes (must stay under Telegram's 64-char limit). */
export const TELEGRAM_CB_START = "md:start:";
export const TELEGRAM_CB_COMPLETE = "md:complete:";
