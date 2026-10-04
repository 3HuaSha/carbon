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
  LuWrench
} from "react-icons/lu";
import { Link } from "react-router";
import { path } from "~/utils/path";
import type { ShopAlert } from "../shop.types";

type ShopAlertsPageProps = {
  alerts: ShopAlert[];
  locationName: string | null;
};

/** 分组标签：今天 / 昨天 / M月d日（用 @internationalized/date，不用 JS Date） */
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
    return {
      title: `${alert.workCenterName} 停机`,
      detail: "机台状态变为停机",
      iconBg: "bg-[#FF3B30]",
      Icon: LuCircleAlert
    };
  }
  return {
    title: `${alert.workCenterName} 已恢复`,
    detail: "停机已恢复为空闲",
    iconBg: "bg-[#34C759]",
    Icon: LuWrench
  };
}

/**
 * iOS 通知中心风格：
 * - 大标题 + 毛玻璃 sticky 栏
 * - 按今天 / 昨天 / 日期分组的 inset grouped 列表
 */
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
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col bg-[#F2F2F7] dark:bg-black">
      <div className="px-4 pb-2 pt-6">
        <div className="flex items-center gap-1">
          <Link
            to={path.to.shop}
            className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-[#007AFF] transition active:opacity-60"
            aria-label="返回"
          >
            <LuChevronLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight text-black dark:text-white">
            提醒
          </h1>
        </div>
        {locationName?.trim() ? (
          <p className="mt-0.5 pl-10 text-[14px] text-[#8E8E93]">
            {locationName.trim()}
          </p>
        ) : null}
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-20 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E3E3E8] text-[#8E8E93] dark:bg-[#1C1C1E]">
            <LuBellOff className="h-7 w-7" />
          </span>
          <p className="mt-2 text-[17px] font-semibold text-black dark:text-white">
            暂无提醒
          </p>
          <p className="text-[14px] text-[#8E8E93]">
            机台停机或恢复时会出现在这里
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-4 pb-10 pt-2">
          {groups.map(([label, items]) => (
            <section key={label}>
              <h2 className="mb-1.5 ml-4 text-[13px] font-medium uppercase tracking-wide text-[#8E8E93]">
                {label}
              </h2>
              <ul className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:bg-[#1C1C1E]">
                {items.map((alert, i) => {
                  const meta = alertMeta(alert);
                  return (
                    <li
                      key={alert.id}
                      className={cn(
                        i > 0 &&
                          "border-t border-black/5 dark:border-white/10"
                      )}
                    >
                      <Link
                        to={path.to.shopMachine(alert.workCenterId)}
                        className="flex items-center gap-3 px-4 py-3 transition active:bg-black/5 dark:active:bg-white/10"
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
                          <span className="truncate text-[16px] font-medium leading-tight text-black dark:text-white">
                            {meta.title}
                          </span>
                          <span className="text-[13px] text-[#8E8E93]">
                            {meta.detail} ·{" "}
                            {formatDateTime(alert.createdAt, "zh")}
                          </span>
                        </span>
                        <LuChevronRight className="h-4 w-4 shrink-0 text-[#C7C7CC] dark:text-[#48484A]" />
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
