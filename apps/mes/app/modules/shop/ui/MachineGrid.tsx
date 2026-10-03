import { Trans } from "@lingui/react/macro";
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
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        <Trans>No machines match this filter.</Trans>
      </p>
    );
  }

  const cells = layoutShopMachinesByFloorPlan(machines);

  return (
    <div className="px-2 py-2 sm:px-3 sm:py-3">
      <div className="grid grid-cols-3 gap-1.5">
        {cells.map((cell, index) => {
          if (cell.kind === "aisle") {
            return (
              <div
                key={`aisle-${index}`}
                aria-hidden
                className="col-span-3 h-3"
              />
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
