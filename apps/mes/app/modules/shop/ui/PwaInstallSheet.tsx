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
  isAndroid?: boolean;
  /** Chromium already installed this site; BIP will not fire again. */
  alreadyInstalled?: boolean;
  /** WeChat / in-app WebView — must open in system browser first. */
  inAppBrowser?: boolean;
};

/**
 * Manual install / open-app steps when `beforeinstallprompt` is unavailable
 * (iOS Safari, in-app WebViews, already installed, or Chrome without
 * an installable state for this engagement window).
 */
export function PwaInstallSheet({
  open,
  onOpenChange,
  isIos,
  isAndroid = false,
  alreadyInstalled = false,
  inAppBrowser = false
}: PwaInstallSheetProps) {
  const { t } = useLingui();

  const title = inAppBrowser
    ? t`Open in your browser`
    : alreadyInstalled
      ? t`Already installed`
      : t`Add to Home Screen`;

  const description = inAppBrowser
    ? isIos
      ? t`This in-app browser cannot install MES. Open the link in Safari, then Add to Home Screen.`
      : t`This in-app browser cannot install MES. Open the link in Chrome, then tap Install.`
    : isIos
      ? t`iPhone and iPad never show a one-tap Install button. Use Safari’s Share menu — the steps below take about 15 seconds.`
      : alreadyInstalled
        ? isAndroid
          ? t`Chrome on this phone will not offer Install again while MES is already on your home screen. Open the app, or uninstall it to reinstall.`
          : t`This site is already installed. Chrome will not show Install again. Use Open in app, then pin a desktop / taskbar shortcut.`
        : isAndroid
          ? t`Chrome did not offer a one-tap install yet. Stay on this page a few seconds, tap Install again, or use the Chrome menu below.`
          : t`Chrome did not offer a one-tap install yet. Use the menu below — or if the address bar shows Open in app, the PWA is already installed.`;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        className={
          isIos || inAppBrowser
            ? "mx-auto max-h-[90vh] min-h-[70vh] max-w-lg overflow-y-auto pb-[env(safe-area-inset-bottom)]"
            : "mx-auto max-w-lg pb-[env(safe-area-inset-bottom)]"
        }
      >
        <BottomSheetHeader>
          <BottomSheetTitle className="text-base font-semibold text-foreground">
            {title}
          </BottomSheetTitle>
          <BottomSheetDescription className="text-sm text-muted-foreground">
            {description}
          </BottomSheetDescription>
        </BottomSheetHeader>
        <BottomSheetBody className="space-y-5">
          {inAppBrowser ? (
            <ol className="list-decimal space-y-3 pl-5 text-base leading-relaxed text-foreground">
              <li>
                <Trans>
                  Tap the menu (⋯ or Share) in this in-app browser.
                </Trans>
              </li>
              <li>
                {isIos ? (
                  <Trans>Choose Open in Safari.</Trans>
                ) : (
                  <Trans>Choose Open in Chrome (or Open in browser).</Trans>
                )}
              </li>
              <li>
                <Trans>
                  Sign in if needed, open Shop, then tap Install again.
                </Trans>
              </li>
            </ol>
          ) : isIos ? (
            <ol className="list-decimal space-y-4 pl-5 text-base leading-relaxed text-foreground">
              <li>
                <Trans>
                  Open this page in Safari — not Chrome, Firefox, Edge, or
                  WeChat. Only Safari can add MES to the Home Screen.
                </Trans>
              </li>
              <li>
                <Trans>
                  Tap the Share button at the bottom of Safari (square with an
                  upward arrow).
                </Trans>
              </li>
              <li>
                <Trans>
                  Scroll the share sheet and tap Add to Home Screen.
                </Trans>
              </li>
              <li>
                <Trans>
                  Tap Add in the top right. Launch MES from your Home Screen
                  icon afterward.
                </Trans>
              </li>
            </ol>
          ) : alreadyInstalled ? (
            isAndroid ? (
              <ol className="list-decimal space-y-3 pl-5 text-sm text-foreground">
                <li>
                  <Trans>
                    Look for the MES / Carbon MES icon on your home screen or in
                    the app drawer and open it.
                  </Trans>
                </li>
                <li>
                  <Trans>
                    To reinstall: long-press the icon → App info → Uninstall (or
                    Remove).
                  </Trans>
                </li>
                <li>
                  <Trans>
                    In Chrome, tap ⋮ → Settings → Site settings → All sites →
                    this MES host → Clear and reset, then reload /shop and tap
                    Install again.
                  </Trans>
                </li>
              </ol>
            ) : (
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
            )
          ) : (
            <ol className="list-decimal space-y-3 pl-5 text-sm text-foreground">
              <li>
                {isAndroid ? (
                  <Trans>Stay in Chrome on Android (not Samsung Internet).</Trans>
                ) : (
                  <Trans>Use Chrome on Android (or desktop Chrome).</Trans>
                )}
              </li>
              <li>
                <Trans>
                  Tap the Chrome menu (⋮) at the top right, then Install app or
                  Add to Home screen.
                </Trans>
              </li>
              <li>
                {isAndroid ? (
                  <Trans>
                    If Install app is missing, wait a few seconds on Shop and tap
                    the download button again — or clear site data for this host
                    and retry.
                  </Trans>
                ) : (
                  <Trans>
                    Still missing Install? Stay on this page a few seconds and
                    try again, or use Open in app / chrome://apps → Create
                    shortcut.
                  </Trans>
                )}
              </li>
            </ol>
          )}
          <p className="text-xs text-muted-foreground">
            {inAppBrowser
              ? t`In-app browsers (WeChat, Instagram, etc.) block Progressive Web App install.`
              : isIos
                ? t`Chrome, Firefox, and Edge on iOS cannot native-install this app — they all use WebKit without beforeinstallprompt.`
                : alreadyInstalled
                  ? isAndroid
                    ? t`Chrome only fires the install prompt when the site is not already installed and installability criteria are met.`
                    : t`Web pages cannot trigger Chrome’s Open in app automatically — use the address-bar control or chrome://apps.`
                  : t`Only Chromium fires the one-tap Install prompt. After install on desktop, use Open in app to pin to the taskbar.`}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            size="lg"
            onClick={() => onOpenChange(false)}
          >
            <Trans>Got it</Trans>
          </Button>
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheet>
  );
}
