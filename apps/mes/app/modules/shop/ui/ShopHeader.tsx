// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn, IconButton } from "@carbon/react";
import { useState } from "react";
import { LuBell, LuDownload, LuMonitor, LuShare } from "react-icons/lu";
import { Link } from "react-router";
import { path } from "~/utils/path";
import {
  shopMachineTypeOptions,
  type ShopMachineTypeFilter
} from "../shop.machine-types";
import type { ShopMachineStatus } from "../shop.types";
import { PwaInstallSheet } from "./PwaInstallSheet";
import { shopIos } from "./shopIos";
import { usePwaInstall } from "./usePwaInstall";

/**
 * Awwwards-caliber Command Header for MES Shop Floor.
 * Features:
 * - High-impact industrial HUD typography
 * - Dynamic production running telemetry gauge
 * - Cybernetic glass filter strip with laser illumination
 */
type ShopHeaderProps = {
  locationName: string | null;
  total: number;
  counts: Record<ShopMachineStatus, number>;
  machineType: ShopMachineTypeFilter;
  typeCounts: Record<ShopMachineTypeFilter, number>;
  onMachineTypeChange: (filter: ShopMachineTypeFilter) => void;
  alertUnreadCount?: number;
};

export function ShopHeader({
  locationName,
  total,
  counts,
  machineType,
  typeCounts,
  onMachineTypeChange,
  alertUnreadCount = 0
}: ShopHeaderProps) {
  const {
    installed,
    knownInstalled,
    requestInstall,
    openInstalledApp,
    isIos,
    isAndroid,
    isInAppBrowser,
    preparing,
    readyRetry,
    swControllerUrl
  } = usePwaInstall();
  const [helpOpen, setHelpOpen] = useState(false);
  const [alreadyInstalledHelp, setAlreadyInstalledHelp] = useState(false);
  const [inAppBrowserHelp, setInAppBrowserHelp] = useState(false);
  const [retryHint, setRetryHint] = useState(false);

  const onInstallClick = async () => {
    if (isInAppBrowser) {
      setAlreadyInstalledHelp(false);
      setInAppBrowserHelp(true);
      setHelpOpen(true);
      return;
    }
    if (isIos) {
      setInAppBrowserHelp(false);
      setAlreadyInstalledHelp(false);
      setHelpOpen(true);
      return;
    }
    if (knownInstalled) {
      openInstalledApp();
      setInAppBrowserHelp(false);
      setAlreadyInstalledHelp(true);
      setHelpOpen(true);
      return;
    }
    const result = await requestInstall();
    if (result === "in-app-browser") {
      setAlreadyInstalledHelp(false);
      setInAppBrowserHelp(true);
      setHelpOpen(true);
      return;
    }
    if (result === "already-installed") {
      openInstalledApp();
      setInAppBrowserHelp(false);
      setAlreadyInstalledHelp(true);
      setHelpOpen(true);
      return;
    }
    if (result === "ready-retry") {
      setRetryHint(true);
      return;
    }
    if (result === "manual") {
      setInAppBrowserHelp(false);
      setAlreadyInstalledHelp(false);
      setHelpOpen(true);
    }
    if (result === "prompted") {
      setRetryHint(false);
    }
  };

  const installAria = preparing
    ? "正在准备安装…"
    : readyRetry || retryHint
      ? "安装已就绪，再点一次"
      : knownInstalled
        ? "打开应用 — 已安装"
        : isIos
          ? "添加到主屏幕"
          : isInAppBrowser
            ? "用 Chrome 打开"
            : "安装应用";

  const location = locationName?.trim() || "车间总览";
  const runRate = total > 0 ? Math.round((counts.running / total) * 100) : 0;

  return (
    <>
      <div className="relative px-4 pt-3 pb-2.5">
        <h1 className="sr-only">{location}</h1>

        <div className="flex items-center justify-between gap-3">
          {/* Tactical Telemetry Badge */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              </span>
              <span className="font-mono text-[11px] font-bold tracking-widest text-emerald-400/90 uppercase">
                SYS.LIVE // {location}
              </span>
            </div>

            <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums text-slate-200">
              <span className="text-xl font-black tracking-tight text-white">
                {total}
                <span className="ml-1 text-[11px] font-normal text-slate-400">
                  UNITS
                </span>
              </span>
              <span className="text-[12px] text-slate-500">/</span>
              <span className="flex items-center gap-1 text-[13px] font-bold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {counts.running} 运行
              </span>
              <span className="text-[12px] text-slate-500">/</span>
              <span className="flex items-center gap-1 text-[13px] font-bold text-rose-400">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                {counts.down} 停机
              </span>
            </div>

            {/* High-Tech Running Ratio Meter */}
            <div className="mt-2 flex items-center gap-2">
              <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-slate-800/80">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] transition-all duration-500"
                  style={{ width: `${runRate}%` }}
                />
              </div>
              <span className="font-mono text-[10px] font-semibold tracking-wider text-slate-400 tabular-nums">
                {runRate}% EFF
              </span>
            </div>
          </div>

          {/* Action HUD Controls */}
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to={path.to.shopAlerts}
              aria-label={
                alertUnreadCount > 0
                  ? `提醒，${alertUnreadCount} 条未读`
                  : "提醒"
              }
              className={cn(
                "group relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-900/80 text-slate-300 shadow-sm transition-all duration-200 hover:border-cyan-400/50 hover:bg-slate-800 hover:text-white",
                shopIos.press
              )}
            >
              <LuBell className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
              {alertUnreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 font-mono text-[9px] font-black tabular-nums text-white shadow-[0_0_8px_rgba(244,63,94,0.8)]">
                  {alertUnreadCount > 99 ? "99+" : alertUnreadCount}
                </span>
              ) : null}
            </Link>

            {!installed ? (
              <IconButton
                aria-label={installAria}
                title={installAria}
                icon={
                  knownInstalled ? (
                    <LuMonitor className="h-4 w-4 text-cyan-400" />
                  ) : isIos ? (
                    <LuShare className="h-4 w-4 text-cyan-400" />
                  ) : (
                    <LuDownload className="h-4 w-4 text-cyan-400" />
                  )
                }
                variant="secondary"
                size="md"
                isDisabled={preparing}
                className="h-10 w-10 rounded-xl border border-white/10 bg-slate-900/80 shadow-sm hover:border-cyan-400/50 hover:bg-slate-800"
                onClick={() => {
                  void onInstallClick();
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Sticky Segmented Machine Type Filter Strip */}
      <div className={cn("sticky top-0 z-20 px-4 py-2", shopIos.bar)}>
        <div
          className={shopIos.segment}
          role="group"
          aria-label="按机台类型筛选"
        >
          {shopMachineTypeOptions.map(({ id, label }) => (
            <SegmentedOption
              key={id}
              selected={machineType === id}
              onClick={() => onMachineTypeChange(id)}
              label={label}
              count={typeCounts[id]}
            />
          ))}
        </div>
      </div>

      <PwaInstallSheet
        open={helpOpen}
        onOpenChange={setHelpOpen}
        isIos={isIos}
        isAndroid={isAndroid}
        alreadyInstalled={alreadyInstalledHelp}
        inAppBrowser={inAppBrowserHelp}
        swControllerUrl={swControllerUrl}
      />
    </>
  );
}

function SegmentedOption({
  selected,
  onClick,
  label,
  count
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        shopIos.segmentItem,
        "min-h-11 min-w-0 flex-col gap-0.5 !px-1 font-mono transition-all duration-200",
        selected &&
          "!border-cyan-400/40 !bg-gradient-to-b !from-slate-800 !to-slate-900 !text-white shadow-[0_0_12px_rgba(6,182,212,0.25)]"
      )}
    >
      <span className="text-[12px] font-bold tracking-wider">{label}</span>
      <span
        className={cn(
          "text-[11px] font-semibold tabular-nums",
          selected ? "text-cyan-300" : "text-slate-400 opacity-80"
        )}
      >
        {count}
      </span>
    </button>
  );
}
