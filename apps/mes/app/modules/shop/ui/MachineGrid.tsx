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
 * iOS 风格机台总览：系统灰背景上的物理车间布局
 * fixed 3-column grid in floor-plan order (see FLOOR_PLAN_ROWS in
 * shop.utils.ts), with an aisle separator between the two zones.
 * Filtered-out machines leave empty cells so the map keeps its shape.
 */
export function MachineGrid({ machines, onSelect }: MachineGridProps) {
  if (machines.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-20 text-center">
        <p className="text-[17px] font-semibold text-black dark:text-white">
          没有符合筛选条件的机台
        </p>
        <p className="mt-1 text-[14px] text-[#8E8E93]">
          换个状态筛选试试
        </p>
      </div>
    );
  }

  const cells = layoutShopMachinesByFloorPlan(machines);

  return (
    <div className="bg-[#F2F2F7] px-3 py-3 dark:bg-black">
      <div className="grid grid-cols-3 gap-2">
        {cells.map((cell, index) => {
          if (cell.kind === "aisle") {
            return (
              <div
                key={`aisle-${index}`}
                aria-hidden
                className="col-span-3 flex items-center gap-3 py-1.5"
              >
                <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8E8E93]">
                  走廊
                </span>
                <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
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
