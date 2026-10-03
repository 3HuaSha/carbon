/**
 * One-shot client diagnostics when Android Chrome never delivers
 * `beforeinstallprompt` despite an active controlling service worker.
 * Logged to console for field support (chrome://inspect / remote debugging).
 */

import { PWA_BOOTSTRAP_WINDOW_KEY } from "./pwaBootstrapSnippet";
import { getDeferredInstallPrompt } from "./pwaInstallCapture";
import { getServiceWorkerControllerUrl } from "./pwaPlatform";

const SESSION_KEY = "carbon-mes-pwa-diag-v1";

export type PwaInstallDiagnosticsSnapshot = {
  at: string;
  href: string;
  displayModeStandalone: boolean;
  bipDeferred: boolean;
  earlyBridgeDeferred: boolean;
  swController: string | null;
  relatedAppsCount: number | null;
  relatedAppsError: string | null;
  rememberedInstalled: boolean;
  userAgent: string;
};

function readEarlyBridgeDeferred(): boolean {
  if (typeof window === "undefined") return false;
  const bridge = (
    window as Window & {
      [PWA_BOOTSTRAP_WINDOW_KEY]?: { deferred: unknown };
    }
  )[PWA_BOOTSTRAP_WINDOW_KEY];
  return Boolean(bridge?.deferred);
}

async function relatedAppsProbe(): Promise<{
  count: number | null;
  error: string | null;
}> {
  try {
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ platform: string }>>;
    };
    if (typeof nav.getInstalledRelatedApps !== "function") {
      return { count: null, error: "unsupported" };
    }
    const apps = await nav.getInstalledRelatedApps();
    return { count: apps.length, error: null };
  } catch (error) {
    return {
      count: null,
      error: error instanceof Error ? error.message : "unknown"
    };
  }
}

/**
 * Log installability signals once per tab session. Safe to call from the
 * Install path when BIP wait is exhausted.
 */
export async function logPwaInstallDiagnosticsOnce(input?: {
  rememberedInstalled?: boolean;
}): Promise<PwaInstallDiagnosticsSnapshot | null> {
  if (typeof window === "undefined") return null;
  try {
    if (window.sessionStorage.getItem(SESSION_KEY) === "1") return null;
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // Private mode — still log once this call.
  }

  const related = await relatedAppsProbe();
  const snapshot: PwaInstallDiagnosticsSnapshot = {
    at: new Date().toISOString(),
    href: window.location.href,
    displayModeStandalone: window.matchMedia("(display-mode: standalone)")
      .matches,
    bipDeferred: getDeferredInstallPrompt() !== null,
    earlyBridgeDeferred: readEarlyBridgeDeferred(),
    swController: getServiceWorkerControllerUrl(),
    relatedAppsCount: related.count,
    relatedAppsError: related.error,
    rememberedInstalled: Boolean(input?.rememberedInstalled),
    userAgent: navigator.userAgent
  };

  // Support-facing: visible in remote Chrome inspect without shipping telemetry.
  console.info("[carbon-mes-pwa]", snapshot);
  return snapshot;
}
