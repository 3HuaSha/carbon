// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn } from "@carbon/react";
import type { ShopMachine, ShopMachineStatus } from "../shop.types";
import { formatShopTilePersonLine, primaryOpenDispatch } from "../shop.utils";
import { shopIos } from "./shopIos";

/**
 * Floor-map tile — status-filled card, exactly three lines.
 * Fill color = 运行/停机/休息/空闲; white ink for glanceable contrast.
 * No continuous animations (ping/pulse) — 30+ tiles must stay cheap to paint.
 */
const STATUS: Record<ShopMachineStatus, { label: string; name: string }> = {
  running: { label: "运行", name: "运行中" },
  idle: { label: "空闲", name: "空闲" },
  break: { label: "休息", name: "休息" },
  down: { label: "停机", name: "停机" }
};

type MachineTileProps = {
  machine: ShopMachine;
  onSelect: (machine: ShopMachine) => void;
};

export function MachineTile({ machine, onSelect }: MachineTileProps) {
  const meta = STATUS[machine.status];
  const jobId =
    machine.currentJobReadableId ?? machine.currentWork?.jobReadableId ?? null;
  const primary = primaryOpenDispatch(machine.openDispatches);
  const assigneeName = primary?.assigneeName?.trim() || null;
  const downtimeReason =
    machine.status === "down" ? primary?.note?.trim() || null : null;
  const personLine = formatShopTilePersonLine({
    status: machine.status,
    assigneeName,
    downtimeReason
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
        <span className="truncate text-[13px] font-semibold leading-tight tracking-tight text-white">
          {machine.name}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-white/90" />
          <span className="text-[10px] font-semibold leading-tight text-white">
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
        {jobId ? <span className="font-medium text-white">{jobId}</span> : "—"}
      </div>

      <div
        className={cn(
          "min-w-0 truncate text-[10px] leading-tight",
          personLine.tone === "unassigned"
            ? "font-semibold text-white"
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
