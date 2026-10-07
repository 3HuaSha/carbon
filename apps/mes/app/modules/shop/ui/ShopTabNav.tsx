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

/** Compact shortcuts sit in the reserved left gutter, clear of page content. */
export function ShopTabNav({ active }: { active: ShopTab }) {
  return (
    <nav
      aria-label="车间分区"
      className="fixed bottom-[calc(25svh+env(safe-area-inset-bottom))] left-[env(safe-area-inset-left)] z-20 flex w-[52px] flex-col items-center gap-2"
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
              "flex h-12 w-10 flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] font-semibold",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--shop-link)]",
              shopIos.press,
              selected
                ? "bg-[color:var(--shop-link)] text-white"
                : "bg-[color:var(--shop-card)] text-[color:var(--shop-ink)] shadow-sm"
            )}
          >
            <Icon aria-hidden className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
      {active !== "machines" ? (
        <Link
          to={path.to.shop}
          className={cn(
            "flex h-12 w-10 flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] font-semibold",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--shop-link)]",
            shopIos.link
          )}
        >
          <LuFactory aria-hidden className="h-4 w-4" />
          机台
        </Link>
      ) : null}
    </nav>
  );
}
