// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn } from "@carbon/react";
import { LuPackage, LuUser } from "react-icons/lu";
import type { ShopMachine, ShopMachineStatus } from "../shop.types";
import { primaryOpenDispatch } from "../shop.utils";

/**
 * 机台卡片：状态色块 + 呼吸灯 + 三层信息
 * 运行中：绿色呼吸点；停机：红色；休息：蓝色；空闲：灰色
 * 纯 CSS 动效（animate-ping / transition），零 JS 开销
 */
const STATUS_STYLE: Record<
  ShopMachineStatus,
  { card: string; dot: string; label: string; labelTone: string; name: string }
> = {
  running: {
    card: "border-emerald-200 bg-gradient-to-b from-emerald-50 to-emerald-100/60 dark:border-emerald-800 dark:from-emerald-950/60 dark:to-emerald-900/30",
    dot: "bg-emerald-500",
    label: "运行",
    labelTone: "text-emerald-700 dark:text-emerald-300",
    name: "运行中"
  },
  idle: {
    card: "border-border/70 bg-card",
    dot: "bg-slate-400",
    label: "空闲",
    labelTone: "text-muted-foreground",
    name: "空闲"
  },
  break: {
    card: "border-sky-200 bg-gradient-to-b from-sky-50 to-sky-100/60 dark:border-sky-800 dark:from-sky-950/60 dark:to-sky-900/30",
    dot: "bg-sky-500",
    label: "休息",
    labelTone: "text-sky-700 dark:text-sky-300",
    name: "休息"
  },
  down: {
    card: "border-red-200 bg-gradient-to-b from-red-50 to-red-100/60 dark:border-red-800 dark:from-red-950/60 dark:to-red-900/30",
    dot: "bg-red-500",
    label: "停机",
    labelTone: "text-red-700 dark:text-red-300",
    name: "停机"
  }
};

type MachineTileProps = {
  machine: ShopMachine;
  onSelect: (machine: ShopMachine) => void;
};

export function MachineTile({ machine, onSelect }: MachineTileProps) {
  const style = STATUS_STYLE[machine.status];
  const jobId =
    machine.currentJobReadableId ?? machine.currentWork?.jobReadableId ?? null;
  const primary = primaryOpenDispatch(machine.openDispatches);
  const assigneeName = primary?.assigneeName?.trim() || null;
  /** 停机原因 — never bound to the LuUser (assignee) row. */
  const downtimeReason =
    machine.status === "down" ? primary?.note?.trim() || null : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(machine)}
      aria-label={`${machine.name} ${style.name}${jobId ? ` ${jobId}` : ""}${downtimeReason ? ` ${downtimeReason}` : ""}${assigneeName ? ` ${assigneeName}` : ""}${machine.justFixed ? " 刚修完" : ""}`}
      className={cn(
        "group relative flex w-full flex-col gap-1 rounded-xl border p-2 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        "transition-all duration-150 active:scale-[0.96]",
        "hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]",
        style.card
      )}
    >
      {machine.justFixed ? (
        <span className="absolute -right-1 -top-1 z-[1] rounded px-1 py-px text-[9px] font-bold leading-tight text-white bg-amber-500 shadow-sm">
          刚修完
        </span>
      ) : null}
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span className="truncate text-[13px] font-bold leading-tight tracking-tight">
          {machine.name}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="relative flex h-1.5 w-1.5">
            {machine.status === "running" ? (
              <span
                className={cn(
                  "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                  style.dot
                )}
              />
            ) : null}
            <span
              className={cn(
                "relative inline-flex h-1.5 w-1.5 rounded-full",
                style.dot,
                machine.status === "running" && "animate-pulse"
              )}
            />
          </span>
          <span
            className={cn(
              "text-[10px] font-semibold leading-tight",
              style.labelTone
            )}
          >
            {style.label}
          </span>
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-1 text-[11px] leading-tight tabular-nums">
        <LuPackage className="h-3 w-3 shrink-0 text-muted-foreground/70" />
        {jobId ? (
          <span className="truncate font-semibold text-foreground/90">
            {jobId}
          </span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </div>

      {downtimeReason ? (
        <div className="min-w-0 truncate text-[10px] font-medium leading-tight text-red-700/90 dark:text-red-300/90">
          {downtimeReason}
        </div>
      ) : null}

      <div className="flex min-w-0 items-center gap-1 text-[10px] leading-tight text-muted-foreground">
        <LuUser className="h-3 w-3 shrink-0 opacity-70" />
        {assigneeName ? (
          <span className="truncate">{assigneeName}</span>
        ) : machine.status === "down" ? (
          <span className="text-red-600/80 dark:text-red-400/80">未分配</span>
        ) : (
          <span className="opacity-50">—</span>
        )}
      </div>
    </button>
  );
}
