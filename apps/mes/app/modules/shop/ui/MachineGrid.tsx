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
 * Awwwards-caliber Shop Floor Plan Grid.
 * Features:
 * - 3-column cybernetic machine matrix
 * - High-precision laser corridor dividers
 * - Responsive kinetic grid layouts
 */
export function MachineGrid({
  machines,
  onSelect,
  preserveFloorPlan = true
}: MachineGridProps) {
  if (machines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/80 font-mono text-cyan-400 shadow-[0_0_24px_rgba(6,182,212,0.2)]">
          // 00
        </div>
        <p className="font-mono text-[16px] font-bold text-white tracking-wide">
          NO MATCHING STATIONS
        </p>
        <p className={`mt-1 font-mono text-[12px] tracking-wider ${shopIos.muted}`}>
          没有符合当前筛选的机台，请切换分类
        </p>
      </div>
    );
  }

  const cells = preserveFloorPlan
    ? layoutShopMachinesByFloorPlan(machines)
    : [...machines]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map((machine) => ({ kind: "machine" as const, machine }));

  let aisleIndex = 0;

  return (
    <div className="relative px-3 py-3">
      <div className="grid grid-cols-3 gap-2.5">
        {cells.map((cell, index) => {
          if (cell.kind === "aisle") {
            aisleIndex++;
            return (
              <div
                key={`aisle-${index}`}
                aria-hidden
                className="col-span-3 my-2 flex items-center gap-3 py-1 font-mono select-none"
              >
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-cyan-500/30 to-cyan-500/50" />
                <div className="flex items-center gap-2 rounded-full border border-cyan-500/20 bg-slate-950/80 px-3 py-0.5 shadow-[0_0_12px_rgba(6,182,212,0.1)] backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                  <span className="text-[10px] font-bold tracking-[0.25em] text-cyan-400 uppercase">
                    SECTOR // 通道 {aisleIndex.toString().padStart(2, "0")}
                  </span>
                </div>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent via-cyan-500/30 to-cyan-500/50" />
              </div>
            );
          }
          if (cell.kind === "empty") {
            return (
              <div
                key={`empty-${index}`}
                aria-hidden
                className="rounded-2xl border border-dashed border-white/5 bg-slate-950/20"
              />
            );
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
