import { cn } from "@carbon/react";
import { Trans } from "@lingui/react/macro";
import type { ShopMachine, ShopMachineStatus } from "../shop.types";
import { primaryOpenDispatch } from "../shop.utils";

/** Soft fill + left accent per status — one color for all downtime (停机). */
const STATUS_SURFACE: Record<ShopMachineStatus, string> = {
  running:
    "border-l-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-50",
  idle: "border-l-muted-foreground/50 bg-muted/60 text-foreground",
  break:
    "border-l-sky-500 bg-sky-50 text-sky-950 dark:bg-sky-950/40 dark:text-sky-50",
  down: "border-l-red-500 bg-red-50 text-red-950 dark:bg-red-950/45 dark:text-red-50"
};

const STATUS_LABEL_TONE: Record<ShopMachineStatus, string> = {
  running: "text-emerald-700 dark:text-emerald-300",
  idle: "text-muted-foreground",
  break: "text-sky-700 dark:text-sky-300",
  down: "text-red-800 dark:text-red-300"
};

function StatusLabel({ status }: { status: ShopMachineStatus }) {
  switch (status) {
    case "running":
      return <Trans>Running</Trans>;
    case "idle":
      return <Trans>Idle</Trans>;
    case "break":
      return <Trans>Break</Trans>;
    case "down":
      return <Trans>Down</Trans>;
  }
}

type MachineTileProps = {
  machine: ShopMachine;
  onSelect: (machine: ShopMachine) => void;
};

export function MachineTile({ machine, onSelect }: MachineTileProps) {
  const jobId =
    machine.currentJobReadableId ?? machine.currentWork?.jobReadableId ?? null;
  const primary = primaryOpenDispatch(machine.openDispatches);
  const assigneeName = primary?.assigneeName?.trim() || null;
  const row3 =
    machine.status === "down" ? (
      assigneeName ? (
        assigneeName
      ) : (
        <Trans>Unassigned</Trans>
      )
    ) : (
      (assigneeName ?? "—")
    );

  return (
    <button
      type="button"
      onClick={() => onSelect(machine)}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded-md border border-border/60 border-l-[3px] px-1.5 py-1.5 text-left",
        "active:scale-[0.98] transition-transform",
        STATUS_SURFACE[machine.status]
      )}
    >
      <div className="flex min-w-0 items-baseline justify-between gap-1">
        <span className="truncate text-xs font-semibold leading-tight">
          {machine.name}
        </span>
        <span
          className={cn(
            "shrink-0 text-[10px] font-medium leading-tight",
            STATUS_LABEL_TONE[machine.status]
          )}
        >
          <StatusLabel status={machine.status} />
        </span>
      </div>

      <div className="truncate text-[10px] leading-tight tabular-nums text-foreground/80">
        {jobId ? jobId : <span className="text-muted-foreground">—</span>}
      </div>

      <div className="truncate text-[10px] leading-tight text-muted-foreground">
        {row3}
      </div>
    </button>
  );
}
