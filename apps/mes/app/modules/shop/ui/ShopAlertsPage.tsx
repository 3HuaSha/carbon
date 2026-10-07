// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn } from "@carbon/react";
import { formatDateTime } from "@carbon/utils";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { useMemo } from "react";
import {
  LuBellOff,
  LuChevronLeft,
  LuChevronRight,
  LuCircleAlert,
  LuMessageSquareText,
  LuWrench
} from "react-icons/lu";
import { Link } from "react-router";
import { path } from "~/utils/path";
import type { ShopAlert } from "../shop.types";
import { shopIos } from "./shopIos";

type ShopAlertsPageProps = {
  alerts: ShopAlert[];
  locationName: string | null;
};

function dayGroupLabel(iso: string): string {
  const now = today(getLocalTimeZone());
  const d = parseDate(iso.slice(0, 10));
  if (d.compare(now) === 0) return "今天";
  const yesterday = now.subtract({ days: 1 });
  if (d.compare(yesterday) === 0) return "昨天";
  return `${d.month}月${d.day}日`;
}

function alertMeta(alert: ShopAlert) {
  if (alert.kind === "down") {
    const note = alert.note?.trim();
    return {
      title: `${alert.workCenterName} 报修`,
      detail: note || "故障报修，机台停机",
      iconBg: "bg-[color:var(--shop-down)]",
      Icon: LuCircleAlert
    };
  }
  if (alert.kind === "issue") {
    const note = alert.note?.trim();
    return {
      title: `${alert.workCenterName} 报问题`,
      detail: note || "有新的问题反馈（未停机）",
      iconBg: "bg-[color:var(--shop-warn)]",
      Icon: LuMessageSquareText
    };
  }
  if (alert.kind === "awaitingStart") {
    return {
      title: `${alert.workCenterName} 待开机`,
      detail: "问题已处理，等待确认开机",
      iconBg: "bg-[color:var(--shop-warn)]",
      Icon: LuWrench
    };
  }
  return {
    title: `${alert.workCenterName} 已修好`,
    detail: "维修已完成",
    iconBg: "bg-[color:var(--shop-run)]",
    Icon: LuWrench
  };
}

/** iOS notification-center style — opaque inset groups, no blur. */
export function ShopAlertsPage({ alerts, locationName }: ShopAlertsPageProps) {
  const groups = useMemo(() => {
    const map = new Map<string, ShopAlert[]>();
    for (const alert of alerts) {
      const key = dayGroupLabel(alert.createdAt);
      const list = map.get(key) ?? [];
      list.push(alert);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [alerts]);

  return (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-3xl flex-col",
        shopIos.pageEnter
      )}
    >
      <div className="px-4 pb-2 pt-3">
        <div className="flex items-center gap-1">
          <Link
            to={path.to.shop}
            className={cn(
              "-ml-2 flex h-9 w-9 items-center justify-center rounded-full",
              shopIos.link
            )}
            aria-label="返回"
          >
            <LuChevronLeft className="h-6 w-6" />
          </Link>
          <h1 className={shopIos.compactTitle}>提醒</h1>
          {locationName?.trim() ? (
            <span className={cn("ml-2 truncate text-[13px]", shopIos.muted)}>
              {locationName.trim()}
            </span>
          ) : null}
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-20 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--shop-track)] text-[color:var(--shop-muted)]">
            <LuBellOff className="h-7 w-7" />
          </span>
          <p className="mt-2 text-[17px] font-semibold">暂无提醒</p>
          <p className={cn("text-[14px]", shopIos.muted)}>
            机台停机、恢复、报问题或待开机时会出现在这里
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-4 pb-10 pt-2">
          {groups.map(([label, items]) => (
            <section key={label}>
              <h2 className={cn("mb-1.5 ml-4", shopIos.sectionLabel)}>
                {label}
              </h2>
              <ul className={shopIos.inset}>
                {items.map((alert, i) => {
                  const meta = alertMeta(alert);
                  return (
                    <li
                      key={alert.id}
                      className={cn(i > 0 && shopIos.hairlineTop)}
                    >
                      <Link
                        to={path.to.shopMachine(alert.workCenterId)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3",
                          shopIos.press
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white",
                            meta.iconBg
                          )}
                        >
                          <meta.Icon className="h-[18px] w-[18px]" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[16px] font-medium leading-tight">
                            {meta.title}
                          </span>
                          <span className={cn("text-[13px]", shopIos.muted)}>
                            {meta.detail} ·{" "}
                            {formatDateTime(alert.createdAt, "zh")}
                          </span>
                        </span>
                        <LuChevronRight className="h-4 w-4 shrink-0 text-[color:var(--shop-muted)] opacity-50" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
