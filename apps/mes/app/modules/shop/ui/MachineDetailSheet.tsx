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
  ShopOpenDispatch,
  ShopPerson
} from "../shop.types";
import { GroupedAssignPicker } from "./GroupedAssignPicker";

type MachineDetailSheetProps = {
  machine: ShopMachine | null;
  userId: string;
  people: ShopPerson[];
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
  people,
  busy,
  onAssignPerson,
  onAction
}: {
  dispatch: ShopOpenDispatch;
  userId: string;
  people: ShopPerson[];
  busy: boolean;
  onAssignPerson: (dispatch: ShopOpenDispatch, person: ShopPerson) => void;
  onAction: (action: ShopMaintenanceAction, dispatch: ShopOpenDispatch) => void;
}) {
  const assignedToMe = dispatch.assignee === userId;
  const canAssignPerson =
    (dispatch.shopKind === "fault" || dispatch.shopKind === "planned") &&
    (dispatch.status === "Open" || dispatch.status === "Assigned") &&
    !dispatch.isWorking;
  const showAssignToMe =
    canAssignPerson && (!dispatch.assignee || !assignedToMe);
  const showEnd = dispatch.isWorking;
  // No Start/accept — Complete on any open fault/planned ticket.
  const showComplete =
    dispatch.status !== "Completed" && dispatch.status !== "Cancelled";
  const problemText = dispatch.note?.trim() || null;

  return (
    <li className="rounded-lg border border-border px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {problemText ? (
            <p className="text-sm font-semibold text-pretty">{problemText}</p>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
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
        {showAssignToMe ? (
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

      {canAssignPerson ? (
        <div className="mt-3">
          <GroupedAssignPicker
            people={people}
            busy={busy}
            requireConfirm
            confirmLabel="确认指派"
            onPick={(person) => onAssignPerson(dispatch, person)}
          />
        </div>
      ) : null}
    </li>
  );
}

export function MachineDetailSheet({
  machine,
  userId,
  people,
  open,
  onOpenChange,
  fetcher
}: MachineDetailSheetProps) {
  const busy = fetcher.state !== "idle";

  const onAction = (
    action: ShopMaintenanceAction,
    dispatch: ShopOpenDispatch,
    assigneeId?: string
  ) => {
    const body = new FormData();
    body.set("action", action);
    body.set("dispatchId", dispatch.id);
    if (dispatch.workCenterId) {
      body.set("workCenterId", dispatch.workCenterId);
    }
    if (assigneeId) {
      body.set("assigneeId", assigneeId);
    }
    fetcher.submit(body, { method: "post" });
  };

  const onReportDowntime = (assigneeId?: string) => {
    if (!machine) return;
    const body = new FormData();
    body.set("action", "ReportDowntime");
    body.set("workCenterId", machine.id);
    if (assigneeId) {
      body.set("assigneeId", assigneeId);
    }
    fetcher.submit(body, { method: "post" });
  };

  const hasOpenMaintenance = (machine?.openDispatches.length ?? 0) > 0;
  const showReportDowntime =
    machine != null &&
    (machine.status === "running" ||
      machine.status === "idle" ||
      !hasOpenMaintenance);

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

              {showReportDowntime ? (
                <section>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Trans>Machine status</Trans>
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <Trans>
                      Report downtime to put this machine into waiting repair.
                    </Trans>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="md"
                      variant="destructive"
                      isDisabled={busy}
                      onClick={() => onReportDowntime()}
                    >
                      <Trans>Down</Trans>
                    </Button>
                  </div>
                </section>
              ) : null}

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
                        people={people}
                        busy={busy}
                        onAssignPerson={(d, person) =>
                          onAction("Assign", d, person.id)
                        }
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
