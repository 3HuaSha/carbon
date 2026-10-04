// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn } from "@carbon/react";
import { LuBoxes, LuFactory, LuWrench } from "react-icons/lu";
import { Link } from "react-router";
import { path } from "~/utils/path";

export type ShopTab = "machines" | "repair" | "mold";

const TABS: {
  id: ShopTab;
  to: string;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "machines",
    to: path.to.shop,
    label: "机台",
    icon: <LuFactory className="h-4 w-4" />
  },
  {
    id: "repair",
    to: path.to.shopRepair,
    label: "维修",
    icon: <LuWrench className="h-4 w-4" />
  },
  {
    id: "mold",
    to: path.to.shopMold,
    label: "模房",
    icon: <LuBoxes className="h-4 w-4" />
  }
];

type ShopTabNavProps = {
  active: ShopTab;
};

/** 顶部导航：机台 / 维修 / 模房 */
export function ShopTabNav({ active }: ShopTabNavProps) {
  return (
    <nav className="flex gap-1 rounded-xl bg-muted/70 p-1" aria-label="车间分区">
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            to={tab.to}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-center text-[13px] font-semibold transition-all duration-150 active:scale-[0.97]",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-current={selected ? "page" : undefined}
          >
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
