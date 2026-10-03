import type {
  ShopMachine,
  ShopMachineStatus,
  ShopOpenDispatch,
  ShopStatusFilter
} from "./shop.types";

/**
 * Derive the phone-overview status from existing MES signals.
 *
 * Priority: In Progress / blocked → in repair; Open/Assigned → waiting repair;
 * open production event → running; else idle. Waiting PE is skipped for v1.
 */
export function deriveShopMachineStatus(args: {
  hasOpenProductionEvent: boolean;
  openDispatches: Pick<ShopOpenDispatch, "status">[];
  isBlocked: boolean;
}): ShopMachineStatus {
  const statuses = args.openDispatches.map((d) => d.status);

  if (args.isBlocked || statuses.some((s) => s === "In Progress")) {
    return "inRepair";
  }

  if (statuses.some((s) => s === "Open" || s === "Assigned")) {
    return "waitingRepair";
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
