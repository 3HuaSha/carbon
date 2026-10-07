// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import type { ShopMachine } from "../shop.types";
import { layoutShopMachinesByFloorPlan } from "../shop.utils";
import { MachineTile } from "./MachineTile";
import { shopIos } from "./shopIos";

type MachineGridProps = {
  machines: ShopMachine[];
  onSelect: (machine: ShopMachine) => void;
  preserveFloorPlan?: boolean;
};

/**
 * Phone PWA machine overview as physical shop floor (3-col floor plan).
 * Opaque system-gray canvas — no blur, no continuous tile animations.
 */
export function MachineGrid({
  machines,
  onSelect,
  preserveFloorPlan = true
}: MachineGridProps) {
  if (machines.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-20 text-center">
        <p className="text-[17px] font-semibold">没有符合筛选条件的机台</p>
        <p className={`mt-1 text-[14px] ${shopIos.muted}`}>换个机台分类试试</p>
      </div>
    );
  }

  const cells = preserveFloorPlan
    ? layoutShopMachinesByFloorPlan(machines)
    : [...machines]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map((machine) => ({ kind: "machine" as const, machine }));

  return (
    <div className="px-3 py-3">
      <div className="grid grid-cols-3 gap-2">
        {cells.map((cell, index) => {
          if (cell.kind === "aisle") {
            return (
              <div
                key={`aisle-${index}`}
                aria-hidden
                className="col-span-3 flex items-center gap-3 py-1.5"
              >
                <div className="h-px flex-1 bg-[color:var(--shop-hairline)]" />
                <span
                  className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${shopIos.muted}`}
                >
                  走廊
                </span>
                <div className="h-px flex-1 bg-[color:var(--shop-hairline)]" />
              </div>
            );
          }
          if (cell.kind === "empty") {
            return <div key={`empty-${index}`} aria-hidden />;
          }
          return (
            <MachineTile
              key={cell.machine.id}
              machine={cell.machine}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}
