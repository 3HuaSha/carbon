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
 * Compact header (no large titles) + opaque sticky filter strip.
 * Machine-type filters stay at the top; crew shortcuts use the left gutter.
 * No backdrop-blur — solid `--shop-bg` for snappy paint on phones.
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

  const location = locationName?.trim() || null;

  return (
    <>
      <div className="px-4 pb-2 pt-3">
        <h1 className="sr-only">{location || "车间总览"}</h1>
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "min-w-0 truncate text-[13px] tabular-nums",
              shopIos.muted
            )}
          >
            {location ? `${location} · ` : null}
            {total} 台 ·{" "}
            <span className="font-semibold text-[color:var(--shop-run)]">
              {counts.running} 运行
            </span>{" "}
            ·{" "}
            <span className="font-semibold text-[color:var(--shop-down)]">
              {counts.down} 停机
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
            <Link
              to={path.to.shopAlerts}
              aria-label={
                alertUnreadCount > 0
                  ? `提醒，${alertUnreadCount} 条未读`
                  : "提醒"
              }
              className={cn(
                "relative flex h-9 w-9 items-center justify-center rounded-full",
                shopIos.link
              )}
            >
              <LuBell className="h-5 w-5" />
              {alertUnreadCount > 0 ? (
                <span className="absolute right-0 top-0 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[color:var(--shop-down)] px-1 text-[10px] font-bold tabular-nums text-white">
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
                    <LuMonitor />
                  ) : isIos ? (
                    <LuShare />
                  ) : (
                    <LuDownload />
                  )
                }
                variant="secondary"
                size="md"
                isDisabled={preparing}
                onClick={() => {
                  void onInstallClick();
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className={cn("sticky top-0 z-10 px-4 py-2", shopIos.bar)}>
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
        "min-h-11 min-w-0 flex-col gap-0.5 !px-1",
        selected &&
          "!bg-[color:var(--shop-card)] !text-[color:var(--shop-ink)] shadow-sm"
      )}
    >
      {label}
      <span className="text-[12px] font-semibold tabular-nums opacity-80">
        {count}
      </span>
    </button>
  );
}
