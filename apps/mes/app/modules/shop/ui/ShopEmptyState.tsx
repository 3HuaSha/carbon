// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { Trans } from "@lingui/react/macro";
import { LuFactory } from "react-icons/lu";
import { shopIos } from "./shopIos";

export function ShopEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-[color:var(--shop-track)] text-[color:var(--shop-muted)]">
        <LuFactory className="size-6" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <h2 className="text-base font-semibold">
          <Trans>No work centers here</Trans>
        </h2>
        <p className={`text-sm text-pretty ${shopIos.muted}`}>
          <Trans>
            Add work centers for this location in Resources, then open Shop
            again. Machines on the computer MES will show here.
          </Trans>
        </p>
      </div>
    </div>
  );
}
