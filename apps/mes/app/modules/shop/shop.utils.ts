import type {
  ShopDispatchKind,
  ShopMachine,
  ShopMachineStatus,
  ShopOpenDispatch,
  ShopStatusFilter
} from "./shop.types";

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
