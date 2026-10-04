// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn, IconButton } from "@carbon/react";
import { useState } from "react";
import { LuBell, LuDownload, LuMonitor, LuShare } from "react-icons/lu";
import { Link } from "react-router";
import { path } from "~/utils/path";
import type { ShopMachineStatus, ShopStatusFilter } from "../shop.types";
import { shopStatusFilterChips } from "../shop.types";
import { PwaInstallSheet } from "./PwaInstallSheet";
import { ShopTabNav } from "./ShopTabNav";
import { usePwaInstall } from "./usePwaInstall";

/**
 * iOS 风格顶栏：
 * - 大标题（随滚动），副标题设备统计
 * - 右上：提醒铃铛（红点角标）+ 安装按钮
 * - 下方 sticky 毛玻璃条：iOS 分段筛选器
 */
const FILTER_META: Record<
  (typeof shopStatusFilterChips)[number],
  { label: string; dotClass: string }
> = {
  running: { label: "运行中", dotClass: "bg-[#34C759]" },
  down: { label: "停机", dotClass: "bg-[#FF3B30]" }
};

type ShopHeaderProps = {
  locationName: string | null;
  total: number;
  counts: Record<ShopMachineStatus, number>;
  filter: ShopStatusFilter;
  onFilterChange: (filter: ShopStatusFilter) => void;
  /** Unread downtime / recovery reminders → `/shop/alerts`. */
  alertUnreadCount?: number;
};

export function ShopHeader({
  locationName,
  total,
  counts,
  filter,
  onFilterChange,
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

  return (
    <>
      {/* 大标题区：随页面滚动 */}
      <div className="bg-[#F2F2F7] px-4 pb-2 pt-6 dark:bg-black">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[34px] font-bold leading-tight tracking-tight text-black dark:text-white">
              {locationName?.trim() || "车间总览"}
            </h1>
            <p className="mt-1 text-[15px] tabular-nums text-[#8E8E93] dark:text-[#98989D]">
              {total} 台设备 ·{" "}
              <span className="font-semibold text-[#34C759]">
                {counts.running} 运行
              </span>{" "}
              ·{" "}
              <span className="font-semibold text-[#FF3B30]">
                {counts.down} 停机
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 pb-1">
            <Link
              to={path.to.shopAlerts}
              aria-label={
                alertUnreadCount > 0
                  ? `提醒，${alertUnreadCount} 条未读`
                  : "提醒"
              }
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#007AFF] transition active:opacity-60"
            >
              <LuBell className="h-[22px] w-[22px]" />
              {alertUnreadCount > 0 ? (
                <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[11px] font-bold tabular-nums text-white">
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
        <div className="mt-3">
          <ShopTabNav active="machines" />
        </div>
      </div>

      {/* sticky 毛玻璃筛选条 */}
      <div className="sticky top-0 z-10 border-b border-black/5 bg-[#F2F2F7]/80 px-4 py-2 backdrop-blur-xl dark:border-white/10 dark:bg-black/70">
        <div
          className="flex rounded-[10px] bg-[#E3E3E8] p-[2px] dark:bg-[#1C1C1E]"
          role="tablist"
          aria-label="按状态筛选"
        >
          <SegmentedOption
            selected={filter === "all"}
            onClick={() => onFilterChange("all")}
            label="全部"
            count={total}
          />
          {shopStatusFilterChips.map((value) => {
            const meta = FILTER_META[value];
            const selected = filter === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onFilterChange(selected ? "all" : value)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] transition-all duration-150 active:opacity-60",
                  selected
                    ? "bg-white font-semibold text-black shadow-[0_1px_4px_rgba(0,0,0,0.12)] dark:bg-[#2C2C2E] dark:text-white"
                    : "font-medium text-[#8E8E93]"
                )}
              >
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", meta.dotClass)}
                />
                {meta.label}
                <span className="text-[12px] font-semibold tabular-nums opacity-80">
                  {counts[value]}
                </span>
              </button>
            );
          })}
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
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] transition-all duration-150 active:opacity-60",
        selected
          ? "bg-white font-semibold text-black shadow-[0_1px_4px_rgba(0,0,0,0.12)] dark:bg-[#2C2C2E] dark:text-white"
          : "font-medium text-[#8E8E93]"
      )}
    >
      {label}
      <span className="text-[12px] font-semibold tabular-nums opacity-80">
        {count}
      </span>
    </button>
  );
}
