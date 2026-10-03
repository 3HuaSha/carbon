import { useCallback, useEffect, useState } from "react";
import {
  type BeforeInstallPromptEvent,
  clearDeferredInstallPrompt,
  ensurePwaInstallCapture,
  getDeferredInstallPrompt,
  subscribeDeferredInstallPrompt,
  waitForDeferredInstallPrompt
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
    "prompted" | "manual"
  > => {
    ensurePwaInstallCapture();

    // iOS never gets beforeinstallprompt — skip the wait and show Safari steps.
    if (detectIos()) {
      return "manual";
    }

    let event = getDeferredInstallPrompt() ?? deferred;
    if (!event) {
      setPreparing(true);
      try {
        // SW activation + Chrome's installability check often need a beat
        // after first paint / first tap. Wait before falling back to the sheet.
        await navigator.serviceWorker?.ready.catch(() => undefined);
        event = await waitForDeferredInstallPrompt(PROMPT_WAIT_MS);
      } finally {
        setPreparing(false);
      }
    }

    if (event) {
      try {
        await event.prompt();
        await event.userChoice;
      } catch {
        // User dismissed or browser rejected — still clear the deferred event.
      }
      clearDeferredInstallPrompt();
      setDeferred(null);
      if (isStandaloneDisplay()) setInstalled(true);
      return "prompted";
    }

    return "manual";
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
