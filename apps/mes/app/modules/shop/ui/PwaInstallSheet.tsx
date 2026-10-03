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
 * Manual install / open-app steps when `beforeinstallprompt` is unavailable
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

  const title = alreadyInstalled ? t`Already installed` : t`Add to Home Screen`;

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
                ? t`This site is already installed. Chrome will not show Install again. Use Open in app, then pin a desktop / taskbar shortcut.`
                : t`Chrome did not offer a one-tap install yet. Use the menu below — or if the address bar shows Open in app, the PWA is already installed.`}
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
                  In the Chrome address bar, click Open in app (打开应用) to
                  launch the installed Carbon MES window.
                </Trans>
              </li>
              <li>
                <Trans>
                  In that app window: menu ⋮ → Cast, save, and share
                  (投屏、保存和分享) → Create shortcut (创建快捷方式) / Pin to
                  taskbar (固定到任务栏).
                </Trans>
              </li>
              <li>
                <Trans>
                  Or open chrome://apps → right-click Carbon MES → Create
                  shortcut → choose Pin to taskbar / Create desktop shortcut.
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
                  Tap the menu (⋮). If you see Install app, use it. If you see
                  Open in app in the address bar instead, the app is already
                  installed — follow Open app help.
                </Trans>
              </li>
              <li>
                <Trans>
                  Still missing Install? Stay on this page a few seconds and try
                  again, or use Open in app / chrome://apps → Create shortcut.
                </Trans>
              </li>
            </ol>
          )}
          <p className="text-xs text-muted-foreground">
            {isIos
              ? t`Chrome, Firefox, and Edge on iOS cannot native-install this app.`
              : alreadyInstalled
                ? t`Web pages cannot trigger Chrome’s Open in app automatically — use the address-bar control or chrome://apps.`
                : t`Only Chromium fires the one-tap Install prompt. After install, use Open in app to pin to the desktop.`}
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
