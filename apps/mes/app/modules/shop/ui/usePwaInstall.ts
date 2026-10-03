import { useCallback, useEffect, useState } from "react";
import {
  type BeforeInstallPromptEvent,
  ensurePwaInstallCapture,
  getDeferredInstallPrompt,
  promptDeferredInstall,
  rememberPwaInstalled,
  subscribeDeferredInstallPrompt,
  waitForDeferredInstallPrompt,
  wasPwaInstallRemembered
} from "./pwaInstallCapture";

/** Desktop Chrome: short wait — prefer fast already-installed / Open app UX. */
const PROMPT_WAIT_DESKTOP_MS = 2800;
/** Android: SW claim + installability check is slower on cellular. */
const PROMPT_WAIT_MOBILE_MS = 5500;

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari legacy flag when launched from the home screen
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports as MacIntel but has touch
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function detectAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * WeChat / common in-app WebViews never expose a real install prompt.
 * Guide the user to open the URL in Chrome (Android) or Safari (iOS).
 */
function detectInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /MicroMessenger/i.test(ua) ||
    /QQ\//i.test(ua) ||
    /FBAN|FBAV|Instagram|Line\//i.test(ua) ||
    (/; wv\)/i.test(ua) && /Android/i.test(ua))
  );
}

function isLikelyPhone(): boolean {
  if (detectIos() || detectAndroid()) return true;
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  return (
    navigator.maxTouchPoints > 0 &&
    window.matchMedia("(max-width: 900px)").matches
  );
}

/**
 * Detect whether Chromium already installed this origin as an app while the
 * user is still in a normal browser tab (not `display-mode: standalone`).
 */
async function detectInstalledRelatedApp(): Promise<boolean> {
  if (wasPwaInstallRemembered()) return true;
  try {
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ platform: string }>>;
    };
    if (typeof nav.getInstalledRelatedApps !== "function") return false;
    const apps = await nav.getInstalledRelatedApps();
    if (apps.length > 0) {
      rememberPwaInstalled();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Shop PWA install affordance: read the early-captured `beforeinstallprompt`
 * (Android/desktop Chrome) and expose a click handler that calls `prompt()`
 * when possible, otherwise waits briefly then signals manual A2HS / open-app steps.
 */
export function usePwaInstall() {
  // Start false so SSR and the first client paint match; hide after mount
  // when already running as an installed PWA.
  const [installed, setInstalled] = useState(false);
  /** Browser tab, but Chromium already has this origin installed (BIP won't fire). */
  const [knownInstalled, setKnownInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [isIos, setIsIos] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    ensurePwaInstallCapture();
    setIsIos(detectIos());
    setIsAndroid(detectAndroid());
    setIsInAppBrowser(detectInAppBrowser());

    // Only hide while actually running as the installed app window.
    if (isStandaloneDisplay()) {
      setInstalled(true);
      return;
    }

    setDeferred(getDeferredInstallPrompt());
    const unsubscribe = subscribeDeferredInstallPrompt((event) => {
      setDeferred(event);
      // A live BIP means Chrome still considers the site installable.
      if (event) setKnownInstalled(false);
    });

    const onInstalled = () => {
      setInstalled(true);
      setKnownInstalled(true);
      setDeferred(null);
    };

    const media = window.matchMedia("(display-mode: standalone)");
    const onDisplayMode = () => {
      if (isStandaloneDisplay()) {
        setInstalled(true);
        setDeferred(null);
      }
    };

    window.addEventListener("appinstalled", onInstalled);
    media.addEventListener?.("change", onDisplayMode);

    let cancelled = false;
    const phone = isLikelyPhone();

    void (async () => {
      // Fast path: prior accept / related apps — flip the control to Open app
      // without waiting on a BIP that will never arrive.
      // Phones: only trust getInstalledRelatedApps / remembered after BIP miss
      // (stale localStorage must not hide Install on Android).
      if (!phone && (await detectInstalledRelatedApp())) {
        if (!cancelled && !getDeferredInstallPrompt()) {
          setKnownInstalled(true);
        }
        return;
      }

      if (detectIos()) return;

      // Heuristic: after the SW is ready, if BIP never arrives on desktop,
      // Chrome is usually suppressing install because the PWA is already
      // installed (omnibox shows "Open in app" instead).
      await navigator.serviceWorker?.ready.catch(() => undefined);
      if (cancelled) return;
      const late = await waitForDeferredInstallPrompt(
        phone ? PROMPT_WAIT_MOBILE_MS : PROMPT_WAIT_DESKTOP_MS
      );
      if (cancelled || late) return;
      if (wasPwaInstallRemembered() || (await detectInstalledRelatedApp())) {
        setKnownInstalled(true);
        return;
      }
      // Desktop only: treat no-BIP as already-installed for Open app UX.
      // Phones keep Install — BIP may simply be late or criteria not met yet.
      if (!phone) {
        setKnownInstalled(true);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener?.("change", onDisplayMode);
    };
  }, []);

  const requestInstall = useCallback(async (): Promise<
    "prompted" | "manual" | "already-installed" | "in-app-browser"
  > => {
    ensurePwaInstallCapture();

    if (detectInAppBrowser()) {
      return "in-app-browser";
    }

    // iOS never gets beforeinstallprompt — skip the wait and show Safari steps.
    if (detectIos()) {
      return "manual";
    }

    const phone = isLikelyPhone();

    // Desktop Open app path: already known installed in a browser tab.
    // Phones skip this so stale memory does not block native Install.
    if (!phone && (knownInstalled || wasPwaInstallRemembered())) {
      return "already-installed";
    }

    // CRITICAL: no await before prompt() — desktop Chrome requires the user gesture.
    const event = getDeferredInstallPrompt() ?? deferred;
    if (event) {
      try {
        const outcome = await promptDeferredInstall(event);
        setDeferred(null);
        if (outcome === "accepted" || isStandaloneDisplay()) {
          setInstalled(true);
          setKnownInstalled(true);
        }
        return "prompted";
      } catch {
        setDeferred(getDeferredInstallPrompt());
        return "manual";
      }
    }

    setPreparing(true);
    try {
      // Desktop: prefer an immediate "already installed" sheet when we already
      // know BIP cannot fire. Phones wait for BIP first.
      if (!phone && (await detectInstalledRelatedApp())) {
        setKnownInstalled(true);
        return "already-installed";
      }

      await navigator.serviceWorker?.ready.catch(() => undefined);
      const late = await waitForDeferredInstallPrompt(
        phone ? PROMPT_WAIT_MOBILE_MS : PROMPT_WAIT_DESKTOP_MS
      );
      if (late) {
        try {
          const outcome = await promptDeferredInstall(late);
          setDeferred(null);
          if (outcome === "accepted" || isStandaloneDisplay()) {
            setInstalled(true);
            setKnownInstalled(true);
          }
          return "prompted";
        } catch {
          setDeferred(getDeferredInstallPrompt());
        }
      }

      if (wasPwaInstallRemembered() || (await detectInstalledRelatedApp())) {
        setKnownInstalled(true);
        return "already-installed";
      }

      // Desktop: BIP never arrived — guide Open in app / pin.
      // Phone: show manual Chrome A2HS steps instead of assuming installed.
      if (!phone) {
        setKnownInstalled(true);
        return "already-installed";
      }
      return "manual";
    } finally {
      setPreparing(false);
    }
  }, [deferred, knownInstalled]);

  /**
   * Best-effort same-origin open. Web pages cannot trigger Chrome's omnibox
   * "Open in app" — the BottomSheet instructions are the real path.
   */
  const openInstalledApp = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.open(window.location.href, "_blank", "noopener,noreferrer");
    } catch {
      // Ignore popup blockers — sheet steps remain.
    }
  }, []);

  return {
    /** Already running as installed PWA — hide the install control. */
    installed,
    /**
     * Browser tab, but the origin is (or almost certainly is) already installed.
     * Show Open app / Already installed instead of Install.
     */
    knownInstalled,
    /** True when the native install prompt can be shown on click. */
    canPrompt: deferred !== null,
    /** True while waiting briefly for beforeinstallprompt after a tap. */
    preparing,
    isIos,
    isAndroid,
    isInAppBrowser,
    requestInstall,
    openInstalledApp
  };
}
