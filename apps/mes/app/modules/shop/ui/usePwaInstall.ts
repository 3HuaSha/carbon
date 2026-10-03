import { useCallback, useEffect, useState } from "react";

/**
 * Chromium's deferred install prompt. Not in lib.dom yet everywhere we target.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
 * Shop PWA install affordance: capture `beforeinstallprompt` (Android Chrome)
 * and expose a click handler that either calls `prompt()` or signals the
 * caller to show manual Add-to-Home-Screen steps.
 */
export function usePwaInstall() {
  // Start false so SSR and the first client paint match; hide after mount
  // when already running as an installed PWA.
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    setIsIos(detectIos());

    if (isStandaloneDisplay()) {
      setInstalled(true);
      return;
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };

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

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    media.addEventListener?.("change", onDisplayMode);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener?.("change", onDisplayMode);
    };
  }, []);

  const requestInstall = useCallback(async (): Promise<
    "prompted" | "manual"
  > => {
    if (deferred) {
      try {
        await deferred.prompt();
        await deferred.userChoice;
      } catch {
        // User dismissed or browser rejected — still clear the deferred event.
      }
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
    isIos,
    requestInstall
  };
}
