import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetHeader,
  BottomSheetTitle,
  Status
} from "@carbon/react";
import { Trans } from "@lingui/react/macro";
import type { ShopMachine, ShopOpenDispatch } from "../shop.types";

type MachineDetailSheetProps = {
  machine: ShopMachine | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function DispatchStatus({ status }: { status: string | null }) {
  if (status === "In Progress") {
    return (
      <Status color="red" disableTooltip>
        <Trans>In repair</Trans>
      </Status>
    );
  }
  if (status === "Assigned" || status === "Open") {
    return (
      <Status color="orange" disableTooltip>
        <Trans>Waiting repair</Trans>
      </Status>
    );
  }
  return (
    <Status color="gray" disableTooltip>
      {status ?? <Trans>Unknown</Trans>}
    </Status>
  );
}

function DispatchRow({ dispatch }: { dispatch: ShopOpenDispatch }) {
  return (
    <li className="rounded-lg border border-border px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium tabular-nums">
            {dispatch.maintenanceDispatchId ?? dispatch.id}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {dispatch.assigneeName ? (
              <Trans>Assigned to {dispatch.assigneeName}</Trans>
            ) : (
              <Trans>Unassigned</Trans>
            )}
          </div>
        </div>
        <DispatchStatus status={dispatch.status} />
      </div>
      {dispatch.oeeImpact === "Down" || dispatch.oeeImpact === "Planned" ? (
        <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
          <Trans>Takes work center offline</Trans>
        </p>
      ) : null}
    </li>
  );
}

export function MachineDetailSheet({
  machine,
  open,
  onOpenChange
}: MachineDetailSheetProps) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="mx-auto max-h-[85dvh] max-w-lg overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <BottomSheetHeader>
          <BottomSheetTitle className="text-base font-semibold text-foreground">
            {machine?.name ?? ""}
          </BottomSheetTitle>
          {machine?.subtitle ? (
            <BottomSheetDescription>{machine.subtitle}</BottomSheetDescription>
          ) : (
            <BottomSheetDescription>
              <Trans>Work center details</Trans>
            </BottomSheetDescription>
          )}
        </BottomSheetHeader>
        <BottomSheetBody>
          {machine ? (
            <div className="flex flex-col gap-5">
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Trans>Current work order</Trans>
                </h3>
                <p className="mt-2 text-base font-medium tabular-nums">
                  {machine.currentJobReadableId ?? (
                    <span className="font-normal text-muted-foreground">
                      <Trans>No open job</Trans>
                    </span>
                  )}
                </p>
              </section>

              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Trans>Open maintenance</Trans>
                </h3>
                {machine.openDispatches.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    <Trans>No open maintenance dispatches.</Trans>
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {machine.openDispatches.map((dispatch) => (
                      <DispatchRow key={dispatch.id} dispatch={dispatch} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheet>
  );
}
