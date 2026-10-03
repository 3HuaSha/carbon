import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetHeader,
  BottomSheetTitle,
  Button
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";

type PwaInstallSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isIos: boolean;
  /** Chromium already installed this site; BIP will not fire again. */
  alreadyInstalled?: boolean;
};

/**
 * Manual install steps when `beforeinstallprompt` is unavailable
 * (iOS Safari, desktop non-Chromium, already installed, or Chrome without
 * an installable state for this engagement window).
 */
export function PwaInstallSheet({
  open,
  onOpenChange,
  isIos,
  alreadyInstalled = false
}: PwaInstallSheetProps) {
  const { t } = useLingui();

  const title = alreadyInstalled
    ? t`App already installed`
    : t`Add to Home Screen`;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="mx-auto max-w-lg pb-[env(safe-area-inset-bottom)]">
        <BottomSheetHeader>
          <BottomSheetTitle className="text-base font-semibold text-foreground">
            {title}
          </BottomSheetTitle>
          <BottomSheetDescription>
            {isIos
              ? t`iPhone and iPad never show a native Install button — use Safari’s Share menu.`
              : alreadyInstalled
                ? t`Desktop Chrome will not show Install again while this site is already an installed app. Open the app from chrome://apps, or uninstall it to reinstall.`
                : t`Chrome did not offer a one-tap install. If you already installed this site, Install app is unavailable until you uninstall or clear site data.`}
          </BottomSheetDescription>
        </BottomSheetHeader>
        <BottomSheetBody className="space-y-4">
          {isIos ? (
            <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
              <li>
                <Trans>Open this page in Safari (not Chrome on iOS).</Trans>
              </li>
              <li>
                <Trans>Tap Share (square with an arrow).</Trans>
              </li>
              <li>
                <Trans>Tap Add to Home Screen, then Add.</Trans>
              </li>
            </ol>
          ) : alreadyInstalled ? (
            <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
              <li>
                <Trans>
                  Open chrome://apps in the address bar and launch Carbon MES.
                </Trans>
              </li>
              <li>
                <Trans>
                  To reinstall: in chrome://apps, right-click the app → Remove
                  from Chrome. Or use ⋮ → Uninstall Carbon MES on an open app
                  window.
                </Trans>
              </li>
              <li>
                <Trans>
                  Then open chrome://settings/content/all, find this MES host,
                  delete site data, reload /shop, and tap Install again.
                </Trans>
              </li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
              <li>
                <Trans>Use Chrome on Android (or desktop Chrome).</Trans>
              </li>
              <li>
                <Trans>
                  Check ⋮ — if Install app is missing or greyed out, the app is
                  already installed: open chrome://apps or uninstall from ⋮.
                </Trans>
              </li>
              <li>
                <Trans>
                  To reset: chrome://settings/content/all → remove site data for
                  this MES host → reload, then try Install again.
                </Trans>
              </li>
            </ol>
          )}
          <p className="text-xs text-muted-foreground">
            {isIos
              ? t`Chrome, Firefox, and Edge on iOS cannot native-install this app.`
              : alreadyInstalled
                ? t`Chrome only fires the install prompt when the site is not already installed and installability criteria are met.`
                : t`Chrome may fire beforeinstallprompt only once per engagement window. After dismiss or install, reload or clear site data before retrying.`}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            <Trans>Got it</Trans>
          </Button>
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheet>
  );
}
