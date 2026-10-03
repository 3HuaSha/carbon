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
