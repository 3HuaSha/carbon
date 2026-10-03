import type {
  ShopCrewKind,
  ShopDispatchKind,
  ShopMachine,
  ShopMachineStatus,
  ShopOpenDispatch,
  ShopStatusFilter
} from "./shop.types";

/**
 * Configurable `employeeType.name` aliases for the repair / mold crew boards.
 * Match is case-insensitive; the type name matches if it equals an alias or
 * contains one (so "机修班" matches "机修"). Bowen sets these names in ERP
 * Users → Employee types, then assigns people to that type.
 */
export const SHOP_CREW_TYPE_ALIASES: Record<ShopCrewKind, readonly string[]> = {
  repair: ["维修", "机修", "repair", "maintenance", "machine repair"],
  mold: ["模房", "模具", "mold", "mould", "mold shop", "mould shop"]
};

function normalizeTypeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True when an `employeeType.name` belongs on the given crew board. */
export function matchesShopCrewEmployeeType(
  employeeTypeName: string | null | undefined,
  crew: ShopCrewKind
): boolean {
  if (!employeeTypeName?.trim()) return false;
  const normalized = normalizeTypeName(employeeTypeName);
  return SHOP_CREW_TYPE_ALIASES[crew].some((alias) => {
    const needle = normalizeTypeName(alias);
    return normalized === needle || normalized.includes(needle);
  });
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
    args.shopKind === "fault"
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
    rawKind === "break" || rawKind === "planned" || rawKind === "fault"
      ? rawKind
      : null;
  return { shopKind, note };
}

/**
 * Derive the phone-overview status from existing MES signals.
 *
 * Priority (highest first):
 * inRepair → waitingRepair → planned → break → running → idle
 */
export function deriveShopMachineStatus(args: {
  hasOpenProductionEvent: boolean;
  openDispatches: DispatchSignals[];
  isBlocked: boolean;
}): ShopMachineStatus {
  const dispatches = args.openDispatches;

  const isFault = (d: DispatchSignals) =>
    resolveShopDispatchKind(d) === "fault";
  const isPlanned = (d: DispatchSignals) =>
    resolveShopDispatchKind(d) === "planned";
  const isBreak = (d: DispatchSignals) =>
    resolveShopDispatchKind(d) === "break";

  // Fault actively worked — wins over planned/break.
  if (dispatches.some((d) => isFault(d) && d.status === "In Progress")) {
    return "inRepair";
  }

  // Fault waiting (Open / Assigned), including mold-shop / 模房 tickets.
  if (
    dispatches.some(
      (d) => isFault(d) && (d.status === "Open" || d.status === "Assigned")
    )
  ) {
    return "waitingRepair";
  }

  if (dispatches.some((d) => isPlanned(d))) {
    return "planned";
  }

  if (dispatches.some((d) => isBreak(d))) {
    return "break";
  }

  // Blocked with no classifiable open episode (stale view edge case).
  if (args.isBlocked) {
    return "inRepair";
  }

  if (args.hasOpenProductionEvent) {
    return "running";
  }

  return "idle";
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
    planned: 0,
    waitingRepair: 0,
    inRepair: 0
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
    return 3;
  };
  return [...dispatches].sort((a, b) => rank(a) - rank(b))[0] ?? null;
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
