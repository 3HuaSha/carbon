// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn } from "@carbon/react";
import { LuBoxes, LuFactory, LuWrench } from "react-icons/lu";
import { Link } from "react-router";
import { path } from "~/utils/path";
import { shopIos } from "./shopIos";

export type ShopTab = "machines" | "repair" | "mold";

const CREW_LINKS = [
  { id: "repair", to: path.to.shopRepair, label: "维修", icon: LuWrench },
  { id: "mold", to: path.to.shopMold, label: "模房", icon: LuBoxes }
] as const;

/** Left-aligned, thumb-sized shortcuts stay within reach while scrolling. */
export function ShopTabNav({ active }: { active: ShopTab }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[color:var(--shop-hairline)] bg-[color:var(--shop-bg)]">
      <nav
        aria-label="车间分区"
        className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
      >
        {CREW_LINKS.map((tab) => {
          const selected = tab.id === active;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              to={tab.to}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "flex h-14 min-w-[76px] flex-col items-center justify-center gap-1 rounded-2xl text-[14px] font-semibold",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--shop-link)]",
                shopIos.press,
                selected
                  ? "bg-[color:var(--shop-link)] text-white"
                  : "bg-[color:var(--shop-card)] text-[color:var(--shop-ink)] shadow-sm"
              )}
            >
              <Icon aria-hidden className="h-5 w-5" />
              {tab.label}
            </Link>
          );
        })}
        {active !== "machines" ? (
          <Link
            to={path.to.shop}
            className={cn(
              "ml-auto flex h-14 min-w-[64px] flex-col items-center justify-center gap-1 rounded-2xl text-[13px] font-semibold",
              shopIos.link
            )}
          >
            <LuFactory aria-hidden className="h-5 w-5" />
            机台
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
