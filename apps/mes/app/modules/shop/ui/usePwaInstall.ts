import { useCallback, useEffect, useState } from "react";
import {
  type BeforeInstallPromptEvent,
  ensurePwaInstallCapture,
  getDeferredInstallPrompt,
  promptDeferredInstall,
  subscribeDeferredInstallPrompt,
  waitForDeferredInstallPrompt,
  wasPwaInstallRemembered
} from "./pwaInstallCapture";

/** How long Install click waits for `beforeinstallprompt` before the help sheet. */
const PROMPT_WAIT_MS = 2800;

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
    return apps.length > 0;
  } catch {
    return false;
  }
}

/**
 * Shop PWA install affordance: read the early-captured `beforeinstallprompt`
 * (Android/desktop Chrome) and expose a click handler that calls `prompt()`
 * when possible, otherwise waits briefly then signals manual A2HS steps.
 */
export function usePwaInstall() {
  // Start false so SSR and the first client paint match; hide after mount
  // when already running as an installed PWA.
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [isIos, setIsIos] = useState(false);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    ensurePwaInstallCapture();
    setIsIos(detectIos());

    // Only hide while actually running as the installed app window.
    // In a normal browser tab, keep Install visible so a tap can explain
    // "already installed" when BIP will not re-fire.
    if (isStandaloneDisplay()) {
      setInstalled(true);
      return;
    }

    setDeferred(getDeferredInstallPrompt());
    const unsubscribe = subscribeDeferredInstallPrompt(setDeferred);

    const onInstalled = () => {
      setInstalled(true);
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

    return () => {
      unsubscribe();
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener?.("change", onDisplayMode);
    };
  }, []);

  const requestInstall = useCallback(async (): Promise<
    "prompted" | "manual" | "already-installed"
  > => {
    ensurePwaInstallCapture();

    // iOS never gets beforeinstallprompt — skip the wait and show Safari steps.
    if (detectIos()) {
      return "manual";
    }

    // CRITICAL: no await before prompt() — desktop Chrome requires the user gesture.
    const event = getDeferredInstallPrompt() ?? deferred;
    if (event) {
      try {
        const outcome = await promptDeferredInstall(event);
        setDeferred(null);
        if (outcome === "accepted" || isStandaloneDisplay()) {
          setInstalled(true);
        }
        return "prompted";
      } catch {
        setDeferred(getDeferredInstallPrompt());
        return "manual";
      }
    }

    setPreparing(true);
    try {
      // Prefer an immediate "already installed" sheet over waiting when we
      // already know BIP cannot fire (prior accept / related apps).
      if (await detectInstalledRelatedApp()) {
        return "already-installed";
      }

      // SW activation + Chrome's installability check often need a beat
      // after first paint / first tap. Wait before falling back to the sheet.
      await navigator.serviceWorker?.ready.catch(() => undefined);
      const late = await waitForDeferredInstallPrompt(PROMPT_WAIT_MS);
      if (late) {
        try {
          // Gesture may already be gone on desktop; try anyway for Android.
          const outcome = await promptDeferredInstall(late);
          setDeferred(null);
          if (outcome === "accepted" || isStandaloneDisplay()) {
            setInstalled(true);
          }
          return "prompted";
        } catch {
          setDeferred(getDeferredInstallPrompt());
        }
      }

      // BIP never arrived — common when the PWA is already installed or Chrome
      // suppressed the event for this engagement window.
      if (wasPwaInstallRemembered() || (await detectInstalledRelatedApp())) {
        return "already-installed";
      }

      return "manual";
    } finally {
      setPreparing(false);
    }
  }, [deferred]);

  return {
    /** Already running as installed PWA — hide the install control. */
    installed,
    /** True when the native install prompt can be shown on click. */
    canPrompt: deferred !== null,
    /** True while waiting briefly for beforeinstallprompt after a tap. */
    preparing,
    isIos,
    requestInstall
  };
}
