import type {
  ShopAssignGroup,
  ShopCrewKind,
  ShopDispatchComment,
  ShopDispatchKind,
  ShopMachine,
  ShopMachineStatus,
  ShopOpenDispatch,
  ShopPerson,
  ShopStatusFilter
} from "./shop.types";
import { shopAssignGroups } from "./shop.types";

/** Raw Meter status codes → physical shop meaning (kanban MACHINE_STATUS_MAP). */
export type MeterPhysicalStatus =
  | "running"
  | "idle"
  | "stopped"
  | "offline"
  | "unknown";

export function normalizeMeterMachineId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export function normalizeMeterWorkOrder(value: unknown): string | null {
  const index = String(value ?? "").trim();
  if (!index || index.toUpperCase() === "NULL" || index === "-") return null;
  return index;
}

/**
 * Map MachineMeter `MachineStatus` codes (kanban constants):
 * 1 → running, 0 → idle, 2/3 → stopped, 4 → offline.
 */
export function mapMeterStatusCode(raw: unknown): MeterPhysicalStatus {
  const code = String(raw ?? "").trim();
  if (code === "1") return "running";
  if (code === "0") return "idle";
  if (code === "2" || code === "3") return "stopped";
  if (code === "4") return "offline";
  return "unknown";
}

/**
 * Configurable `employeeType.name` aliases for assign columns + crew boards.
 * Match is case-insensitive; the type name matches if it equals an alias or
 * contains one (so "机修班" matches "机修"). Bowen sets these names in ERP
 * Users → Employee types, then assigns people to that type.
 *
 * Display order on the assign UI: 主管 → PE → 模房 → 维修.
 */
export const SHOP_ASSIGN_GROUP_ALIASES: Record<
  ShopAssignGroup,
  readonly string[]
> = {
  supervisor: ["主管", "supervisor", "manager", "班长"],
  pe: [
    "pe",
    "工艺",
    "process engineer",
    "process engineering",
    "工艺工程师",
    "工艺员"
  ],
  mold: ["模房", "模具", "mold", "mould", "mold shop", "mould shop"],
  repair: ["维修", "机修", "repair", "maintenance", "machine repair"]
};

/** Crew boards reuse the repair / mold alias sets from assign groups. */
export const SHOP_CREW_TYPE_ALIASES: Record<ShopCrewKind, readonly string[]> = {
  repair: SHOP_ASSIGN_GROUP_ALIASES.repair,
  mold: SHOP_ASSIGN_GROUP_ALIASES.mold
};

/** ZH labels for the four assign columns (UI order). */
export const SHOP_ASSIGN_GROUP_LABELS: Record<ShopAssignGroup, string> = {
  supervisor: "主管",
  pe: "PE",
  mold: "模房",
  repair: "维修"
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

/** True when an `employeeType.name` belongs on the given crew board. */
export function matchesShopCrewEmployeeType(
  employeeTypeName: string | null | undefined,
  crew: ShopCrewKind
): boolean {
  return matchesAliasList(employeeTypeName, SHOP_CREW_TYPE_ALIASES[crew]);
}

/** True when an `employeeType.name` belongs in the given assign group. */
export function matchesShopAssignGroup(
  employeeTypeName: string | null | undefined,
  group: ShopAssignGroup
): boolean {
  return matchesAliasList(employeeTypeName, SHOP_ASSIGN_GROUP_ALIASES[group]);
}

/**
 * Resolve which assign column an employee type belongs to. First match in
 * display order (主管 → PE → 模房 → 维修) wins if aliases ever overlap.
 */
export function resolveShopAssignGroup(
  employeeTypeName: string | null | undefined
): ShopAssignGroup | null {
  for (const group of shopAssignGroups) {
    if (matchesShopAssignGroup(employeeTypeName, group)) return group;
  }
  return null;
}

/** People bucketed into the four assign columns (empty columns included). */
export function groupPeopleByAssignGroup(
  people: ShopPerson[]
): Record<ShopAssignGroup, ShopPerson[]> {
  const groups: Record<ShopAssignGroup, ShopPerson[]> = {
    supervisor: [],
    pe: [],
    mold: [],
    repair: []
  };
  for (const person of people) {
    if (person.assignGroup) {
      groups[person.assignGroup].push(person);
    }
  }
  return groups;
}

/**
 * Primary Carbon `assignee` when the schema is single-user: first selected
 * 主管 (column order), else first selected person across 主管→PE→模房→维修.
 * Remaining selected people are Telegram-notified only (not DB assignees).
 */
export function resolvePrimaryAssigneeId(
  selectedIds: readonly string[],
  people: ShopPerson[]
): string | null {
  if (selectedIds.length === 0) return null;
  const selected = new Set(selectedIds);
  const groups = groupPeopleByAssignGroup(people);
  for (const group of shopAssignGroups) {
    const hit = groups[group].find((person) => selected.has(person.id));
    if (hit) return hit.id;
  }
  // Selected id not in any assign column (shouldn't happen in UI) — keep first.
  return selectedIds[0] ?? null;
}

/** Default selection for the assign picker: every 主管 is pre-selected. */
export function defaultSelectedAssignIds(people: ShopPerson[]): string[] {
  return groupPeopleByAssignGroup(people).supervisor.map((person) => person.id);
}

type DispatchSignals = Pick<
  ShopOpenDispatch,
  "status" | "oeeImpact" | "shopKind"
>;

/**
 * Resolve shop episode kind from `content.shopKind` when present, else infer
 * from `oeeImpact`. Legacy Down rows without a tag are treated as fault
 * (模房 / 维修 share this class).
 */
export function resolveShopDispatchKind(args: {
  shopKind?: string | null;
  oeeImpact?: string | null;
}): ShopDispatchKind {
  if (
    args.shopKind === "break" ||
    args.shopKind === "planned" ||
    args.shopKind === "fault" ||
    args.shopKind === "issue"
  ) {
    return args.shopKind;
  }
  if (args.oeeImpact === "Planned") return "planned";
  if (args.oeeImpact === "Down") return "fault";
  // No Impact without an explicit shopKind is not break — leave as fault only
  // when we somehow have an open offline episode; callers that insert break
  // always set shopKind.
  if (args.shopKind === "break") return "break";
  return "fault";
}

/**
 * Split dispatch note + comments for the machine detail UI.
 *
 * Reporting a fault stores the same text in `content.note` and as the first
 * `maintenanceDispatchComment` (createdBy = reporter / session user). Show the
 * problem as a headline only — never "Test User：停机原因". Follow-ups exclude
 * that mirrored note row.
 */
export function presentShopDispatchProblem(args: {
  note: string | null | undefined;
  comments: ShopDispatchComment[];
}): {
  problemText: string | null;
  followUpComments: ShopDispatchComment[];
} {
  const noteText = args.note?.trim() || null;
  const firstComment = args.comments.find((c) => c.comment?.trim()) ?? null;
  const problemText = noteText || firstComment?.comment?.trim() || null;

  const followUpComments = args.comments.filter((c) => {
    const text = c.comment?.trim();
    if (!text) return false;
    if (noteText && text === noteText) return false;
    if (!noteText && firstComment && c.id === firstComment.id) return false;
    return true;
  });

  return { problemText, followUpComments };
}

export function parseShopDispatchContent(content: unknown): {
  shopKind: ShopDispatchKind | null;
  note: string | null;
} {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { shopKind: null, note: null };
  }
  const record = content as Record<string, unknown>;
  const rawKind = typeof record.shopKind === "string" ? record.shopKind : null;
  const note =
    typeof record.note === "string" && record.note.trim()
      ? record.note.trim()
      : null;
  const shopKind =
    rawKind === "break" ||
    rawKind === "planned" ||
    rawKind === "fault" ||
    rawKind === "issue"
      ? rawKind
      : null;
  return { shopKind, note };
}

/**
 * Derive the phone-overview status from existing MES signals (Carbon only).
 *
 * Priority (highest first):
 * down (fault | planned | blocked) → break → running → idle
 *
 * Non-blocking 「报问题」 (`issue`) is ignored for status.
 * Waiting-repair / in-repair / planned all present as one **停机** status.
 */
export function deriveShopMachineStatus(args: {
  hasOpenProductionEvent: boolean;
  openDispatches: DispatchSignals[];
  isBlocked: boolean;
}): ShopMachineStatus {
  const dispatches = args.openDispatches;

  const isBreak = (d: DispatchSignals) =>
    resolveShopDispatchKind(d) === "break";
  const isDownEpisode = (d: DispatchSignals) => {
    const kind = resolveShopDispatchKind(d);
    // Non-blocking 「报问题」 (`issue`) must not flip the tile to 停机.
    return kind === "fault" || kind === "planned";
  };

  // Fault or planned offline → one Down presentation (unassigned still Down).
  if (dispatches.some(isDownEpisode)) {
    return "down";
  }

  if (dispatches.some(isBreak)) {
    return "break";
  }

  // Blocked with no classifiable open episode (stale view edge case).
  if (args.isBlocked) {
    return "down";
  }

  if (args.hasOpenProductionEvent) {
    return "running";
  }

  return "idle";
}

/** Physical Meter pulse → shop tile status (when no Carbon blocking episode). */
export function shopStatusFromMeterPhysical(
  physical: "running" | "idle" | "stopped" | "offline" | "unknown" | null
): ShopMachineStatus | null {
  if (physical === "running") return "running";
  if (physical === "idle") return "idle";
  if (physical === "stopped") return "down";
  if (physical === "offline") return "offline";
  return null;
}

/**
 * Merge Carbon derivation + optional Meter pulse + Redis 待开机.
 *
 * Priority:
 * 1. Carbon blocking downtime (fault/planned/blocked) or break
 * 2. Redis 待开机 (unless physically running — then clear overlay)
 * 3. Meter physical status when available
 * 4. Carbon running/idle from production events
 */
export function mergeShopMachineStatus(args: {
  carbonStatus: ShopMachineStatus;
  meterPhysical?: "running" | "idle" | "stopped" | "offline" | "unknown" | null;
  awaitingStart?: boolean;
}): ShopMachineStatus {
  const { carbonStatus, meterPhysical = null, awaitingStart = false } = args;

  if (carbonStatus === "down" || carbonStatus === "break") {
    return carbonStatus;
  }

  const meterSaysRunning = meterPhysical === "running";
  if (awaitingStart && !meterSaysRunning && carbonStatus !== "running") {
    return "awaitingStart";
  }

  const fromMeter = shopStatusFromMeterPhysical(meterPhysical);
  if (fromMeter) return fromMeter;

  return carbonStatus;
}

/**
 * True when the machine is physically running for 待开机 Complete rules.
 * Prefer Meter when available; else open Carbon productionEvent.
 */
export function isShopMachinePhysicallyRunning(args: {
  meterPhysical?: "running" | "idle" | "stopped" | "offline" | "unknown" | null;
  meterAvailable?: boolean;
  hasOpenProductionEvent: boolean;
}): boolean {
  if (args.meterAvailable && args.meterPhysical != null) {
    return args.meterPhysical === "running";
  }
  return args.hasOpenProductionEvent;
}

export function filterShopMachines(
  machines: ShopMachine[],
  filter: ShopStatusFilter
): ShopMachine[] {
  if (filter === "all") return machines;
  return machines.filter((machine) => machine.status === filter);
}

export function countShopStatuses(
  machines: ShopMachine[]
): Record<ShopMachineStatus, number> {
  const counts: Record<ShopMachineStatus, number> = {
    running: 0,
    idle: 0,
    break: 0,
    down: 0,
    awaitingStart: 0,
    offline: 0
  };

  for (const machine of machines) {
    counts[machine.status] += 1;
  }

  return counts;
}

/** Group machines by department; null/empty department → single "Other" bucket last. */
export function groupShopMachinesByArea(
  machines: ShopMachine[]
): { area: string | null; machines: ShopMachine[] }[] {
  const byArea = new Map<string | null, ShopMachine[]>();

  for (const machine of machines) {
    const key = machine.departmentName?.trim() || null;
    const list = byArea.get(key) ?? [];
    list.push(machine);
    byArea.set(key, list);
  }

  const named = [...byArea.entries()]
    .filter(([area]) => area !== null)
    .sort(([a], [b]) => (a ?? "").localeCompare(b ?? ""))
    .map(([area, areaMachines]) => ({
      area,
      machines: areaMachines.sort((x, y) => x.name.localeCompare(y.name))
    }));

  const other = byArea.get(null);
  if (other && other.length > 0) {
    named.push({
      area: null,
      machines: other.sort((x, y) => x.name.localeCompare(y.name))
    });
  }

  return named;
}

export function shopMachineSubtitle(args: {
  description: string | null | undefined;
  processes: string[] | null | undefined;
}): string | null {
  const description = args.description?.trim();
  if (description) return description;
  const firstProcess = args.processes?.[0]?.trim();
  return firstProcess || null;
}

/** Primary open availability/fault dispatch for the detail actions surface. */
export function primaryOpenDispatch(
  dispatches: ShopOpenDispatch[]
): ShopOpenDispatch | null {
  if (dispatches.length === 0) return null;
  const rank = (d: ShopOpenDispatch): number => {
    const kind = resolveShopDispatchKind(d);
    if (kind === "fault" && d.status === "In Progress") return 0;
    if (kind === "fault") return 1;
    if (kind === "planned") return 2;
    if (kind === "break") return 3;
    // Non-blocking issues sit below availability episodes.
    return 4;
  };
  return [...dispatches].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/**
 * Line 3 of the `/shop` machine tile — always one line so tiles stay uniform height.
 *
 * - Down: `负责人 · 停机原因…` or `未分配 · 原因…` (reason omitted when empty)
 * - Awaiting start: assignee if any, else `待开机`
 * - Other statuses: assignee name, or `—` (never append downtime reason clutter)
 */
export function formatShopTilePersonLine(args: {
  status: ShopMachineStatus;
  assigneeName: string | null | undefined;
  downtimeReason: string | null | undefined;
}): { text: string; tone: "assignee" | "unassigned" | "empty" } {
  const assignee = args.assigneeName?.trim() || null;
  const reason =
    args.status === "down" ? args.downtimeReason?.trim() || null : null;

  if (args.status === "down") {
    const person = assignee ?? "未分配";
    return {
      text: reason ? `${person} · ${reason}` : person,
      tone: assignee ? "assignee" : "unassigned"
    };
  }

  if (args.status === "awaitingStart") {
    if (assignee) return { text: assignee, tone: "assignee" };
    return { text: "待开机", tone: "empty" };
  }

  if (assignee) {
    return { text: assignee, tone: "assignee" };
  }
  return { text: "—", tone: "empty" };
}

/**
 * Physical shop-floor layout for the phone PWA overview, transcribed from
 * the floor-plan photo. Fixed 3-column grid; machines are placed by name.
 * A full row of `null` renders as an aisle separator between the two zones.
 */
export const FLOOR_PLAN_ROWS: (string | null)[][] = [
  ["T1", "T4", "T7"],
  ["T2", "T5", "T8"],
  ["T3", "T6", "T9"],
  [null, null, null],
  ["T17", "T16", "T27"],
  ["T18", "T15", "T28"],
  ["T19", "T14", "T29"],
  ["T20", "T13", null],
  ["T21", "T12", null],
  ["T24", "T11", null],
  ["T25", "T10", null],
  ["T26", "T22", null],
  ["T30", "T23", null]
];

export type FloorPlanCell =
  | { kind: "machine"; machine: ShopMachine }
  | { kind: "empty" }
  | { kind: "aisle" };

/**
 * Lay machines out in floor-plan order as a flat cell list for a 3-column
 * grid. Missing or filtered-out machines leave an empty cell so the map
 * keeps its shape; machines not on the plan are appended last, in name
 * order.
 */
export function layoutShopMachinesByFloorPlan(
  machines: ShopMachine[]
): FloorPlanCell[] {
  const byName = new Map(machines.map((m) => [m.name.trim().toUpperCase(), m]));
  const seen = new Set<string>();
  const cells: FloorPlanCell[] = [];

  for (const row of FLOOR_PLAN_ROWS) {
    if (row.every((name) => name === null)) {
      cells.push({ kind: "aisle" });
      continue;
    }
    for (const name of row) {
      if (name === null) {
        cells.push({ kind: "empty" });
        continue;
      }
      const machine = byName.get(name.toUpperCase()) ?? null;
      if (machine) seen.add(machine.id);
      cells.push(machine ? { kind: "machine", machine } : { kind: "empty" });
    }
  }

  const unlisted = machines
    .filter((m) => !seen.has(m.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const machine of unlisted) {
    cells.push({ kind: "machine", machine });
  }

  return cells;
}
