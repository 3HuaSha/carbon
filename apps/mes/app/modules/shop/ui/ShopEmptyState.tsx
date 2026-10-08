// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { Trans } from "@lingui/react/macro";
import { LuFactory } from "react-icons/lu";

export function ShopEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center font-mono">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-cyan-400 shadow-[0_0_32px_rgba(6,182,212,0.2)] backdrop-blur-xl">
        <LuFactory className="h-8 w-8" aria-hidden />
        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-300" />
        </span>
      </div>
      <div className="max-w-sm space-y-2">
        <h2 className="text-base font-black tracking-wide text-white uppercase">
          <Trans>No work centers here</Trans> // 暂无工作中心
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed text-pretty">
          <Trans>
            Add work centers for this location in Resources, then open Shop
            again. Machines on the computer MES will show here.
          </Trans>
        </p>
      </div>
    </div>
  );
}
