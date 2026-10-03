import { Count, cn, IconButton } from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { type ReactNode, useState } from "react";
import { LuDownload, LuMonitor } from "react-icons/lu";
import type { ShopMachineStatus, ShopStatusFilter } from "../shop.types";
import { shopStatusFilters } from "../shop.types";
import { PwaInstallSheet } from "./PwaInstallSheet";
import { usePwaInstall } from "./usePwaInstall";

const FILTER_LABELS: Record<ShopStatusFilter, () => ReactNode> = {
  all: () => <Trans>All</Trans>,
  running: () => <Trans>Running</Trans>,
  idle: () => <Trans>Idle</Trans>,
  waitingRepair: () => <Trans>Waiting</Trans>,
  inRepair: () => <Trans>In repair</Trans>
};

type ShopHeaderProps = {
  locationName: string | null;
  total: number;
  counts: Record<ShopMachineStatus, number>;
  filter: ShopStatusFilter;
  onFilterChange: (filter: ShopStatusFilter) => void;
};

export function ShopHeader({
  locationName,
  total,
  counts,
  filter,
  onFilterChange
}: ShopHeaderProps) {
  const { t } = useLingui();
  const {
    installed,
    knownInstalled,
    requestInstall,
    openInstalledApp,
    isIos,
    isAndroid,
    preparing
  } = usePwaInstall();
  const [helpOpen, setHelpOpen] = useState(false);
  const [alreadyInstalledHelp, setAlreadyInstalledHelp] = useState(false);
  const [inAppBrowserHelp, setInAppBrowserHelp] = useState(false);

  const onInstallClick = async () => {
    // Known-installed browser tab: open sheet with Open in app / pin steps.
    // Pages cannot programmatically trigger Chrome's omnibox Open in app.
    if (knownInstalled) {
      openInstalledApp();
      setInAppBrowserHelp(false);
      setAlreadyInstalledHelp(true);
      setHelpOpen(true);
      return;
    }

    const result = await requestInstall();
    if (result === "in-app-browser") {
      setAlreadyInstalledHelp(false);
      setInAppBrowserHelp(true);
      setHelpOpen(true);
      return;
    }
    if (result === "already-installed") {
      openInstalledApp();
      setInAppBrowserHelp(false);
      setAlreadyInstalledHelp(true);
      setHelpOpen(true);
      return;
    }
    if (result === "manual") {
      setInAppBrowserHelp(false);
      setAlreadyInstalledHelp(false);
      setHelpOpen(true);
    }
  };

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 pt-3 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {locationName?.trim() || t`Shop floor`}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
            {t`${total} machines`}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          {!installed ? (
            <IconButton
              aria-label={
                preparing
                  ? t`Preparing install…`
                  : knownInstalled
                    ? t`Open app — Already installed`
                    : t`Install / Add to Home Screen`
              }
              title={
                preparing
                  ? t`Preparing install…`
                  : knownInstalled
                    ? t`Open app — Already installed`
                    : t`Install / Add to Home Screen`
              }
              icon={knownInstalled ? <LuMonitor /> : <LuDownload />}
              variant="secondary"
              size="md"
              isDisabled={preparing}
              onClick={() => {
                void onInstallClick();
              }}
            />
          ) : null}
          <div className="flex flex-wrap justify-end gap-1.5 text-xs tabular-nums">
            <Count count={counts.running} variant="green" />
            <Count count={counts.idle} variant="gray" />
            <Count count={counts.waitingRepair} variant="orange" />
            <Count count={counts.inRepair} variant="red" />
          </div>
        </div>
      </div>

      <div
        className="mt-3 flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1"
        role="tablist"
        aria-label={t`Filter by status`}
      >
        {shopStatusFilters.map((value) => {
          const selected = filter === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onFilterChange(value)}
              className={cn(
                "shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors active:scale-[0.98]",
                selected
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {FILTER_LABELS[value]()}
            </button>
          );
        })}
      </div>

      <PwaInstallSheet
        open={helpOpen}
        onOpenChange={setHelpOpen}
        isIos={isIos}
        isAndroid={isAndroid}
        alreadyInstalled={alreadyInstalledHelp}
        inAppBrowser={inAppBrowserHelp}
      />
    </header>
  );
}
