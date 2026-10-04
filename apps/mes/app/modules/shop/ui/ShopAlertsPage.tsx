// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn } from "@carbon/react";
import { formatDateTime } from "@carbon/utils";
import { LuChevronLeft, LuCircleAlert, LuWrench } from "react-icons/lu";
import { Link } from "react-router";
import { path } from "~/utils/path";
import type { ShopAlert } from "../shop.types";

type ShopAlertsPageProps = {
  alerts: ShopAlert[];
  locationName: string | null;
};

function alertCopy(alert: ShopAlert): { title: string; detail: string } {
  if (alert.kind === "down") {
    return {
      title: `${alert.workCenterName} 停机`,
      detail: "机台状态变为停机"
    };
  }
  return {
    title: `${alert.workCenterName} 刚修完`,
    detail: "停机已恢复为空闲"
  };
}

/** Simple 提醒 list — back + rows, no extra chrome. */
export function ShopAlertsPage({ alerts, locationName }: ShopAlertsPageProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 pt-3 pb-3">
        <div className="flex items-center gap-1">
          <Link
            to={path.to.shop}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md active:bg-muted"
            aria-label="返回"
          >
            <LuChevronLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">提醒</h1>
            {locationName?.trim() ? (
              <p className="truncate text-xs text-muted-foreground">
                {locationName.trim()}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {alerts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-16 text-center">
          <p className="text-sm font-medium">暂无提醒</p>
          <p className="text-xs text-muted-foreground">
            停机或停机恢复为空闲时会出现在这里
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {alerts.map((alert) => {
            const copy = alertCopy(alert);
            const isDown = alert.kind === "down";
            return (
              <li key={alert.id}>
                <Link
                  to={path.to.shopMachine(alert.workCenterId)}
                  className="flex gap-3 px-4 py-3 active:bg-muted/60"
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      isDown
                        ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100"
                    )}
                  >
                    {isDown ? (
                      <LuCircleAlert className="h-4 w-4" />
                    ) : (
                      <LuWrench className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight">
                      {copy.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {copy.detail}
                    </p>
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground/80">
                      {formatDateTime(alert.createdAt, "zh")}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
