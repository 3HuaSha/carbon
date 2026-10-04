/**
 * Shared 维修 / 模房 crew typing for Telegram group routing.
 * Aliases mirror MES `/shop` assign columns (`SHOP_ASSIGN_GROUP_ALIASES`) so
 * boards, picker, and notify stay aligned — keep both lists in sync.
 */

export const TELEGRAM_CREW_KINDS = ["repair", "mold"] as const;
export type TelegramCrewKind = (typeof TELEGRAM_CREW_KINDS)[number];

/** `employeeType.name` aliases — same needles as MES shop assign groups. */
export const TELEGRAM_CREW_TYPE_ALIASES: Record<
  TelegramCrewKind,
  readonly string[]
> = {
  repair: ["维修", "机修", "repair", "maintenance", "machine repair"],
  mold: ["模房", "模具", "mold", "mould", "mold shop", "mould shop"]
};

export const TELEGRAM_CREW_LABELS_ZH: Record<TelegramCrewKind, string> = {
  repair: "维修",
  mold: "模房"
};

function normalizeTypeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesAliasList(
  employeeTypeName: string | null | undefined,
  aliases: readonly string[]
): boolean {
  if (!employeeTypeName?.trim()) return false;
  const normalized = normalizeTypeName(employeeTypeName);
  return aliases.some((alias) => {
    const needle = normalizeTypeName(alias);
    return normalized === needle || normalized.includes(needle);
  });
}

/** Resolve repair vs mold from `employeeType.name`. Null for 主管/PE/other. */
export function resolveTelegramCrewKind(
  employeeTypeName: string | null | undefined
): TelegramCrewKind | null {
  // Mold before repair if aliases ever overlap (matches MES display order).
  if (matchesAliasList(employeeTypeName, TELEGRAM_CREW_TYPE_ALIASES.mold)) {
    return "mold";
  }
  if (matchesAliasList(employeeTypeName, TELEGRAM_CREW_TYPE_ALIASES.repair)) {
    return "repair";
  }
  return null;
}

/**
 * Which crew groups should get an assign notify from the selected people.
 * - Any 维修 → repair group (names = those people)
 * - Any 模房 → mold group
 * - Neither (主管/PE only) → repair group fallback with all selected names
 */
export function resolveTelegramCrewNotifyTargets(
  people: ReadonlyArray<{
    displayName: string;
    employeeTypeName: string | null | undefined;
  }>
): Partial<Record<TelegramCrewKind, string[]>> {
  const repairNames: string[] = [];
  const moldNames: string[] = [];

  for (const person of people) {
    const kind = resolveTelegramCrewKind(person.employeeTypeName);
    const name = person.displayName.trim() || "未命名";
    if (kind === "repair") repairNames.push(name);
    else if (kind === "mold") moldNames.push(name);
  }

  if (repairNames.length === 0 && moldNames.length === 0) {
    return {
      repair: people.map((p) => p.displayName.trim() || "未命名")
    };
  }

  const targets: Partial<Record<TelegramCrewKind, string[]>> = {};
  if (repairNames.length > 0) targets.repair = repairNames;
  if (moldNames.length > 0) targets.mold = moldNames;
  return targets;
}

/** Normalize stored `content.telegramCrewKinds` (unknown JSON). */
export function parseTelegramCrewKinds(value: unknown): TelegramCrewKind[] {
  if (!Array.isArray(value)) return [];
  const kinds: TelegramCrewKind[] = [];
  for (const item of value) {
    if (item === "repair" || item === "mold") {
      if (!kinds.includes(item)) kinds.push(item);
    }
  }
  return kinds;
}
