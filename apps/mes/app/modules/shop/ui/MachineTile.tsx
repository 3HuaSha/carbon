import { cn, Status } from "@carbon/react";
import { Trans } from "@lingui/react/macro";
import type { ShopMachine, ShopMachineStatus } from "../shop.types";

const STATUS_COLOR: Record<
  ShopMachineStatus,
  "green" | "gray" | "orange" | "red"
> = {
  running: "green",
  idle: "gray",
  waitingRepair: "orange",
  inRepair: "red"
};

function StatusLabel({ status }: { status: ShopMachineStatus }) {
  switch (status) {
    case "running":
      return <Trans>Running</Trans>;
    case "idle":
      return <Trans>Idle</Trans>;
    case "waitingRepair":
      return <Trans>Waiting repair</Trans>;
    case "inRepair":
      return <Trans>In repair</Trans>;
  }
}

type MachineTileProps = {
  machine: ShopMachine;
  onSelect: (machine: ShopMachine) => void;
};

export function MachineTile({ machine, onSelect }: MachineTileProps) {
  const accent =
    machine.status === "running"
      ? "border-l-emerald-500"
      : machine.status === "waitingRepair"
        ? "border-l-orange-500"
        : machine.status === "inRepair"
          ? "border-l-red-500"
          : "border-l-muted-foreground/40";

  return (
    <button
      type="button"
      onClick={() => onSelect(machine)}
      className={cn(
        "flex w-full flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left shadow-sm",
        "border-l-4 active:scale-[0.98] transition-transform",
        accent
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{machine.name}</div>
        {machine.subtitle ? (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {machine.subtitle}
          </div>
        ) : null}
      </div>

      <Status color={STATUS_COLOR[machine.status]} disableTooltip>
        <StatusLabel status={machine.status} />
      </Status>

      <div className="truncate text-xs tabular-nums text-muted-foreground">
        {machine.currentJobReadableId ? (
          <span>{machine.currentJobReadableId}</span>
        ) : (
          <Trans>No open job</Trans>
        )}
      </div>
    </button>
  );
}
