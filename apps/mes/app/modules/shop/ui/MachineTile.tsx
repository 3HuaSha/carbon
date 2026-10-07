// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn } from "@carbon/react";
import type { ShopMachine, ShopMachineStatus } from "../shop.types";
import { formatShopTilePersonLine, primaryOpenDispatch } from "../shop.utils";
import { shopIos } from "./shopIos";

/**
 * Floor-map tile — status-filled card, exactly three lines.
 * Fill: 运行 green / 停机 red / 休息 blue / 待开机 amber / 待机 dark gray /
 * 空闲·离线 white + dark ink.
 * Colored fills use white ink; idle/offline never force `text-white`.
 * No continuous animations (ping/pulse) — 30+ tiles must stay cheap to paint.
 */
const STATUS: Record<ShopMachineStatus, { label: string; name: string }> = {
  running: { label: "运行", name: "运行中" },
  idle: { label: "空闲", name: "空闲" },
  standby: { label: "待机", name: "待机" },
  break: { label: "休息", name: "休息" },
  down: { label: "停机", name: "停机" },
  awaitingStart: { label: "待开机", name: "待开机" },
  offline: { label: "离线", name: "离线" }
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
  const lightInk = machine.status === "idle" || machine.status === "offline";
  const ink = lightInk ? "text-black" : "text-white";
  const statusDot = lightInk ? "bg-black/70" : "bg-white/90";
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
        "relative flex w-full flex-col gap-0.5 px-2.5 py-2 text-left",
        shopIos.statusFill[machine.status],
        shopIos.press
      )}
    >
      {machine.justFixed ? (
        <span className="absolute -right-1 -top-1 z-[1] rounded-md bg-[color:var(--shop-warn)] px-1 py-px text-[9px] font-bold leading-tight text-white">
          刚修完
        </span>
      ) : null}

      <div className="flex min-w-0 items-center justify-between gap-1">
        <span
          className={cn(
            "truncate text-[13px] font-semibold leading-tight tracking-tight",
            ink
          )}
        >
          {machine.name}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span
            className={cn("inline-flex h-1.5 w-1.5 rounded-full", statusDot)}
          />
          <span className={cn("text-[10px] font-semibold leading-tight", ink)}>
            {meta.label}
          </span>
        </span>
      </div>

      <div
        className={cn(
          "min-w-0 truncate text-[11px] leading-tight tabular-nums",
          shopIos.fillMuted
        )}
      >
        {jobId ? <span className={cn("font-medium", ink)}>{jobId}</span> : "—"}
      </div>

      <div
        className={cn(
          "min-w-0 truncate text-[10px] leading-tight",
          personLine.tone === "unassigned"
            ? cn("font-semibold", ink)
            : personLine.tone === "empty"
              ? shopIos.fillFaint
              : shopIos.fillMuted
        )}
      >
        {personLine.text}
      </div>
    </button>
  );
}
