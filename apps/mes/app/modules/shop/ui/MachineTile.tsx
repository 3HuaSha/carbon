// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn } from "@carbon/react";
import type { ShopMachine, ShopMachineStatus } from "../shop.types";
import { formatShopTilePersonLine, primaryOpenDispatch } from "../shop.utils";
import { shopIos } from "./shopIos";

/**
 * Awwwards-caliber Reactor Machine Tile for MES Floor Plan.
 * Features:
 * - Cyber-brutalist neon reactors with etched HUD telemetry
 * - Pulsating reactor status core
 * - Hazard warning stripes for just-fixed units
 * - High-precision tactile physics on tap
 */
const STATUS: Record<
  ShopMachineStatus,
  { label: string; name: string; dotClass: string; textClass: string }
> = {
  running: {
    label: "运行",
    name: "运行中",
    dotClass: "bg-emerald-400 shadow-[0_0_8px_#34d399]",
    textClass: "text-emerald-100"
  },
  idle: {
    label: "空闲",
    name: "空闲",
    dotClass: "bg-slate-400 shadow-[0_0_4px_#94a3b8]",
    textClass: "text-slate-300"
  },
  standby: {
    label: "待机",
    name: "待机",
    dotClass: "bg-amber-400 shadow-[0_0_8px_#fbbf24]",
    textClass: "text-amber-950 font-bold"
  },
  break: {
    label: "休息",
    name: "休息",
    dotClass: "bg-sky-400 shadow-[0_0_8px_#38bdf8]",
    textClass: "text-sky-100"
  },
  down: {
    label: "停机",
    name: "停机",
    dotClass: "bg-rose-400 shadow-[0_0_8px_#fb7185]",
    textClass: "text-rose-100"
  },
  awaitingStart: {
    label: "待开机",
    name: "待开机",
    dotClass: "bg-amber-400 shadow-[0_0_8px_#f59e0b]",
    textClass: "text-amber-100"
  },
  offline: {
    label: "离线",
    name: "离线",
    dotClass: "bg-slate-500 shadow-[0_0_4px_#64748b]",
    textClass: "text-slate-400"
  }
};

type MachineTileProps = {
  machine: ShopMachine;
  onSelect: (machine: ShopMachine) => void;
};

function formatIssuePersonLine(
  assigneeName: string | null | undefined,
  note: string | null | undefined
): { text: string; tone: "assignee" | "unassigned" | "empty" } {
  const assignee = assigneeName?.trim() || null;
  const reason = note?.trim() || null;
  if (assignee && reason) {
    return { text: `${assignee} · ${reason}`, tone: "assignee" };
  }
  if (assignee) return { text: assignee, tone: "assignee" };
  if (reason) return { text: reason, tone: "unassigned" };
  return { text: "—", tone: "empty" };
}

export function MachineTile({ machine, onSelect }: MachineTileProps) {
  const meta = STATUS[machine.status];
  const isStandby = machine.status === "standby";
  const jobId =
    machine.meterWorkOrder ??
    machine.currentJobReadableId ??
    machine.currentWork?.jobReadableId ??
    null;
  const primary = primaryOpenDispatch(machine.openDispatches);
  const issueDispatch =
    machine.openDispatches.find((d) => d.shopKind === "issue") ?? null;

  // Open 报问题 alone must not look like 维修 downtime — overlay assignee/note
  // on running/idle/offline tiles; blocking down still uses downtime line.
  const personLine =
    issueDispatch &&
    machine.status !== "down" &&
    machine.status !== "break" &&
    machine.status !== "awaitingStart"
      ? formatIssuePersonLine(issueDispatch.assigneeName, issueDispatch.note)
      : formatShopTilePersonLine({
          status: machine.status,
          assigneeName: primary?.assigneeName ?? issueDispatch?.assigneeName,
          downtimeReason:
            machine.status === "down" ? primary?.note?.trim() || null : null
        });

  return (
    <button
      type="button"
      onClick={() => onSelect(machine)}
      aria-label={`${machine.name} ${meta.name}${jobId ? ` ${jobId}` : ""}${personLine.text !== "—" ? ` ${personLine.text}` : ""}${machine.justFixed ? " 刚修完" : ""}`}
      className={cn(
        "group relative flex w-full flex-col justify-between gap-1.5 p-3 text-left font-mono transition-all duration-200",
        shopIos.statusFill[machine.status],
        shopIos.press,
        "hover:scale-[1.02] hover:shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
      )}
    >
      {/* Subtle Laser Top Border Flare */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />

      {/* Just Fixed Hazard Caution Banner */}
      {machine.justFixed ? (
        <span className="hazard-stripes absolute -right-1 -top-1 z-10 rounded-md border border-amber-300/60 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-white shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
          刚修完
        </span>
      ) : null}

      {/* Line 1: Machine Identifier & Live Status Beacon */}
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span
          className={cn(
            "truncate text-[14px] font-black tracking-tight",
            isStandby ? "text-amber-950" : "text-white"
          )}
        >
          {machine.name}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/20 px-1.5 py-0.5 backdrop-blur-sm">
          <span
            className={cn(
              "inline-flex h-1.5 w-1.5 rounded-full transition-transform group-hover:scale-125",
              meta.dotClass,
              machine.status === "running" && "cyber-status-pulse"
            )}
          />
          <span
            className={cn(
              "text-[10px] font-bold tracking-wider uppercase",
              meta.textClass
            )}
          >
            {meta.label}
          </span>
        </span>
      </div>

      {/* Line 2: Work Order Code (Laser Etched) */}
      <div className="min-w-0 truncate text-[11px] leading-tight">
        {jobId ? (
          <span
            className={cn(
              "font-bold tracking-tight",
              isStandby ? "text-amber-900" : "text-slate-100"
            )}
          >
            {jobId}
          </span>
        ) : (
          <span
            className={cn(
              "text-[10px] font-medium tracking-widest opacity-60",
              isStandby ? "text-amber-900" : "text-slate-400"
            )}
          >
            // IDLE
          </span>
        )}
      </div>

      {/* Line 3: Operator / Issue Telemetry */}
      <div
        className={cn(
          "min-w-0 truncate text-[10px] leading-tight tracking-tight",
          personLine.tone === "unassigned"
            ? isStandby
              ? "font-bold text-amber-950"
              : "font-bold text-rose-300"
            : personLine.tone === "empty"
              ? isStandby
                ? "text-amber-900/60"
                : "text-slate-400/60"
              : isStandby
                ? "text-amber-900/80"
                : "text-slate-300"
        )}
      >
        {personLine.text}
      </div>
    </button>
  );
}
