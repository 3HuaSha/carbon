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

const FILTER_META: Record<
  (typeof shopStatusFilterChips)[number],
  { label: string; activeClass: string; dotClass: string }
> = {
  running: {
    label: "运行中",
    activeClass: "bg-emerald-600 text-white shadow-sm",
    dotClass: "bg-emerald-500"
  },
  down: {
    label: "停机",
    activeClass: "bg-red-600 text-white shadow-sm",
    dotClass: "bg-red-500"
  }
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
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="px-4 pb-3 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight">
              {locationName?.trim() || "车间总览"}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">{total}</span>
              台设备
              <span className="mx-0.5 text-border">|</span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {counts.running} 运行
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {counts.down} 停机
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              to={path.to.shopAlerts}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground active:bg-muted"
              aria-label={
                alertUnreadCount > 0
                  ? `提醒，${alertUnreadCount} 条未读`
                  : "提醒"
              }
            >
              <LuBell className="h-5 w-5" />
              {alertUnreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white tabular-nums">
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

        <div
          className="mt-3 flex gap-1 rounded-xl bg-muted/70 p-1"
          role="tablist"
          aria-label="按状态筛选"
        >
          <FilterChip
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
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-all duration-150 active:scale-[0.97]",
                  selected
                    ? meta.activeClass
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    selected ? "bg-white" : meta.dotClass
                  )}
                />
                {meta.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                    selected ? "bg-white/25" : "bg-background"
                  )}
                >
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
    </header>
  );
}

function FilterChip({
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
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-all duration-150 active:scale-[0.97]",
        selected
          ? "bg-foreground text-background shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
          selected ? "bg-background/25" : "bg-background"
        )}
      >
        {count}
      </span>
    </button>
  );
}
