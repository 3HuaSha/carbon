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
  /** `navigator.serviceWorker.controller` script URL when known. */
  swControllerUrl?: string | null;
};

/**
 * Manual install / open-app steps when `beforeinstallprompt` is unavailable
 * (iOS Safari, in-app WebViews, already installed, or Chrome without
 * an installable state for this engagement window).
 *
 * Mobile-first: Android Chrome diagnostics are primary. Desktop chrome://apps
 * copy is omitted on Android / iOS.
 */
export function PwaInstallSheet({
  open,
  onOpenChange,
  isIos,
  isAndroid = false,
  alreadyInstalled = false,
  inAppBrowser = false,
  swControllerUrl = null
}: PwaInstallSheetProps) {
  const { t } = useLingui();
  const swControlled = Boolean(swControllerUrl);
  const mobile = isIos || isAndroid;

  const title = inAppBrowser
    ? t`Open in Chrome`
    : alreadyInstalled
      ? t`Already installed`
      : isIos
        ? t`Add to Home Screen`
        : t`Install MES`;

  const description = inAppBrowser
    ? isIos
      ? t`This in-app browser cannot install MES. Open the link in Safari, then Add to Home Screen.`
      : t`WeChat / QQ / UC cannot install MES. Open this link in Chrome, then tap Install.`
    : isIos
      ? t`iPhone and iPad never show a one-tap Install button (Apple policy). Use Safari’s Share menu — about 15 seconds.`
      : alreadyInstalled
        ? isAndroid
          ? t`Chrome will not offer Install again while MES is already on your home screen. Open the app, or uninstall it to reinstall.`
          : t`This site is already installed. Chrome will not show Install again.`
        : isAndroid && swControlled
          ? t`One-tap Install is unavailable, but the service worker is already active. Use Chrome’s menu, or check whether MES is already on your home screen.`
          : isAndroid
            ? t`Chrome did not offer one-tap Install yet. Stay in Chrome (not WeChat), wait for the service worker, then use Chrome’s menu.`
            : t`Chrome did not offer a one-tap install yet. Use the menu below.`;

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent
        className={
          mobile || inAppBrowser
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
                <Trans>Tap the menu (⋯) in this in-app browser.</Trans>
              </li>
              <li>
                {isIos ? (
                  <Trans>Choose Open in Safari.</Trans>
                ) : (
                  <Trans>
                    Choose Open in browser / Open in Chrome (用浏览器打开).
                  </Trans>
                )}
              </li>
              <li>
                <Trans>
                  Sign in if needed, open Shop, wait a few seconds, then tap
                  Install.
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
            <ol className="list-decimal space-y-3 pl-5 text-base leading-relaxed text-foreground">
              <li>
                <Trans>
                  Look for the MES icon on your home screen or in the app drawer
                  and open it.
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
                  In Chrome: ⋮ → Settings → Site settings → All sites → this MES
                  host → Clear and reset. Reload /shop, wait a few seconds, tap
                  Install.
                </Trans>
              </li>
            </ol>
          ) : isAndroid && swControlled ? (
            <ol className="list-decimal space-y-3 pl-5 text-base leading-relaxed text-foreground">
              <li>
                <Trans>
                  Tap Chrome ⋮ (top right) and look for Install app, Add to Home
                  screen, or Install page as app. That menu path works even when
                  the in-page Install button cannot show a dialog.
                </Trans>
              </li>
              <li>
                <Trans>
                  If Chrome’s menu has no Install item, MES is usually already
                  installed — check your home screen / app drawer for MES and
                  open that icon instead.
                </Trans>
              </li>
              <li>
                <Trans>
                  To force a fresh install: uninstall the MES app, then Chrome ⋮
                  → Settings → Site settings → All sites → this host → Clear and
                  reset. Reload /shop, wait a few seconds, tap Install again.
                </Trans>
              </li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-3 pl-5 text-base leading-relaxed text-foreground">
              <li>
                <Trans>
                  Stay in Android Chrome — not WeChat, QQ, UC, or Samsung
                  Internet.
                </Trans>
              </li>
              <li>
                <Trans>
                  Hard refresh this page: Chrome ⋮ → refresh, or close the tab
                  and open /shop again. Wait 3–5 seconds after Shop loads.
                </Trans>
              </li>
              <li>
                <Trans>
                  Tap Install again for the system install dialog. Or Chrome ⋮ →
                  Install app / Add to Home screen.
                </Trans>
              </li>
              <li>
                <Trans>
                  Still missing? Chrome ⋮ → Settings → Site settings → All sites
                  → this host → Clear and reset, then retry.
                </Trans>
              </li>
            </ol>
          )}

          {isAndroid && !inAppBrowser && !alreadyInstalled ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-3 text-sm text-foreground space-y-1">
              <p className="font-medium">
                <Trans>Service worker check</Trans>
              </p>
              <p className="text-muted-foreground">
                {swControlled ? (
                  <Trans>
                    Controlled: yes — registration is fine. Missing one-tap
                    Install usually means Chrome already installed MES, or
                    Chrome only offers Install from the ⋮ menu right now.
                  </Trans>
                ) : (
                  <Trans>
                    Controlled: no — Chrome will not fire the install prompt
                    until a service worker controls this page. Hard refresh and
                    wait a few seconds.
                  </Trans>
                )}
              </p>
              {swControllerUrl ? (
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {swControllerUrl}
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {inAppBrowser
              ? t`In-app browsers (WeChat, QQ, UC, Instagram) block Progressive Web App install.`
              : isIos
                ? t`On iPhone, one-tap system install is impossible by Apple policy — Safari Add to Home Screen is the only path.`
                : alreadyInstalled
                  ? t`Chrome only fires beforeinstallprompt when the site is not already installed and installability criteria are met.`
                  : t`Only Android Chrome fires the one-tap Install prompt (beforeinstallprompt).`}
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
