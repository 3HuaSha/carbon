import type { TelegramCrewKind } from "./crew";

/**
 * Match a Telegram bot command, including the group form Telegram appends:
 * `/setgroup` and `/setgroup@BotUsername` (optional trailing args after space).
 */
export function isTelegramCommand(text: string, command: string): boolean {
  const token = text.trim().split(/\s+/)[0] ?? "";
  if (!token.startsWith("/")) return false;
  const name = token.slice(1).split("@")[0]?.toLowerCase() ?? "";
  return name === command.toLowerCase();
}

/** Arguments after the command token (`/setgroup mold` → `["mold"]`). */
export function getTelegramCommandArgs(text: string): string[] {
  const parts = text.trim().split(/\s+/);
  return parts.slice(1).filter(Boolean);
}

/**
 * Parse `/setgroup [repair|mold|维修|模房|…]`.
 * - No arg → `repair` (legacy single-group migration default)
 * - Known synonym → that crew kind
 * - Unknown arg → `null` (caller should reply with usage)
 */
export function parseTelegramSetGroupKind(
  text: string
): TelegramCrewKind | null {
  const args = getTelegramCommandArgs(text);
  if (args.length === 0) return "repair";

  const raw = args[0]!.trim().toLowerCase();
  if (
    raw === "repair" ||
    raw === "维修" ||
    raw === "机修" ||
    raw === "maintenance"
  ) {
    return "repair";
  }
  if (raw === "mold" || raw === "模房" || raw === "模具" || raw === "mould") {
    return "mold";
  }
  return null;
}
