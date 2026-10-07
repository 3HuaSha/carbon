// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

export const shopMachineTypeOptions = [
  { id: "all", label: "全部" },
  { id: "T", label: "T" },
  { id: "C", label: "C" },
  { id: "CM_FM", label: "CM/FM" },
  { id: "SH", label: "SH" }
] as const;

export type ShopMachineTypeFilter =
  (typeof shopMachineTypeOptions)[number]["id"];

type NamedMachine = { name: string };

/** Check the longer CM prefix before C so the groups never overlap. */
export function getShopMachineType(
  name: string
): Exclude<ShopMachineTypeFilter, "all"> | null {
  const normalized = name.trim().toUpperCase();
  if (normalized.startsWith("CM") || normalized.startsWith("FM")) return "CM_FM";
  if (normalized.startsWith("SH")) return "SH";
  if (normalized.startsWith("T")) return "T";
  if (normalized.startsWith("C")) return "C";
  return null;
}

export function filterShopMachinesByType<T extends NamedMachine>(
  machines: T[],
  filter: ShopMachineTypeFilter
): T[] {
  if (filter === "all") return machines;
  return machines.filter((machine) => getShopMachineType(machine.name) === filter);
}

export function countShopMachineTypes(
  machines: NamedMachine[]
): Record<ShopMachineTypeFilter, number> {
  const counts = { all: machines.length, T: 0, C: 0, CM_FM: 0, SH: 0 };
  for (const machine of machines) {
    const type = getShopMachineType(machine.name);
    if (type) counts[type] += 1;
  }
  return counts;
}
