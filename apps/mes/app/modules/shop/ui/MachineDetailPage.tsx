// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { useCarbon } from "@carbon/auth";
import {
  getCompanyPrivateBucket,
  safeStorageFileName,
  storage
} from "@carbon/files";
import { isHeic, MediaUploader } from "@carbon/files/media";
import { Button, cn, Status, toast } from "@carbon/react";
import { useEffect, useState } from "react";
import {
  LuCalendarClock,
  LuChevronLeft,
  LuClipboardCheck,
  LuCoffee,
  LuHistory,
  LuPackage,
  LuTrendingUp,
  LuTriangleAlert,
  LuWrench,
  LuX
} from "react-icons/lu";
import {
  type FetcherWithComponents,
  Link,
  useNavigate,
  useRevalidator
} from "react-router";
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
import {
  type AssignSelection,
  GroupedAssignPicker
} from "./GroupedAssignPicker";
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

const statusMeta: Record<
  ShopMachine["status"],
  { label: string; color: "green" | "gray" | "blue" | "red"; gradient: string }
> = {
  running: {
    label: "运行",
    color: "green",
    gradient: "from-emerald-500 to-teal-600"
  },
  idle: {
    label: "空闲",
    color: "gray",
    gradient: "from-slate-400 to-slate-500"
  },
  break: {
    label: "休息",
    color: "blue",
    gradient: "from-sky-500 to-blue-600"
  },
  down: {
    label: "停机",
    color: "red",
    gradient: "from-red-500 to-rose-600"
  }
};

function MachineStatusChip({ status }: { status: ShopMachine["status"] }) {
  const meta = statusMeta[status];
  return (
    <Status color={meta.color} disableTooltip>
      {meta.label}
    </Status>
  );
}

function QcStatus({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-sm text-muted-foreground">暂无检验</span>;
  }
  const label =
    status === "Passed"
      ? "合格"
      : status === "Failed"
        ? "不合格"
        : status === "In Progress"
          ? "检验中"
          : status === "Partial"
            ? "部分合格"
            : status === "Pending"
              ? "待检验"
              : status;
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
      {label}
    </Status>
  );
}

function SectionTitle({
  icon,
  children
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      {children}
    </h2>
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
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border bg-muted/40 px-4 py-2.5">
        <SectionTitle icon={<LuPackage className="h-4 w-4" />}>
          当前生产
        </SectionTitle>
      </div>
      <div className="px-4 py-3">
        {jobLabel ? (
          <div className="flex flex-wrap items-center gap-2">
            {operationHref ? (
              <Link
                to={operationHref}
                className="text-xl font-bold tabular-nums tracking-tight text-foreground underline-offset-4 hover:underline"
              >
                {jobLabel}
              </Link>
            ) : (
              <p className="text-xl font-bold tabular-nums tracking-tight">
                {jobLabel}
              </p>
            )}
            {work?.operationStatus ? (
              <Status color="gray" disableTooltip>
                {work.operationStatus}
              </Status>
            ) : null}
          </div>
        ) : (
          <p className="py-1 text-sm text-muted-foreground">暂无在产工单</p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <LuClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">质检</span>
            <QcStatus status={work?.inspectionStatus ?? null} />
          </div>
          {inspectionHref && work?.inspectionId ? (
            <Link
              to={inspectionHref}
              className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              查看检验单
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

const reportKindMeta: Record<
  ReportKind,
  { title: string; hint: string; icon: React.ReactNode }
> = {
  break: {
    title: "休息 / 离岗",
    hint: "简单备注即可（吃饭、上厕所、短暂离开）。",
    icon: <LuCoffee className="h-5 w-5" />
  },
  planned: {
    title: "计划停机",
    hint: "建议填写备注并拍照（换模、保养、计划维护）。",
    icon: <LuCalendarClock className="h-5 w-5" />
  },
  fault: {
    title: "故障报修",
    hint: "请描述故障现象（必填），建议拍照或录像。",
    icon: <LuTriangleAlert className="h-5 w-5" />
  }
};

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
    notifyUserIds?: string[];
    files: File[];
  }) => void;
}) {
  const [note, setNote] = useState("");
  const [assignSelection, setAssignSelection] =
    useState<AssignSelection | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const noteRequired = kind === "fault";
  const mediaRecommended = kind === "fault" || kind === "planned";
  const meta = reportKindMeta[kind];

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl text-white",
              kind === "fault"
                ? "bg-gradient-to-br from-red-500 to-rose-600"
                : kind === "planned"
                  ? "bg-gradient-to-br from-amber-500 to-orange-500"
                  : "bg-gradient-to-br from-sky-500 to-blue-600"
            )}
          >
            {meta.icon}
          </span>
          <div>
            <h2 className="text-sm font-semibold">{meta.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{meta.hint}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="取消"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          onClick={onCancel}
        >
          <LuX className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={kind === "break" ? 2 : 4}
          placeholder={noteRequired ? "发生了什么？（必填）" : "备注（可选）"}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />

        {mediaRecommended ? (
          <div className="mt-3">
            <input
              type="file"
              accept="image/*,video/*"
              capture="environment"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium"
            />
            {files.length > 0 ? (
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                已选择 {files.length} 个文件
              </p>
            ) : null}
          </div>
        ) : null}

        {kind !== "break" ? (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-muted-foreground">
              指派人员（可选）— 主管 / PE / 模房 / 维修 · 主管默认全选
            </p>
            <GroupedAssignPicker
              people={people}
              busy={busy}
              requireConfirm={false}
              onSelectionChange={setAssignSelection}
            />
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            size="md"
            variant={kind === "fault" ? "destructive" : "primary"}
            isDisabled={busy || (noteRequired && !note.trim())}
            onClick={() =>
              onSubmit({
                note: note.trim(),
                assigneeId: assignSelection?.assigneeId,
                notifyUserIds: assignSelection?.notifyUserIds,
                files
              })
            }
            className="flex-1"
          >
            确认提交
          </Button>
          <Button
            type="button"
            size="md"
            variant="ghost"
            isDisabled={busy}
            onClick={onCancel}
          >
            取消
          </Button>
        </div>
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
    opts?: { assigneeId?: string; notifyUserIds?: string[] }
  ) => void;
  onUploaded: () => void;
}) {
  const assignedToMe = dispatch.assignee === userId;
  const isBreakOrPlanned =
    dispatch.shopKind === "break" || dispatch.shopKind === "planned";
  const canAssignPerson =
    (dispatch.shopKind === "fault" || dispatch.shopKind === "planned") &&
    (dispatch.status === "Open" || dispatch.status === "Assigned") &&
    !dispatch.isWorking;
  // No Start/accept / 我来接单 — assign only via the four-column picker.
  const showEnd = dispatch.shopKind === "fault" && dispatch.isWorking;
  const showComplete =
    dispatch.shopKind === "fault" &&
    dispatch.status !== "Completed" &&
    dispatch.status !== "Cancelled";
  const showResume = isBreakOrPlanned;

  const kindLabel =
    dispatch.shopKind === "break"
      ? "休息 / 离岗"
      : dispatch.shopKind === "planned"
        ? "计划停机"
        : "故障维修";

  const problemText =
    dispatch.note?.trim() ||
    comments.find((c) => c.comment?.trim())?.comment?.trim() ||
    null;

  const chipStatus: ShopMachine["status"] =
    dispatch.shopKind === "break" ? "break" : "down";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <LuWrench className="h-3.5 w-3.5" />
            {kindLabel}
          </p>
          {problemText ? (
            <p className="mt-1.5 whitespace-pre-wrap text-base font-semibold leading-snug text-foreground">
              {problemText}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">暂无问题描述</p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {dispatch.assigneeName ? (
              assignedToMe ? (
                <span className="font-medium text-primary">已指派给你</span>
              ) : (
                <>负责人：{dispatch.assigneeName}</>
              )
            ) : (
              <span className="font-medium text-foreground">未分配</span>
            )}
          </p>
        </div>
        <MachineStatusChip status={chipStatus} />
      </div>

      {comments.length > 0 && dispatch.note?.trim() ? (
        <ul className="mx-4 mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <span className="font-medium">{c.createdByName ?? "未知"}</span>
              <span className="text-muted-foreground">：</span>
              <span className="whitespace-pre-wrap">{c.comment}</span>
            </li>
          ))}
        </ul>
      ) : comments.length > 1 ? (
        <ul className="mx-4 mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {comments.slice(1).map((c) => (
            <li key={c.id} className="text-sm">
              <span className="font-medium">{c.createdByName ?? "未知"}</span>
              <span className="text-muted-foreground">：</span>
              <span className="whitespace-pre-wrap">{c.comment}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mx-4 mt-3">
        <ShopDispatchMedia
          companyId={companyId}
          dispatchId={dispatch.id}
          files={files}
          readOnly={dispatch.shopKind === "break"}
          onUploaded={onUploaded}
        />
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-3">
        {showResume ? (
          <Button
            type="button"
            size="md"
            variant="primary"
            isDisabled={busy}
            onClick={() => onAction("ResumeAvailability", dispatch)}
            className="flex-1"
          >
            {dispatch.shopKind === "break" ? "我回来了" : "恢复生产"}
          </Button>
        ) : null}
        {showComplete ? (
          <Button
            type="button"
            size="md"
            variant="primary"
            isDisabled={busy}
            onClick={() => onAction("Complete", dispatch)}
            className="flex-1"
          >
            维修完成
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
            暂停
          </Button>
        ) : null}
      </div>

      {canAssignPerson ? (
        <div className="px-4 pb-3">
          <GroupedAssignPicker
            people={people}
            busy={busy}
            requireConfirm
            confirmLabel="确认指派"
            onSubmit={(selection) =>
              onAction("Assign", dispatch, {
                assigneeId: selection.assigneeId,
                notifyUserIds: selection.notifyUserIds
              })
            }
          />
        </div>
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
        toast.error("工单已创建，但图片上传失败");
      } finally {
        onDone();
      }
    })();
  }, [carbon, companyId, dispatchId, files, onDone, startedFor]);

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
  const meta = statusMeta[machine.status];

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
      notifyUserIds?: string[];
      note?: string;
    } = {}
  ) => {
    const body = new FormData();
    body.set("action", action);
    if (opts.dispatchId) body.set("dispatchId", opts.dispatchId);
    if (opts.workCenterId) body.set("workCenterId", opts.workCenterId);
    if (opts.assigneeId) body.set("assigneeId", opts.assigneeId);
    if (opts.notifyUserIds && opts.notifyUserIds.length > 0) {
      body.set("notifyUserIds", opts.notifyUserIds.join(","));
    }
    if (opts.note) body.set("note", opts.note);
    fetcher.submit(body, { method: "post" });
  };

  const onAction = (
    action: ShopMaintenanceAction,
    dispatch: ShopOpenDispatch,
    opts?: { assigneeId?: string; notifyUserIds?: string[] }
  ) => {
    submit(action, {
      dispatchId: dispatch.id,
      workCenterId: dispatch.workCenterId ?? machine.id,
      assigneeId: opts?.assigneeId,
      notifyUserIds: opts?.notifyUserIds
    });
  };

  const onReport = (args: {
    note: string;
    assigneeId?: string;
    notifyUserIds?: string[];
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
      notifyUserIds: args.notifyUserIds,
      note: args.note
    });
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 bg-muted/30 pb-24">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            type="button"
            className="rounded-md p-2 text-foreground hover:bg-muted"
            aria-label="返回"
            onClick={() => navigate(path.to.shop)}
          >
            <LuChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight">
              {machine.name}
            </h1>
            {machine.subtitle ? (
              <p className="truncate text-xs text-muted-foreground">
                {machine.subtitle}
              </p>
            ) : null}
          </div>
          <MachineStatusChip status={machine.status} />
        </div>
        <div className={cn("h-1 w-full bg-gradient-to-r", meta.gradient)} />
      </header>

      <div className="flex flex-col gap-4 px-4">
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
          <section>
            <SectionTitle icon={<LuWrench className="h-4 w-4" />}>
              快捷操作
            </SectionTitle>
            <div className="mt-2.5 grid grid-cols-3 gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => setReportKind("break")}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-4 shadow-sm transition active:scale-95 disabled:opacity-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white">
                  <LuCoffee className="h-5 w-5" />
                </span>
                <span className="text-xs font-medium">休息</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setReportKind("planned")}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-4 shadow-sm transition active:scale-95 disabled:opacity-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
                  <LuCalendarClock className="h-5 w-5" />
                </span>
                <span className="text-xs font-medium">计划停机</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setReportKind("fault")}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-4 shadow-sm transition active:scale-95 disabled:opacity-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-600 text-white">
                  <LuTriangleAlert className="h-5 w-5" />
                </span>
                <span className="text-xs font-medium">故障报修</span>
              </button>
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
        machine.openDispatches.filter((d) => d.id !== primary?.id).length >
          0 ? (
          <section className="flex flex-col gap-3">
            <SectionTitle icon={<LuWrench className="h-4 w-4" />}>
              其他进行中的工单
            </SectionTitle>
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

        <section className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
          <SectionTitle icon={<LuTrendingUp className="h-4 w-4" />}>
            今日产量
          </SectionTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            后续版本上线，敬请期待
          </p>
        </section>

        <section>
          <SectionTitle icon={<LuHistory className="h-4 w-4" />}>
            维修历史
          </SectionTitle>
          {history.length === 0 ? (
            <p className="mt-2 rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              暂无历史维修记录
            </p>
          ) : (
            <ul className="mt-2.5 flex flex-col gap-2">
              {history.map((item) => {
                const kindLabel =
                  item.shopKind === "break"
                    ? "休息/离岗"
                    : item.shopKind === "planned"
                      ? "计划停机"
                      : item.shopKind === "fault"
                        ? "故障维修"
                        : item.shopKind;
                return (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">
                        {item.note?.trim() || kindLabel}
                      </span>
                      <Status color="gray" disableTooltip>
                        {item.status === "Completed"
                          ? "已完成"
                          : item.status === "Cancelled"
                            ? "已取消"
                            : item.status}
                      </Status>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        item.note?.trim() ? kindLabel : null,
                        item.assigneeName ?? "未分配"
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

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
