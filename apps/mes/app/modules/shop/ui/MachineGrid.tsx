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
    <div className="flex flex-col gap-4 px-2 py-2 sm:px-3 sm:py-3">
      {groups.map((group) => (
        <section key={group.area ?? "__other"} className="space-y-1.5">
          {showAreaHeaders ? (
            <h2 className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.area ?? <Trans>Other</Trans>}
            </h2>
          ) : null}
          <div className="grid grid-cols-3 gap-1.5 min-[400px]:grid-cols-4 sm:grid-cols-4 md:grid-cols-5">
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
