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
import { logPwaInstallDiagnosticsOnce } from "./pwaInstallDiagnostics";
import {
  classifyPwaClient,
  detectAndroid,
  detectInAppBrowser,
  detectIos,
  detectLikelyPhone,
  getServiceWorkerControllerUrl,
  type PwaClientPlatform
} from "./pwaPlatform";

/** Desktop Chrome: short wait — prefer fast already-installed / Open app UX. */
const PROMPT_WAIT_DESKTOP_MS = 2800;
/** Android: SW claim + installability check is slower on cellular. */
const PROMPT_WAIT_MOBILE_MS = 5500;

export type PwaInstallResult =
  | "prompted"
  | "manual"
  | "already-installed"
  | "in-app-browser"
  /** BIP arrived after an async wait — user must tap Install again (gesture). */
  | "ready-retry";

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function readPlatform(): PwaClientPlatform {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return "desktop";
  }
  return classifyPwaClient({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    maxWidthMatches: window.matchMedia("(max-width: 900px)").matches
  });
}

function isPhoneClient(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }
  return detectLikelyPhone(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
    window.matchMedia("(max-width: 900px)").matches
  );
}

/**
 * Detect whether Chromium already installed this origin as an app while the
 * user is still in a normal browser tab (not `display-mode: standalone`).
 * Requires `related_applications` → platform `webapp` in the manifest.
 */
async function detectInstalledRelatedApp(): Promise<boolean> {
  if (wasPwaInstallRemembered()) return true;
  try {
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<
        Array<{ platform: string; id?: string; url?: string }>
      >;
    };
    if (typeof nav.getInstalledRelatedApps !== "function") return false;
    const apps = await nav.getInstalledRelatedApps();
    // Prefer an explicit webapp hit; any related app still means BIP won't help.
    const installed =
      apps.some((app) => app.platform === "webapp") || apps.length > 0;
    if (installed) {
      rememberPwaInstalled();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function logNoBipDiagnostics(rememberedInstalled: boolean): void {
  void logPwaInstallDiagnosticsOnce({ rememberedInstalled });
}

async function ensureServiceWorkerReady(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  try {
    // Re-register on Install path so a stuck registration can activate.
    await navigator.serviceWorker.register("/serviceWorker.js", {
      scope: "/",
      updateViaCache: "none"
    });
  } catch {
    // Best-effort.
  }
  await navigator.serviceWorker.ready.catch(() => undefined);
}

/**
 * Shop PWA install affordance: read the early-captured `beforeinstallprompt`
 * (Android Chrome) and expose a click handler that calls `prompt()` only while
 * the user gesture is still valid. Never call prompt() after an await wait.
 */
export function usePwaInstall() {
  const [installed, setInstalled] = useState(false);
  /** Browser tab, but Chromium already has this origin installed (BIP won't fire). */
  const [knownInstalled, setKnownInstalled] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [platform, setPlatform] = useState<PwaClientPlatform>("desktop");
  const [isIos, setIsIos] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [preparing, setPreparing] = useState(false);
  /** Background BIP wait finished with no event — next tap opens diagnostics immediately. */
  const [bipWaitExhausted, setBipWaitExhausted] = useState(false);
  const [swControllerUrl, setSwControllerUrl] = useState<string | null>(null);
  const [readyRetry, setReadyRetry] = useState(false);

  useEffect(() => {
    ensurePwaInstallCapture();
    const clientPlatform = readPlatform();
    setPlatform(clientPlatform);
    setIsIos(
      detectIos(
        navigator.userAgent,
        navigator.platform,
        navigator.maxTouchPoints
      )
    );
    setIsAndroid(detectAndroid(navigator.userAgent));
    setIsInAppBrowser(detectInAppBrowser(navigator.userAgent));
    setSwControllerUrl(getServiceWorkerControllerUrl());

    if (isStandaloneDisplay()) {
      setInstalled(true);
      return;
    }

    setDeferred(getDeferredInstallPrompt());
    const unsubscribe = subscribeDeferredInstallPrompt((event) => {
      setDeferred(event);
      if (event) {
        setKnownInstalled(false);
        setBipWaitExhausted(false);
        setReadyRetry(false);
      }
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

    const onControllerChange = () => {
      setSwControllerUrl(getServiceWorkerControllerUrl());
    };
    navigator.serviceWorker?.addEventListener?.(
      "controllerchange",
      onControllerChange
    );

    let cancelled = false;
    const phone = isPhoneClient();

    void (async () => {
      // Desktop: fast Open-app path when already installed.
      // Android: also check related apps (manifest related_applications) so we
      // do not wait forever for a BIP that will never come.
      if (await detectInstalledRelatedApp()) {
        if (!cancelled && !getDeferredInstallPrompt()) {
          setKnownInstalled(true);
          setBipWaitExhausted(true);
        }
        return;
      }

      if (
        detectIos(
          navigator.userAgent,
          navigator.platform,
          navigator.maxTouchPoints
        )
      ) {
        return;
      }
      if (detectInAppBrowser(navigator.userAgent)) {
        setBipWaitExhausted(true);
        return;
      }

      await ensureServiceWorkerReady();
      if (cancelled) return;
      setSwControllerUrl(getServiceWorkerControllerUrl());

      const late = await waitForDeferredInstallPrompt(
        phone ? PROMPT_WAIT_MOBILE_MS : PROMPT_WAIT_DESKTOP_MS
      );
      if (cancelled) return;
      if (late) {
        setDeferred(late);
        return;
      }

      if (wasPwaInstallRemembered() || (await detectInstalledRelatedApp())) {
        setKnownInstalled(true);
        setBipWaitExhausted(true);
        return;
      }

      setBipWaitExhausted(true);
      logNoBipDiagnostics(wasPwaInstallRemembered());
      // Desktop only: treat no-BIP as already-installed for Open app UX.
      if (!phone) {
        setKnownInstalled(true);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener?.("change", onDisplayMode);
      navigator.serviceWorker?.removeEventListener?.(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  const requestInstall = useCallback(async (): Promise<PwaInstallResult> => {
    ensurePwaInstallCapture();
    setReadyRetry(false);

    if (detectInAppBrowser(navigator.userAgent)) {
      return "in-app-browser";
    }

    // iOS never gets beforeinstallprompt — skip the wait and show Safari steps.
    if (
      detectIos(
        navigator.userAgent,
        navigator.platform,
        navigator.maxTouchPoints
      )
    ) {
      return "manual";
    }

    const phone = isPhoneClient();

    // Desktop Open app path (no BIP expected).
    if (knownInstalled || (!phone && wasPwaInstallRemembered())) {
      return "already-installed";
    }

    // CRITICAL: prompt() must run with no await beforehand (user gesture).
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

    // BIP never arrived after background wait — open diagnostics immediately.
    if (bipWaitExhausted) {
      setSwControllerUrl(getServiceWorkerControllerUrl());
      logNoBipDiagnostics(wasPwaInstallRemembered());
      if (wasPwaInstallRemembered() || (await detectInstalledRelatedApp())) {
        setKnownInstalled(true);
        return "already-installed";
      }
      return "manual";
    }

    setPreparing(true);
    try {
      await ensureServiceWorkerReady();
      setSwControllerUrl(getServiceWorkerControllerUrl());

      if (await detectInstalledRelatedApp()) {
        setKnownInstalled(true);
        setBipWaitExhausted(true);
        return "already-installed";
      }

      const late = await waitForDeferredInstallPrompt(
        phone ? PROMPT_WAIT_MOBILE_MS : PROMPT_WAIT_DESKTOP_MS
      );

      // Gesture is gone after await — do NOT call prompt(). Ask for a second tap.
      if (late) {
        setDeferred(late);
        setReadyRetry(true);
        setBipWaitExhausted(false);
        return "ready-retry";
      }

      setBipWaitExhausted(true);
      logNoBipDiagnostics(wasPwaInstallRemembered());

      if (wasPwaInstallRemembered() || (await detectInstalledRelatedApp())) {
        setKnownInstalled(true);
        return "already-installed";
      }

      if (!phone) {
        setKnownInstalled(true);
        return "already-installed";
      }
      return "manual";
    } finally {
      setPreparing(false);
    }
  }, [deferred, knownInstalled, bipWaitExhausted]);

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
    /** BIP arrived after wait — label should say tap Install again. */
    readyRetry,
    /** Background/install wait concluded without BIP. */
    bipWaitExhausted,
    /** Active SW controller script URL, or null if page is not controlled. */
    swControllerUrl,
    platform,
    isIos,
    isAndroid,
    isInAppBrowser,
    requestInstall,
    openInstalledApp
  };
}
