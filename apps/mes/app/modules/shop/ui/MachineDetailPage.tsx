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
  {
    label: string;
    color: "green" | "gray" | "blue" | "red" | "orange" | "yellow";
  }
> = {
  running: { label: "运行", color: "green" },
  idle: { label: "空闲", color: "gray" },
  standby: { label: "待机", color: "yellow" },
  break: { label: "休息", color: "blue" },
  down: { label: "停机", color: "red" },
  awaitingStart: { label: "待开机", color: "orange" },
  offline: { label: "离线", color: "gray" }
};

function MachineStatusChip({ status }: { status: ShopMachine["status"] }) {
  const meta = statusMeta[status];
  const glowStyles: Record<
    ShopMachine["status"],
    { bg: string; text: string; dot: string; border: string }
  > = {
    running: {
      bg: "bg-emerald-950/60",
      text: "text-emerald-300",
      dot: "bg-emerald-400 shadow-[0_0_8px_#34d399]",
      border: "border-emerald-500/40"
    },
    idle: {
      bg: "bg-slate-900/60",
      text: "text-slate-300",
      dot: "bg-slate-400 shadow-[0_0_4px_#94a3b8]",
      border: "border-white/10"
    },
    standby: {
      bg: "bg-amber-950/60",
      text: "text-amber-300",
      dot: "bg-amber-400 shadow-[0_0_8px_#fbbf24]",
      border: "border-amber-500/40"
    },
    break: {
      bg: "bg-blue-950/60",
      text: "text-sky-300",
      dot: "bg-sky-400 shadow-[0_0_8px_#38bdf8]",
      border: "border-sky-500/40"
    },
    down: {
      bg: "bg-rose-950/60",
      text: "text-rose-300",
      dot: "bg-rose-400 shadow-[0_0_8px_#fb7185]",
      border: "border-rose-500/40"
    },
    awaitingStart: {
      bg: "bg-amber-950/60",
      text: "text-amber-300",
      dot: "bg-amber-400 shadow-[0_0_8px_#f59e0b]",
      border: "border-amber-500/40"
    },
    offline: {
      bg: "bg-slate-900/60",
      text: "text-slate-400",
      dot: "bg-slate-500 shadow-[0_0_4px_#64748b]",
      border: "border-white/10"
    }
  };

  const current = glowStyles[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-bold tracking-wider uppercase backdrop-blur-md",
        current.bg,
        current.text,
        current.border
      )}
    >
      <span
        className={cn(
          "inline-flex h-2 w-2 rounded-full",
          current.dot,
          status === "running" && "cyber-status-pulse"
        )}
      />
      {meta.label}
    </span>
  );
}

function QcStatus({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="font-mono text-xs text-slate-400 tracking-wider">
        // 暂无检验
      </span>
    );
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
  const isGood = status === "Passed";
  const isBad = status === "Failed";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold tracking-wider",
        isGood
          ? "border-emerald-500/40 bg-emerald-950/50 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
          : isBad
            ? "border-rose-500/40 bg-rose-950/50 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.2)]"
            : "border-amber-500/40 bg-amber-950/50 text-amber-300"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isGood ? "bg-emerald-400" : isBad ? "bg-rose-400" : "bg-amber-400"
        )}
      />
      {label}
    </span>
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
    <h2 className="flex items-center gap-2 font-mono text-[12px] font-bold tracking-widest text-slate-400 uppercase">
      {icon ? <span className="text-cyan-400">{icon}</span> : null}
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
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      {/* Corner laser accents */}
      <div className="pointer-events-none absolute top-0 left-0 h-3 w-3 border-l-2 border-t-2 border-cyan-400/60" />
      <div className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-r-2 border-t-2 border-cyan-400/60" />

      <div className="mb-3 flex items-center justify-between border-b border-white/5 pb-2.5">
        <SectionTitle icon={<LuPackage className="h-4 w-4" />}>
          CURRENT PRODUCTION // 当前生产
        </SectionTitle>
        <span className="font-mono text-[10px] tracking-widest text-cyan-400/70">
          SEC.01
        </span>
      </div>

      <div>
        {jobLabel ? (
          <div className="flex flex-wrap items-center gap-3">
            {operationHref ? (
              <Link
                to={operationHref}
                className="font-mono text-2xl font-black tracking-tight text-white underline-offset-4 hover:text-cyan-300 hover:underline"
              >
                {jobLabel}
              </Link>
            ) : (
              <p className="font-mono text-2xl font-black tracking-tight text-white">
                {jobLabel}
              </p>
            )}
            {work?.operationStatus ? (
              <span className="rounded-md border border-white/10 bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold text-slate-300">
                {work.operationStatus}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="py-2 font-mono text-sm text-slate-400">
            // 暂无在产工单 (NO ACTIVE WORK ORDER)
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-900/60 p-3">
          <div className="flex items-center gap-2.5">
            <LuClipboardCheck className="h-4 w-4 text-cyan-400" />
            <span className="font-mono text-xs font-bold text-slate-300 tracking-wider">
              QC.STATUS
            </span>
            <QcStatus status={work?.inspectionStatus ?? null} />
          </div>
          {inspectionHref && work?.inspectionId ? (
            <Link
              to={inspectionHref}
              className="shrink-0 rounded-lg border border-cyan-400/40 bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-1.5 font-mono text-xs font-bold text-white shadow-[0_0_12px_rgba(6,182,212,0.3)] transition-all hover:scale-105"
            >
              查看检验单 →
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
    <section className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-950/80 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-2 border-b border-white/5 pb-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md",
              iconClass
            )}
          >
            {meta.icon}
          </span>
          <div>
            <h2 className="font-mono text-sm font-bold text-white tracking-wide">
              {meta.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">{meta.hint}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="取消"
          className="rounded-lg border border-white/5 bg-slate-900/60 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          onClick={onCancel}
        >
          <LuX className="h-4 w-4" />
        </button>
      </div>

      <div className="pt-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={kind === "break" ? 2 : 4}
          placeholder={noteRequired ? "发生了什么？（必填）" : "备注（可选）"}
          className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-500 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
        />

        {mediaRecommended ? (
          <div className="mt-3">
            <input
              type="file"
              accept="image/*,video/*"
              capture="environment"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:font-mono file:text-xs file:font-bold file:text-white"
            />
            {files.length > 0 ? (
              <p className="mt-1 font-mono text-xs tabular-nums text-cyan-400">
                // 已选择 {files.length} 个文件
              </p>
            ) : null}
          </div>
        ) : null}

        {kind !== "break" ? (
          <div className="mt-3">
            <p className="mb-1.5 font-mono text-xs text-slate-400">
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
            className="flex-1 font-mono font-bold tracking-wider"
          >
            确认提交 // SUBMIT
          </Button>
          <Button
            type="button"
            size="md"
            variant="ghost"
            isDisabled={busy}
            onClick={onCancel}
            className="font-mono text-slate-400 hover:text-white"
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
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-2 border-b border-white/5 pb-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-mono text-xs font-bold tracking-widest text-cyan-400 uppercase">
            {isIssue ? (
              <LuMessageSquareText className="h-3.5 w-3.5" />
            ) : (
              <LuWrench className="h-3.5 w-3.5" />
            )}
            {kindLabel}
          </p>
          {problemText ? (
            <p className="mt-1.5 whitespace-pre-wrap font-mono text-base font-bold leading-snug text-white">
              {problemText}
            </p>
          ) : (
            <p className="mt-1.5 font-mono text-sm text-slate-400">// 暂无问题描述</p>
          )}
          <p className="mt-2 font-mono text-xs text-slate-400">
            {dispatch.assigneeName ? (
              assignedToMe ? (
                <span className="font-bold text-cyan-300">已指派给你 (ASSIGNED TO YOU)</span>
              ) : (
                <>负责人：{dispatch.assigneeName}</>
              )
            ) : (
              <span className="font-bold text-amber-300">未分配负责人 (UNASSIGNED)</span>
            )}
          </p>
        </div>
        {chipStatus ? (
          <MachineStatusChip status={chipStatus} />
        ) : (
          <span className="rounded-md border border-amber-500/30 bg-amber-950/40 px-2 py-0.5 font-mono text-xs font-bold text-amber-300">
            未停机
          </span>
        )}
      </div>

      {followUpComments.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2 border-t border-white/5 pt-3">
          {followUpComments.map((c) => (
            <li key={c.id} className="whitespace-pre-wrap font-mono text-sm text-slate-300">
              {c.comment}
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

      <div className="mt-4 flex flex-wrap gap-2">
        {showResume ? (
          <Button
            type="button"
            size="md"
            variant="primary"
            isDisabled={busy}
            onClick={() => onAction("ResumeAvailability", dispatch)}
            className="flex-1 border border-emerald-400/50 bg-gradient-to-r from-emerald-600 to-teal-600 font-mono font-bold text-white shadow-[0_0_16px_rgba(16,185,129,0.3)]"
          >
            {dispatch.shopKind === "break" ? "我回来了 (RESUME)" : "恢复生产 (RESUME)"}
          </Button>
        ) : null}
        {showComplete ? (
          <Button
            type="button"
            size="md"
            variant="primary"
            isDisabled={busy}
            onClick={() => onAction("Complete", dispatch)}
            className="flex-1 border border-cyan-400/50 bg-gradient-to-r from-cyan-600 to-blue-600 font-mono font-bold text-white shadow-[0_0_16px_rgba(6,182,212,0.3)]"
          >
            {isIssue ? "问题已处理 (COMPLETE)" : "维修完成 (COMPLETE)"}
          </Button>
        ) : null}
        {showEnd ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            isDisabled={busy}
            onClick={() => onAction("End", dispatch)}
            className="border border-white/10 bg-slate-900 font-mono text-slate-300 hover:text-white"
          >
            暂停 (PAUSE)
          </Button>
        ) : null}
      </div>

      {canAssignPerson ? (
        <div className="mt-4 border-t border-white/5 pt-3">
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
      <header className={cn("sticky top-0 z-20", shopIos.bar)}>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <button
            type="button"
            className={cn(
              "group flex items-center gap-1 rounded-xl border border-white/10 bg-slate-900/70 px-2.5 py-1.5 font-mono text-[13px] font-bold tracking-wider text-slate-300 shadow-sm transition-all duration-200 hover:border-cyan-400/50 hover:bg-slate-800 hover:text-white",
              shopIos.press
            )}
            aria-label="返回机台列表"
            onClick={() => navigate(path.to.shop)}
          >
            <LuChevronLeft className="h-5 w-5 text-cyan-400 transition-transform group-hover:-translate-x-0.5" />
            <span>// STATIONS</span>
          </button>
          <div className="min-w-0 flex-1 text-center font-mono">
            <h1 className="truncate text-xl font-black tracking-tight text-white">
              {machine.name}
            </h1>
            {machine.subtitle ? (
              <p className="truncate text-[11px] font-medium text-slate-400">
                {machine.subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 justify-end">
            <MachineStatusChip status={machine.status} />
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4 font-mono">
        <WorkOrderSection work={workForDisplay} />

        {showAwaitingStartConfirm && !reportKind ? (
          <section className="relative overflow-hidden rounded-2xl border border-amber-500/40 bg-amber-950/40 p-4 shadow-[0_8px_32px_rgba(245,158,11,0.2)] backdrop-blur-xl">
            <div>
              <p className="text-sm font-bold text-amber-300 uppercase tracking-wider">
                AWAITING START // 待开机确认
              </p>
              <p className="mt-1 text-xs text-amber-200/70">
                问题已处理完毕。确认机台已开机后点击下方按钮。
              </p>
              <Button
                type="button"
                size="md"
                variant="primary"
                isDisabled={busy}
                className="mt-3.5 w-full border border-amber-400/50 bg-gradient-to-r from-amber-500 to-amber-600 font-bold text-slate-950 shadow-[0_0_16px_rgba(245,158,11,0.4)]"
                onClick={() =>
                  submit("ConfirmStarted", { workCenterId: machine.id })
                }
              >
                确认已开机 (CONFIRM STARTED)
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
              TACTICAL ACTIONS // 快捷操作
            </SectionTitle>
            <div className="mt-2.5 grid grid-cols-1 gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => setReportKind("issue")}
                className={cn(
                  "group relative flex items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-left shadow-lg backdrop-blur-xl transition-all duration-200 hover:border-cyan-400/40 hover:bg-slate-900/90",
                  shopIos.press
                )}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/40 bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-[0_0_16px_rgba(6,182,212,0.4)] transition-transform group-hover:scale-110">
                  <LuMessageSquareText className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <span className="block text-sm font-bold text-white tracking-wide">
                    报问题 (REPORT ISSUE)
                  </span>
                  <span className="text-xs text-slate-400">
                    机台不停机，快速描述问题、拍照并指派相关人员
                  </span>
                </div>
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
              ACTIVE TICKETS // 其他进行中的工单
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

        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-lg backdrop-blur-xl">
          <SectionTitle icon={<LuTrendingUp className="h-4 w-4" />}>
            TELEMETRY OUTPUT // 今日产量
          </SectionTitle>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-white/5 bg-slate-900/50 p-3">
            <span className="text-xs text-slate-400">// 实时计数遥测传感器</span>
            <span className="rounded-md border border-cyan-400/30 bg-cyan-950/40 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
              NEXT RELEASE
            </span>
          </div>
        </section>

        <section>
          <SectionTitle icon={<LuHistory className="h-4 w-4" />}>
            MAINTENANCE LOGS // 维修历史
          </SectionTitle>
          {history.length === 0 ? (
            <p className="mt-2.5 rounded-2xl border border-white/5 bg-slate-950/60 px-4 py-8 text-center text-xs text-slate-400">
              // 暂无历史维修记录 (ARCHIVE EMPTY)
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
                  <li
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-slate-950/70 p-3.5 shadow-md backdrop-blur-xl transition-all hover:border-white/20"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white tracking-wide">
                        {item.note?.trim() || kindLabel}
                      </span>
                      <span className="rounded-md border border-white/10 bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                        {item.status === "Completed"
                          ? "已完成"
                          : item.status === "Cancelled"
                            ? "已取消"
                            : item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
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
