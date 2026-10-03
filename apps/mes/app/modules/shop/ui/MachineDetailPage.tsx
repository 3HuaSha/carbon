import { useCarbon } from "@carbon/auth";
import {
  getCompanyPrivateBucket,
  safeStorageFileName,
  storage
} from "@carbon/files";
import { isHeic, MediaUploader } from "@carbon/files/media";
import { Button, cn, Status, toast } from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useState } from "react";
import { LuChevronLeft, LuSearch, LuX } from "react-icons/lu";
import {
  type FetcherWithComponents,
  Link,
  useNavigate,
  useRevalidator
} from "react-router";
import Avatar from "~/components/Avatar";
import { path } from "~/utils/path";
import type {
  ShopCurrentWork,
  ShopDispatchComment,
  ShopDispatchFile,
  ShopDispatchHistoryItem,
  ShopMachine,
  ShopMaintenanceAction,
  ShopOpenDispatch,
  ShopPerson
} from "../shop.types";
import { primaryOpenDispatch } from "../shop.utils";
import { ShopDispatchMedia } from "./ShopDispatchMedia";

type MachineDetailPageProps = {
  machine: ShopMachine;
  /** From the shop detail loader — `/shop` has no `/x` user route data. */
  companyId: string;
  userId: string;
  people: ShopPerson[];
  commentsByDispatchId: Record<string, ShopDispatchComment[]>;
  filesByDispatchId: Record<string, ShopDispatchFile[]>;
  history: ShopDispatchHistoryItem[];
  fetcher: FetcherWithComponents<{
    ok: boolean;
    action?: string;
    dispatchId?: string;
  }>;
};

type ReportKind = "break" | "planned" | "fault";

function MachineStatusChip({ status }: { status: ShopMachine["status"] }) {
  switch (status) {
    case "running":
      return (
        <Status color="green" disableTooltip>
          <Trans>Running</Trans>
        </Status>
      );
    case "idle":
      return (
        <Status color="gray" disableTooltip>
          <Trans>Idle</Trans>
        </Status>
      );
    case "break":
      return (
        <Status color="blue" disableTooltip>
          <Trans>Break / Away</Trans>
        </Status>
      );
    case "planned":
      return (
        <Status color="yellow" disableTooltip>
          <Trans>Planned downtime</Trans>
        </Status>
      );
    case "waitingRepair":
      return (
        <Status color="orange" disableTooltip>
          <Trans>Waiting repair</Trans>
        </Status>
      );
    case "inRepair":
      return (
        <Status color="red" disableTooltip>
          <Trans>In repair</Trans>
        </Status>
      );
  }
}

function QcStatus({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="text-muted-foreground">
        <Trans>No inspection</Trans>
      </span>
    );
  }
  const color =
    status === "Passed"
      ? "green"
      : status === "Failed"
        ? "red"
        : status === "In Progress" || status === "Partial"
          ? "orange"
          : "gray";
  return (
    <Status color={color} disableTooltip>
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
    <section className="flex flex-col gap-3 px-4">
      <div>
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Trans>Current production</Trans>
        </h2>
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

function PersonPicker({
  people,
  busy,
  onPick,
  onCancel
}: {
  people: ShopPerson[];
  busy: boolean;
  onPick: (person: ShopPerson) => void;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.name.toLowerCase().includes(q));
  }, [people, search]);

  return (
    <div className="mt-3 rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <LuSearch className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t`Search people…`}
          className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autoFocus
        />
        <button
          type="button"
          aria-label={t`Cancel`}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onCancel}
        >
          <LuX className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-56 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-3 py-4 text-sm text-muted-foreground">
            <Trans>No people found</Trans>
          </li>
        ) : (
          filtered.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(person)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 disabled:opacity-50"
              >
                <Avatar name={person.name} path={person.avatarUrl} size="sm" />
                <span className="truncate text-sm font-medium">
                  {person.name}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function ReportForm({
  kind,
  busy,
  people,
  onCancel,
  onSubmit
}: {
  kind: ReportKind;
  busy: boolean;
  people: ShopPerson[];
  onCancel: () => void;
  onSubmit: (args: {
    note: string;
    assigneeId?: string;
    files: File[];
  }) => void;
}) {
  const { t } = useLingui();
  const [note, setNote] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [picking, setPicking] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const noteRequired = kind === "fault";
  const mediaRecommended = kind === "fault" || kind === "planned";

  const title =
    kind === "break"
      ? t`Break / Away`
      : kind === "planned"
        ? t`Planned downtime`
        : t`Fault downtime`;

  const hint =
    kind === "break"
      ? t`Optional short note (lunch, bathroom, away).`
      : kind === "planned"
        ? t`Notes and photos recommended (changeover / PM window).`
        : t`Describe the fault. Notes required; photos/videos recommended.`;

  return (
    <section className="mx-4 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
        <button
          type="button"
          aria-label={t`Cancel`}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          onClick={onCancel}
        >
          <LuX className="h-4 w-4" />
        </button>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={kind === "break" ? 2 : 4}
        placeholder={
          noteRequired ? t`What happened? (required)` : t`Optional note`
        }
        className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />

      {mediaRecommended ? (
        <div className="mt-3">
          <input
            type="file"
            accept="image/*,video/*"
            capture="environment"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
          />
          {files.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              <Trans>{files.length} file(s) selected</Trans>
            </p>
          ) : null}
        </div>
      ) : null}

      {kind !== "break" ? (
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant={picking ? "primary" : "secondary"}
            isDisabled={busy}
            onClick={() => setPicking((v) => !v)}
          >
            {assigneeId ? (
              <Trans>Change assignee</Trans>
            ) : (
              <Trans>Assign person (optional)</Trans>
            )}
          </Button>
          {assigneeId ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {people.find((p) => p.id === assigneeId)?.name}
            </p>
          ) : null}
          {picking ? (
            <PersonPicker
              people={people}
              busy={busy}
              onPick={(person) => {
                setAssigneeId(person.id);
                setPicking(false);
              }}
              onCancel={() => setPicking(false)}
            />
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="md"
          variant={kind === "fault" ? "destructive" : "primary"}
          isDisabled={busy || (noteRequired && !note.trim())}
          onClick={() =>
            onSubmit({
              note: note.trim(),
              assigneeId,
              files
            })
          }
        >
          <Trans>Confirm</Trans>
        </Button>
        <Button
          type="button"
          size="md"
          variant="ghost"
          isDisabled={busy}
          onClick={onCancel}
        >
          <Trans>Cancel</Trans>
        </Button>
      </div>
    </section>
  );
}

function DispatchActions({
  companyId,
  dispatch,
  userId,
  people,
  busy,
  comments,
  files,
  onAction,
  onUploaded
}: {
  companyId: string;
  dispatch: ShopOpenDispatch;
  userId: string;
  people: ShopPerson[];
  busy: boolean;
  comments: ShopDispatchComment[];
  files: ShopDispatchFile[];
  onAction: (
    action: ShopMaintenanceAction,
    dispatch: ShopOpenDispatch,
    assigneeId?: string
  ) => void;
  onUploaded: () => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const assignedToMe = dispatch.assignee === userId;
  const isBreakOrPlanned =
    dispatch.shopKind === "break" || dispatch.shopKind === "planned";
  const canAssignPerson =
    (dispatch.shopKind === "fault" || dispatch.shopKind === "planned") &&
    (dispatch.status === "Open" || dispatch.status === "Assigned") &&
    !dispatch.isWorking;
  const showAssignToMe =
    canAssignPerson && (!dispatch.assignee || !assignedToMe);
  const showStart =
    dispatch.shopKind === "fault" &&
    !dispatch.isWorking &&
    dispatch.status !== "Completed" &&
    dispatch.status !== "Cancelled";
  const showEnd = dispatch.shopKind === "fault" && dispatch.isWorking;
  const showComplete =
    dispatch.shopKind === "fault" &&
    (dispatch.status === "In Progress" || dispatch.isWorking);
  const showResume = isBreakOrPlanned;

  const kindLabel =
    dispatch.shopKind === "break"
      ? "Break / Away"
      : dispatch.shopKind === "planned"
        ? "Planned downtime"
        : "Fault / repair";

  return (
    <section className="mx-4 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {kindLabel}
          </p>
          <p className="mt-1 truncate text-sm font-medium tabular-nums">
            {dispatch.maintenanceDispatchId ?? dispatch.id}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {dispatch.assigneeName ? (
              assignedToMe ? (
                <Trans>Assigned to you</Trans>
              ) : (
                <Trans>Assigned to {dispatch.assigneeName}</Trans>
              )
            ) : (
              <Trans>Unassigned</Trans>
            )}
          </p>
        </div>
        <MachineStatusChip
          status={
            dispatch.shopKind === "break"
              ? "break"
              : dispatch.shopKind === "planned"
                ? "planned"
                : dispatch.status === "In Progress"
                  ? "inRepair"
                  : "waitingRepair"
          }
        />
      </div>

      {dispatch.note ? (
        <p className="mt-3 whitespace-pre-wrap text-sm">{dispatch.note}</p>
      ) : null}

      {comments.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <span className="font-medium">
                {c.createdByName ?? <Trans>Unknown</Trans>}
              </span>
              <span className="text-muted-foreground">: </span>
              <span className="whitespace-pre-wrap">{c.comment}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3">
        <ShopDispatchMedia
          companyId={companyId}
          dispatchId={dispatch.id}
          files={files}
          readOnly={dispatch.shopKind === "break"}
          onUploaded={onUploaded}
        />
      </div>

      <div className={cn("mt-3 flex flex-wrap gap-2")}>
        {showResume ? (
          <Button
            type="button"
            size="md"
            variant="primary"
            isDisabled={busy}
            onClick={() => onAction("ResumeAvailability", dispatch)}
          >
            {dispatch.shopKind === "break" ? (
              <Trans>I'm back</Trans>
            ) : (
              <Trans>Resume / Complete</Trans>
            )}
          </Button>
        ) : null}
        {canAssignPerson ? (
          <Button
            type="button"
            size="sm"
            variant={assigning ? "primary" : "secondary"}
            isDisabled={busy}
            onClick={() => setAssigning((v) => !v)}
          >
            <Trans>Assign person</Trans>
          </Button>
        ) : null}
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

      {assigning ? (
        <PersonPicker
          people={people}
          busy={busy}
          onPick={(person) => {
            onAction("Assign", dispatch, person.id);
            setAssigning(false);
          }}
          onCancel={() => setAssigning(false)}
        />
      ) : null}
    </section>
  );
}

/** Uploads files selected on the report form once create returns a dispatch id. */
function PendingMediaUploader({
  companyId,
  dispatchId,
  files,
  onDone
}: {
  companyId: string;
  dispatchId: string | null;
  files: File[] | null;
  onDone: () => void;
}) {
  const { carbon } = useCarbon();
  const { t } = useLingui();
  const [startedFor, setStartedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!dispatchId || !files || files.length === 0 || !carbon) return;
    if (startedFor === dispatchId) return;
    setStartedFor(dispatchId);

    void (async () => {
      try {
        const uploader = new MediaUploader(carbon, {
          bucket: getCompanyPrivateBucket(companyId),
          directory: `${companyId}/tmp`
        });
        let prepared = files;
        if (files.some((f) => isHeic(f.name, f.type))) {
          prepared = await uploader.prepareForUpload(files);
        }
        for (const file of prepared) {
          const safeName = safeStorageFileName(file.name);
          if (!safeName) continue;
          const filePath = `${companyId}/maintenance/${dispatchId}/${safeName}`;
          await storage(carbon).company(companyId).upload(filePath, file, {
            upsert: true
          });
        }
      } catch {
        toast.error(t`Created ticket, but media upload failed`);
      } finally {
        onDone();
      }
    })();
  }, [carbon, companyId, dispatchId, files, onDone, startedFor, t]);

  return null;
}

export function MachineDetailPage({
  machine,
  companyId,
  userId,
  people,
  commentsByDispatchId,
  filesByDispatchId,
  history,
  fetcher
}: MachineDetailPageProps) {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const busy = fetcher.state !== "idle";
  const [reportKind, setReportKind] = useState<ReportKind | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);

  const primary = primaryOpenDispatch(machine.openDispatches);
  const canReport =
    machine.status === "running" ||
    machine.status === "idle" ||
    machine.openDispatches.length === 0;

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.ok) return;
    revalidator.revalidate();
    setReportKind(null);
  }, [fetcher.state, fetcher.data, revalidator]);

  const submit = (
    action: ShopMaintenanceAction,
    opts: {
      dispatchId?: string;
      workCenterId?: string;
      assigneeId?: string;
      note?: string;
    } = {}
  ) => {
    const body = new FormData();
    body.set("action", action);
    if (opts.dispatchId) body.set("dispatchId", opts.dispatchId);
    if (opts.workCenterId) body.set("workCenterId", opts.workCenterId);
    if (opts.assigneeId) body.set("assigneeId", opts.assigneeId);
    if (opts.note) body.set("note", opts.note);
    fetcher.submit(body, { method: "post" });
  };

  const onAction = (
    action: ShopMaintenanceAction,
    dispatch: ShopOpenDispatch,
    assigneeId?: string
  ) => {
    submit(action, {
      dispatchId: dispatch.id,
      workCenterId: dispatch.workCenterId ?? machine.id,
      assigneeId
    });
  };

  const onReport = (args: {
    note: string;
    assigneeId?: string;
    files: File[];
  }) => {
    if (!reportKind) return;
    const action: ShopMaintenanceAction =
      reportKind === "break"
        ? "ReportBreak"
        : reportKind === "planned"
          ? "ReportPlanned"
          : "ReportDowntime";
    if (args.files.length > 0) setPendingFiles(args.files);
    submit(action, {
      workCenterId: machine.id,
      assigneeId: args.assigneeId,
      note: args.note
    });
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <button
          type="button"
          className="rounded-md p-2 text-foreground hover:bg-muted"
          aria-label="Back"
          onClick={() => navigate(path.to.shop)}
        >
          <LuChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{machine.name}</h1>
          {machine.subtitle ? (
            <p className="truncate text-xs text-muted-foreground">
              {machine.subtitle}
            </p>
          ) : null}
        </div>
        <MachineStatusChip status={machine.status} />
      </header>

      <WorkOrderSection work={machine.currentWork} />

      {reportKind ? (
        <ReportForm
          kind={reportKind}
          busy={busy}
          people={people}
          onCancel={() => setReportKind(null)}
          onSubmit={onReport}
        />
      ) : null}

      {!reportKind && canReport ? (
        <section className="px-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Trans>Actions</Trans>
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="md"
              variant="secondary"
              isDisabled={busy}
              onClick={() => setReportKind("break")}
            >
              <Trans>Break / Away</Trans>
            </Button>
            <Button
              type="button"
              size="md"
              variant="secondary"
              isDisabled={busy}
              onClick={() => setReportKind("planned")}
            >
              <Trans>Planned downtime</Trans>
            </Button>
            <Button
              type="button"
              size="md"
              variant="destructive"
              isDisabled={busy}
              onClick={() => setReportKind("fault")}
            >
              <Trans>Fault downtime</Trans>
            </Button>
          </div>
        </section>
      ) : null}

      {!reportKind && primary ? (
        <DispatchActions
          companyId={companyId}
          dispatch={primary}
          userId={userId}
          people={people}
          busy={busy}
          comments={commentsByDispatchId[primary.id] ?? []}
          files={filesByDispatchId[primary.id] ?? []}
          onAction={onAction}
          onUploaded={() => revalidator.revalidate()}
        />
      ) : null}

      {!reportKind &&
      machine.openDispatches.filter((d) => d.id !== primary?.id).length > 0 ? (
        <section className="flex flex-col gap-2 px-0">
          <h2 className="px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Trans>Other open tickets</Trans>
          </h2>
          {machine.openDispatches
            .filter((d) => d.id !== primary?.id)
            .map((d) => (
              <DispatchActions
                key={d.id}
                companyId={companyId}
                dispatch={d}
                userId={userId}
                people={people}
                busy={busy}
                comments={commentsByDispatchId[d.id] ?? []}
                files={filesByDispatchId[d.id] ?? []}
                onAction={onAction}
                onUploaded={() => revalidator.revalidate()}
              />
            ))}
        </section>
      ) : null}

      <section className="px-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Trans>Today's yield</Trans>
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <Trans>Coming in a later update</Trans>
        </p>
      </section>

      <section className="px-4 pb-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Trans>Maintenance history</Trans>
        </h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            <Trans>No recent closed tickets</Trans>
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {history.map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium tabular-nums">
                    {item.maintenanceDispatchId ?? item.id}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.shopKind}
                  {item.assigneeName ? ` · ${item.assigneeName}` : ""}
                </p>
                {item.note ? (
                  <p className="mt-1 line-clamp-2 text-xs">{item.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <PendingMediaUploader
        companyId={companyId}
        dispatchId={fetcher.data?.ok ? (fetcher.data.dispatchId ?? null) : null}
        files={pendingFiles}
        onDone={() => {
          setPendingFiles(null);
          revalidator.revalidate();
        }}
      />
    </div>
  );
}
