// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn } from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { LuBoxes, LuChevronRight, LuShieldCheck, LuWrench } from "react-icons/lu";
import { useNavigate } from "react-router";
import Avatar from "~/components/Avatar";
import { path } from "~/utils/path";
import type {
  ShopCrewBoard,
  ShopCrewKind,
  ShopCrewMember,
  ShopCrewTask
} from "../shop.types";
import { shopIos } from "./shopIos";

type ShopCrewPageProps = {
  board: ShopCrewBoard;
};

const CREW_CONFIG: Record<
  ShopCrewKind,
  { title: () => ReactNode; code: string; icon: typeof LuWrench; color: string }
> = {
  repair: {
    title: () => <Trans>Repair</Trans>,
    code: "MAINTENANCE // 维修阵列",
    icon: LuWrench,
    color: "from-cyan-500 to-blue-600"
  },
  mold: {
    title: () => <Trans>Mold shop</Trans>,
    code: "TOOLING // 模房阵列",
    icon: LuBoxes,
    color: "from-purple-500 to-indigo-600"
  }
};

function taskInlineLabel(task: ShopCrewTask): string {
  const machineName = task.workCenterName?.trim() || "—";
  const note = task.note?.trim();
  return note ? `${machineName} (${note})` : machineName;
}

function MemberCard({
  member
}: {
  member: ShopCrewMember;
}) {
  const navigate = useNavigate();
  const idle = member.tasks.length === 0;
  const primaryTask = member.tasks[0];
  const canOpen = Boolean(primaryTask?.workCenterId);
  const tasksLabel = member.tasks.map(taskInlineLabel).join(" · ");

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border transition-all duration-200",
        idle
          ? "border-white/5 bg-slate-950/60"
          : "border-cyan-500/30 bg-slate-950/80 shadow-[0_4px_24px_rgba(6,182,212,0.15)]",
        canOpen && "hover:border-cyan-400/60 hover:scale-[1.01]"
      )}
    >
      {/* Subtle Laser Accent */}
      {!idle ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (primaryTask?.workCenterId) {
            navigate(path.to.shopMachine(primaryTask.workCenterId));
          }
        }}
        disabled={!canOpen}
        className={cn(
          "flex w-full items-center gap-3.5 p-3.5 text-left font-mono",
          canOpen && shopIos.press
        )}
      >
        {/* Operative Avatar with glowing halo */}
        <div className="relative shrink-0">
          <Avatar name={member.name} path={member.avatarUrl} size="md" />
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-slate-950",
              idle
                ? "bg-slate-500 shadow-[0_0_4px_#64748b]"
                : "bg-emerald-400 shadow-[0_0_8px_#34d399]"
            )}
          />
        </div>

        {/* Dossier Information */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-black text-white tracking-tight">
              {member.name}
            </span>
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase",
                idle
                  ? "border-white/10 bg-slate-900 text-slate-400"
                  : "border-cyan-400/40 bg-cyan-950/60 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.2)]"
              )}
            >
              {idle ? "STANDBY // 待命" : "ACTIVE // 任务中"}
            </span>
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p
              className={cn(
                "truncate text-[12px] font-medium tracking-tight",
                idle ? "text-slate-500" : "text-cyan-200"
              )}
            >
              {idle ? "// 当前无进行中任务" : tasksLabel}
            </p>

            {canOpen ? (
              <span className="flex shrink-0 items-center text-cyan-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all">
                <LuChevronRight className="h-4 w-4" />
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </div>
  );
}

export function ShopCrewPage({ board }: ShopCrewPageProps) {
  const { t } = useLingui();
  const config = CREW_CONFIG[board.crew];
  const Icon = config.icon;
  const busyCount = board.members.filter((m) => m.tasks.length > 0).length;
  const total = board.members.length;
  const loadRate = total > 0 ? Math.round((busyCount / total) * 100) : 0;

  return (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-3xl flex-col font-mono pb-24",
        shopIos.pageEnter
      )}
    >
      {/* Tactical Command Header */}
      <header className={cn("sticky top-0 z-20 px-4 pt-3 pb-3", shopIos.bar)}>
        <h1 className="sr-only">{config.title()}</h1>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-md",
                  config.color
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <span className="block text-[11px] font-bold tracking-widest text-cyan-400 uppercase">
                  {config.code}
                </span>
                <span className="text-xs text-slate-400">
                  {board.locationName?.trim() || "车间工区"}
                </span>
              </div>
            </div>

            {/* Tactical Load Telemetry */}
            <div className="mt-2.5 flex items-center gap-3">
              <div className="flex items-baseline gap-1.5 tabular-nums text-white">
                <span className="text-lg font-black">{total}</span>
                <span className="text-[10px] text-slate-400">OPERATIVES</span>
              </div>
              <span className="text-slate-600">/</span>
              <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300">
                <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
                {busyCount} {t`busy`}
              </div>
              <div className="relative ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]"
                  style={{ width: `${loadRate}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Operatives Command Dossier List */}
      <div className="flex-1 px-4 py-4">
        {board.matchedTypeNames.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-8 text-center backdrop-blur-xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 text-cyan-400">
              <LuShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="text-base font-bold text-white tracking-wide">
              <Trans>No matching employee type</Trans>
            </h2>
            <p className="mt-2 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              {board.crew === "repair" ? (
                <Trans>
                  Create an employee type named 维修 or 机修 (or Repair /
                  Maintenance) in ERP Users → Employee types, then assign people
                  to it.
                </Trans>
              ) : (
                <Trans>
                  Create an employee type named 模房 (or Mold) in ERP Users →
                  Employee types, then assign people to it.
                </Trans>
              )}
            </p>
          </div>
        ) : board.members.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-8 text-center backdrop-blur-xl">
            <h2 className="text-base font-bold text-white tracking-wide">
              <Trans>No people on this crew</Trans>
            </h2>
            <p className="mt-2 text-xs text-slate-400">
              <Trans>
                Assign active employees to one of the matched employee types.
              </Trans>{" "}
              <span className="text-cyan-400">
                [{board.matchedTypeNames.join(", ")}]
              </span>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {board.members.map((member) => (
              <MemberCard key={member.id} member={member} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
