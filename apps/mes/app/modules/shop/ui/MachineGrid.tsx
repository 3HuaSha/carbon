import { Trans } from "@lingui/react/macro";
import type { ShopMachine } from "../shop.types";
import { groupShopMachinesByArea } from "../shop.utils";
import { MachineTile } from "./MachineTile";

type MachineGridProps = {
  machines: ShopMachine[];
  onSelect: (machine: ShopMachine) => void;
};

export function MachineGrid({ machines, onSelect }: MachineGridProps) {
  if (machines.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        <Trans>No machines match this filter.</Trans>
      </p>
    );
  }

  const groups = groupShopMachinesByArea(machines);
  const showAreaHeaders =
    groups.length > 1 || (groups.length === 1 && groups[0].area !== null);

  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      {groups.map((group) => (
        <section key={group.area ?? "__other"} className="space-y-3">
          {showAreaHeaders ? (
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.area ?? <Trans>Other</Trans>}
            </h2>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {group.machines.map((machine) => (
              <MachineTile
                key={machine.id}
                machine={machine}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
