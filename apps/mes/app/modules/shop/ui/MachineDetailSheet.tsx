import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetHeader,
  BottomSheetTitle,
  Button,
  cn,
  Status
} from "@carbon/react";
import { Trans } from "@lingui/react/macro";
import { type FetcherWithComponents, Link } from "react-router";
import { path } from "~/utils/path";
import type {
  ShopCurrentWork,
  ShopMachine,
  ShopMaintenanceAction,
  ShopOpenDispatch
} from "../shop.types";

type MachineDetailSheetProps = {
  machine: ShopMachine | null;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetcher: FetcherWithComponents<{ ok: boolean; action?: string }>;
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

function QcStatus({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="text-muted-foreground">
        <Trans>No inspection</Trans>
      </span>
    );
  }
  if (status === "Passed") {
    return (
      <Status color="green" disableTooltip>
        {status}
      </Status>
    );
  }
  if (status === "Failed") {
    return (
      <Status color="red" disableTooltip>
        {status}
      </Status>
    );
  }
  if (status === "In Progress" || status === "Partial") {
    return (
      <Status color="orange" disableTooltip>
        {status}
      </Status>
    );
  }
  return (
    <Status color="gray" disableTooltip>
      {status}
    </Status>
  );
}

function WorkOrderSection({ work }: { work: ShopCurrentWork | null }) {
  const jobLabel = work?.jobReadableId;
  const operationHref = work?.jobOperationId
    ? path.to.operation(work.jobOperationId)
    : null;
  const inspectionHref = work?.jobOperationId
    ? path.to.inspection(work.jobOperationId)
    : null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Trans>Current work order</Trans>
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {jobLabel ? (
            operationHref ? (
              <Link
                to={operationHref}
                className="text-base font-medium tabular-nums text-foreground underline-offset-4 hover:underline"
              >
                {jobLabel}
              </Link>
            ) : (
              <p className="text-base font-medium tabular-nums">{jobLabel}</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              <Trans>No open job</Trans>
            </p>
          )}
          {work?.operationStatus ? (
            <Status color="gray" disableTooltip>
              {work.operationStatus}
            </Status>
          ) : null}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Trans>QC / Inspection</Trans>
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <QcStatus status={work?.inspectionStatus ?? null} />
          {inspectionHref && work?.inspectionId ? (
            <Link
              to={inspectionHref}
              className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
            >
              <Trans>Open inspection</Trans>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function DispatchRow({
  dispatch,
  userId,
  busy,
  onAction
}: {
  dispatch: ShopOpenDispatch;
  userId: string;
  busy: boolean;
  onAction: (action: ShopMaintenanceAction, dispatch: ShopOpenDispatch) => void;
}) {
  const assignedToMe = dispatch.assignee === userId;
  const canAssign = !dispatch.assignee || !assignedToMe;
  const showAssign =
    canAssign &&
    (dispatch.status === "Open" || dispatch.status === "Assigned") &&
    !dispatch.isWorking;
  const showStart =
    !dispatch.isWorking &&
    dispatch.status !== "Completed" &&
    dispatch.status !== "Cancelled";
  const showEnd = dispatch.isWorking;
  const showComplete = dispatch.status === "In Progress" || dispatch.isWorking;

  return (
    <li className="rounded-lg border border-border px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={path.to.maintenanceDetail(dispatch.id)}
            className="truncate text-sm font-medium tabular-nums text-foreground underline-offset-4 hover:underline"
          >
            {dispatch.maintenanceDispatchId ?? dispatch.id}
          </Link>
          <div className="mt-1 text-xs text-muted-foreground">
            {dispatch.assigneeName ? (
              assignedToMe ? (
                <Trans>Assigned to you</Trans>
              ) : (
                <Trans>Assigned to {dispatch.assigneeName}</Trans>
              )
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

      <div className={cn("mt-3 flex flex-wrap gap-2")}>
        {showAssign ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            isDisabled={busy}
            onClick={() => onAction("Assign", dispatch)}
          >
            <Trans>Assign to me</Trans>
          </Button>
        ) : null}
        {showStart ? (
          <Button
            type="button"
            size="sm"
            variant="primary"
            isDisabled={busy}
            onClick={() => onAction("Start", dispatch)}
          >
            <Trans>Start</Trans>
          </Button>
        ) : null}
        {showEnd ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            isDisabled={busy}
            onClick={() => onAction("End", dispatch)}
          >
            <Trans>Pause</Trans>
          </Button>
        ) : null}
        {showComplete ? (
          <Button
            type="button"
            size="sm"
            variant="primary"
            isDisabled={busy}
            onClick={() => onAction("Complete", dispatch)}
          >
            <Trans>Complete</Trans>
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function MachineDetailSheet({
  machine,
  userId,
  open,
  onOpenChange,
  fetcher
}: MachineDetailSheetProps) {
  const busy = fetcher.state !== "idle";

  const onAction = (
    action: ShopMaintenanceAction,
    dispatch: ShopOpenDispatch
  ) => {
    const body = new FormData();
    body.set("action", action);
    body.set("dispatchId", dispatch.id);
    if (dispatch.workCenterId) {
      body.set("workCenterId", dispatch.workCenterId);
    }
    fetcher.submit(body, { method: "post" });
  };

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
              <WorkOrderSection work={machine.currentWork} />

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
                      <DispatchRow
                        key={dispatch.id}
                        dispatch={dispatch}
                        userId={userId}
                        busy={busy}
                        onAction={onAction}
                      />
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
