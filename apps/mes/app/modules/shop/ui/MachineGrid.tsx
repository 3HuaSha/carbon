// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import type { ShopMachine } from "../shop.types";
import { layoutShopMachinesByFloorPlan } from "../shop.utils";
import { MachineTile } from "./MachineTile";

type MachineGridProps = {
  machines: ShopMachine[];
  onSelect: (machine: ShopMachine) => void;
};

/**
 * Phone PWA machine overview laid out as the physical shop floor:
 * fixed 3-column grid in floor-plan order (see FLOOR_PLAN_ROWS in
 * shop.utils.ts), with an aisle separator between the two zones.
 * Filtered-out machines leave empty cells so the map keeps its shape.
 */
export function MachineGrid({ machines, onSelect }: MachineGridProps) {
  if (machines.length === 0) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-sm font-medium text-foreground">
          没有符合筛选条件的机台
        </p>
        <p className="mt-1 text-xs text-muted-foreground">换个状态筛选试试</p>
      </div>
    );
  }

  const cells = layoutShopMachinesByFloorPlan(machines);

  return (
    <div className="px-2.5 py-2.5 sm:px-3 sm:py-3">
      <div className="grid grid-cols-3 gap-2">
        {cells.map((cell, index) => {
          if (cell.kind === "aisle") {
            return (
              <div
                key={`aisle-${index}`}
                aria-hidden
                className="col-span-3 flex items-center gap-2 py-1"
              >
                <div className="h-px flex-1 bg-border/60" />
                <span className="text-[10px] font-medium tracking-widest text-muted-foreground/60">
                  走廊
                </span>
                <div className="h-px flex-1 bg-border/60" />
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
