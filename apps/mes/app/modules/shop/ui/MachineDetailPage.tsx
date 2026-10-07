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
  LuChevronLeft,
  LuClipboardCheck,
  LuCoffee,
  LuHistory,
  LuMessageSquareText,
  LuPackage,
  LuTrendingUp,
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
import { presentShopDispatchProblem, primaryOpenDispatch } from "../shop.utils";
import {
  type AssignSelection,
  GroupedAssignPicker
} from "./GroupedAssignPicker";
import { ShopDispatchMedia } from "./ShopDispatchMedia";
import { shopIos } from "./shopIos";

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

type ReportKind = "break" | "issue";

const statusMeta: Record<
  ShopMachine["status"],
  { label: string; color: "green" | "gray" | "blue" | "red" | "orange" }
> = {
  running: { label: "运行", color: "green" },
  idle: { label: "空闲", color: "gray" },
  standby: { label: "待机", color: "gray" },
  break: { label: "休息", color: "blue" },
  down: { label: "停机", color: "red" },
  awaitingStart: { label: "待开机", color: "orange" },
  offline: { label: "离线", color: "gray" }
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
    <h2 className={cn("flex items-center gap-1.5", shopIos.sectionLabel)}>
      {icon ? <span className="opacity-70">{icon}</span> : null}
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
    <section className={shopIos.inset}>
      <div className="border-b border-[color:var(--shop-hairline)] px-4 py-2.5">
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
  issue: {
    title: "报问题",
    hint: "机台不停机。描述问题、可拍照，并指派相关人员。",
    icon: <LuMessageSquareText className="h-5 w-5" />
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
  const noteRequired = kind === "issue";
  const mediaRecommended = kind === "issue";
  const meta = reportKindMeta[kind];
  const iconClass =
    kind === "issue"
      ? "bg-gradient-to-br from-teal-500 to-cyan-600"
      : "bg-gradient-to-br from-sky-500 to-blue-600";

  return (
    <section className={shopIos.inset}>
      <div className="flex items-start justify-between gap-2 border-b border-[color:var(--shop-hairline)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl text-white",
              iconClass
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
            variant={kind === "issue" ? "secondary" : "primary"}
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
  const isIssue = dispatch.shopKind === "issue";
  const canAssignPerson =
    (dispatch.shopKind === "fault" ||
      dispatch.shopKind === "planned" ||
      isIssue) &&
    (dispatch.status === "Open" || dispatch.status === "Assigned") &&
    !dispatch.isWorking;
  // No Start/accept / 我来接单 — assign only via the four-column picker.
  const showEnd = dispatch.shopKind === "fault" && dispatch.isWorking;
  const showComplete =
    (dispatch.shopKind === "fault" || isIssue) &&
    dispatch.status !== "Completed" &&
    dispatch.status !== "Cancelled";
  const showResume = isBreakOrPlanned;

  const kindLabel =
    dispatch.shopKind === "break"
      ? "休息 / 离岗"
      : dispatch.shopKind === "planned"
        ? "计划停机"
        : isIssue
          ? "报问题"
          : "故障维修";

  const { problemText, followUpComments } = presentShopDispatchProblem({
    note: dispatch.note,
    comments
  });

  // Issue tickets are non-blocking — chip reflects that, not 停机.
  const chipStatus: ShopMachine["status"] | null = isIssue
    ? null
    : dispatch.shopKind === "break"
      ? "break"
      : "down";

  return (
    <section className={shopIos.inset}>
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isIssue ? (
              <LuMessageSquareText className="h-3.5 w-3.5" />
            ) : (
              <LuWrench className="h-3.5 w-3.5" />
            )}
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
        {chipStatus ? (
          <MachineStatusChip status={chipStatus} />
        ) : (
          <Status color="orange" disableTooltip>
            未停机
          </Status>
        )}
      </div>

      {followUpComments.length > 0 ? (
        <ul className="mx-4 mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {followUpComments.map((c) => (
            <li key={c.id} className="whitespace-pre-wrap text-sm">
              {c.comment}
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
            {isIssue ? "问题已处理" : "维修完成"}
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
  const openIssue = machine.openDispatches.find((d) => d.shopKind === "issue");
  // Single quick action 报问题 — hide create when an open issue already exists
  // (operator reassigns on that ticket instead).
  const canReportIssue = !openIssue && !reportKind;
  const showAwaitingStartConfirm = machine.status === "awaitingStart";

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
      reportKind === "break" ? "ReportBreak" : "ReportIssue";
    if (args.files.length > 0) setPendingFiles(args.files);
    submit(action, {
      workCenterId: machine.id,
      assigneeId: args.assigneeId,
      notifyUserIds: args.notifyUserIds,
      note: args.note
    });
  };

  // Prefer Meter 单号 on the detail "当前生产" headline when present.
  const workForDisplay: ShopCurrentWork | null = machine.meterWorkOrder
    ? {
        jobReadableId: machine.meterWorkOrder,
        jobId: machine.currentWork?.jobId ?? null,
        jobOperationId: machine.currentWork?.jobOperationId ?? null,
        operationStatus: machine.currentWork?.operationStatus ?? null,
        operationType: machine.currentWork?.operationType ?? null,
        inspectionId: machine.currentWork?.inspectionId ?? null,
        inspectionStatus: machine.currentWork?.inspectionStatus ?? null
      }
    : machine.currentWork;

  return (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 pb-24",
        shopIos.pageEnter
      )}
    >
      <header className={cn("sticky top-0 z-10", shopIos.bar)}>
        <div className="flex items-center gap-1 px-2 py-2">
          <button
            type="button"
            className={cn(
              "flex items-center rounded-full py-1 pl-1 pr-2",
              shopIos.link
            )}
            aria-label="返回"
            onClick={() => navigate(path.to.shop)}
          >
            <LuChevronLeft className="h-6 w-6" />
            <span className="text-[17px]">机台</span>
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h1 className="truncate text-[17px] font-semibold tracking-tight">
              {machine.name}
            </h1>
            {machine.subtitle ? (
              <p className={cn("truncate text-[12px]", shopIos.muted)}>
                {machine.subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex w-[76px] shrink-0 justify-end pr-2">
            <MachineStatusChip status={machine.status} />
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4">
        <WorkOrderSection work={workForDisplay} />

        {showAwaitingStartConfirm && !reportKind ? (
          <section className={shopIos.inset}>
            <div className="px-4 py-3">
              <p className="text-sm font-semibold text-foreground">待开机</p>
              <p className={cn("mt-1 text-xs", shopIos.muted)}>
                问题已处理。确认机台已开机后点击下方按钮。
              </p>
              <Button
                type="button"
                size="md"
                variant="primary"
                isDisabled={busy}
                className="mt-3 w-full"
                onClick={() =>
                  submit("ConfirmStarted", { workCenterId: machine.id })
                }
              >
                已开机
              </Button>
            </div>
          </section>
        ) : null}

        {reportKind ? (
          <ReportForm
            kind={reportKind}
            busy={busy}
            people={people}
            onCancel={() => setReportKind(null)}
            onSubmit={onReport}
          />
        ) : null}

        {!reportKind && canReportIssue ? (
          <section>
            <SectionTitle icon={<LuWrench className="h-4 w-4" />}>
              快捷操作
            </SectionTitle>
            <div className="mt-2.5 grid grid-cols-1 gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => setReportKind("issue")}
                className={cn(
                  "flex flex-col items-center gap-1.5 px-1.5 py-4 disabled:opacity-50",
                  shopIos.card,
                  shopIos.press
                )}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white">
                  <LuMessageSquareText className="h-5 w-5" />
                </span>
                <span className="text-xs font-medium">报问题</span>
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

        <section className={cn(shopIos.card, "px-4 py-3")}>
          <SectionTitle icon={<LuTrendingUp className="h-4 w-4" />}>
            今日产量
          </SectionTitle>
          <p className={cn("mt-2 text-sm", shopIos.muted)}>
            后续版本上线，敬请期待
          </p>
        </section>

        <section>
          <SectionTitle icon={<LuHistory className="h-4 w-4" />}>
            维修历史
          </SectionTitle>
          {history.length === 0 ? (
            <p
              className={cn(
                shopIos.card,
                "mt-2 px-4 py-6 text-center text-sm",
                shopIos.muted
              )}
            >
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
                        : item.shopKind === "issue"
                          ? "报问题"
                          : item.shopKind;
                return (
                  <li key={item.id} className={cn(shopIos.card, "px-4 py-3")}>
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
                    <p className={cn("mt-1 text-xs", shopIos.muted)}>
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
