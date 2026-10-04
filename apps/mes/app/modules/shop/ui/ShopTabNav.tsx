// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn } from "@carbon/react";
import { LuBoxes, LuFactory, LuWrench } from "react-icons/lu";
import { Link } from "react-router";
import { path } from "~/utils/path";
import { shopIos } from "./shopIos";

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
    icon: <LuFactory className="h-3.5 w-3.5" />
  },
  {
    id: "repair",
    to: path.to.shopRepair,
    label: "维修",
    icon: <LuWrench className="h-3.5 w-3.5" />
  },
  {
    id: "mold",
    to: path.to.shopMold,
    label: "模房",
    icon: <LuBoxes className="h-3.5 w-3.5" />
  }
];

type ShopTabNavProps = {
  active: ShopTab;
};

/** iOS segmented control — color/shadow swap only (no blur). */
export function ShopTabNav({ active }: ShopTabNavProps) {
  return (
    <nav className={shopIos.segment} aria-label="车间分区">
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            to={tab.to}
            className={cn(shopIos.segmentItem, "active:scale-[0.97] active:opacity-80")}
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
