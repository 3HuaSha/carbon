// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn } from "@carbon/react";
import { LuChevronRight } from "react-icons/lu";
import type { ShopMachine, ShopMachineStatus } from "../shop.types";
import { primaryOpenDispatch } from "../shop.utils";

/**
 * iOS 风格机台卡片：
 * - 白色圆角卡片 + 细阴影（iOS inset grouped 质感）
 * - 状态色圆点，运行中带呼吸动效
 * - 右侧 chevron，iOS 列表行手感
 * - 纯 CSS 动效，零 JS 开销
 */
const STATUS: Record<
  ShopMachineStatus,
  { dot: string; label: string; labelTone: string; name: string }
> = {
  running: {
    dot: "bg-[#34C759]",
    label: "运行",
    labelTone: "text-[#34C759]",
    name: "运行中"
  },
  idle: {
    dot: "bg-[#8E8E93]",
    label: "空闲",
    labelTone: "text-[#8E8E93]",
    name: "空闲"
  },
  break: {
    dot: "bg-[#007AFF]",
    label: "休息",
    labelTone: "text-[#007AFF]",
    name: "休息"
  },
  down: {
    dot: "bg-[#FF3B30]",
    label: "停机",
    labelTone: "text-[#FF3B30]",
    name: "停机"
  }
};

type MachineTileProps = {
  machine: ShopMachine;
  onSelect: (machine: ShopMachine) => void;
};

export function MachineTile({ machine, onSelect }: MachineTileProps) {
  const s = STATUS[machine.status];
  const jobId =
    machine.currentJobReadableId ?? machine.currentWork?.jobReadableId ?? null;
  const primary = primaryOpenDispatch(machine.openDispatches);
  const assigneeName = primary?.assigneeName?.trim() || null;
  const faultNote =
    machine.status === "down" ? primary?.note?.trim() || null : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(machine)}
      aria-label={`${machine.name} ${s.name}${jobId ? ` ${jobId}` : ""}`}
      className={cn(
        "flex w-full items-center gap-2 rounded-2xl bg-white px-3 py-2.5 text-left",
        "shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
        "transition active:scale-[0.98] active:opacity-80",
        "dark:bg-[#1C1C1E]"
      )}
    >
      {/* 状态圆点 */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {machine.status === "running" ? (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-50",
              s.dot
            )}
          />
        ) : null}
        <span
          className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full",
            s.dot,
            machine.status === "running" && "animate-pulse"
          )}
        />
      </span>

      {/* 文字区 */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold leading-tight text-black dark:text-white">
            {machine.name}
          </span>
          <span className={cn("shrink-0 text-[13px] font-medium", s.labelTone)}>
            {s.label}
          </span>
        </span>
        <span className="truncate text-[13px] tabular-nums text-[#8E8E93]">
          {jobId ? (
            <span className="font-medium text-black/80 dark:text-white/80">
              {jobId}
            </span>
          ) : (
            "暂无工单"
          )}
          {faultNote ? (
            <span className="text-[#FF3B30]"> · {faultNote}</span>
          ) : assigneeName ? (
            <span> · {assigneeName}</span>
          ) : machine.status === "down" ? (
            <span className="text-[#FF3B30]"> · 未指派</span>
          ) : null}
        </span>
      </span>

      <LuChevronRight className="h-4 w-4 shrink-0 text-[#C7C7CC] dark:text-[#48484A]" />
    </button>
  );
}
