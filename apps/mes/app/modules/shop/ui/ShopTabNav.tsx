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
  { id: "repair", to: path.to.shopRepair, label: "维修", code: "FIX", icon: LuWrench },
  { id: "mold", to: path.to.shopMold, label: "模房", code: "MLD", icon: LuBoxes }
] as const;

/**
 * Awwwards-caliber floating tactical dock nav.
 * Features futuristic glassmorphism, laser status indicator beacons,
 * and kinetic physics micro-press.
 */
export function ShopTabNav({ active }: { active: ShopTab }) {
  return (
    <nav
      aria-label="车间分区导航"
      className="fixed bottom-[calc(18svh+env(safe-area-inset-bottom))] left-[max(8px,env(safe-area-inset-left))] z-30 flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/80 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl"
    >
      {/* HUD Corner Accents */}
      <div className="pointer-events-none absolute -top-1 -left-1 h-2 w-2 border-l border-t border-cyan-400/60" />
      <div className="pointer-events-none absolute -bottom-1 -right-1 h-2 w-2 border-r border-b border-cyan-400/60" />

      {CREW_LINKS.map((tab) => {
        const selected = tab.id === active;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.id}
            to={tab.to}
            aria-current={selected ? "page" : undefined}
            title={tab.label}
            className={cn(
              "group relative flex h-12 w-10 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold tracking-wider transition-all duration-200",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400",
              shopIos.press,
              selected
                ? "bg-gradient-to-b from-cyan-500 to-blue-600 text-white shadow-[0_0_16px_rgba(6,182,212,0.5)] border border-cyan-300/40"
                : "bg-slate-900/60 text-slate-300 hover:bg-slate-800/80 hover:text-white border border-white/5"
            )}
          >
            {selected ? (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-300" />
              </span>
            ) : null}
            <Icon aria-hidden className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
            <span className="text-[10px] leading-tight font-medium">{tab.label}</span>
          </Link>
        );
      })}

      {active !== "machines" ? (
        <Link
          to={path.to.shop}
          title="机台总览"
          className={cn(
            "group relative flex h-12 w-10 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold tracking-wider transition-all duration-200",
            "bg-slate-900/60 text-slate-300 hover:bg-slate-800/80 hover:text-white border border-white/5",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400",
            shopIos.press
          )}
        >
          <LuFactory aria-hidden className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
          <span className="text-[10px] leading-tight font-medium">机台</span>
        </Link>
      ) : null}
    </nav>
  );
}
