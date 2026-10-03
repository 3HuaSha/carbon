/**
 * Device / browser classification for MES shop PWA install UX.
 * Android Chrome can get beforeinstallprompt; iOS and in-app WebViews cannot.
 */

export type PwaClientPlatform =
  | "ios"
  | "android-chrome"
  | "android-webview"
  | "desktop"
  | "unknown-mobile";

export function detectIos(
  userAgent = "",
  platform = "",
  maxTouchPoints = 0
): boolean {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return true;
  // iPadOS 13+ reports as MacIntel but has touch
  return platform === "MacIntel" && maxTouchPoints > 1;
}

export function detectAndroid(userAgent = ""): boolean {
  return /Android/i.test(userAgent);
}

/**
 * WeChat / QQ / UC / Facebook / Instagram / Line / Android `wv` WebViews.
 * These never expose a real beforeinstallprompt — user must open system Chrome/Safari.
 */
export function detectInAppBrowser(userAgent = ""): boolean {
  return (
    /MicroMessenger/i.test(userAgent) ||
    /QQ\//i.test(userAgent) ||
    /UCBrowser|UCWEB/i.test(userAgent) ||
    /FBAN|FBAV|Instagram|Line\//i.test(userAgent) ||
    /; wv\)/i.test(userAgent)
  );
}

export function detectLikelyPhone(
  userAgent = "",
  platform = "",
  maxTouchPoints = 0,
  maxWidthMatches = false
): boolean {
  if (detectIos(userAgent, platform, maxTouchPoints)) return true;
  if (detectAndroid(userAgent)) return true;
  return maxTouchPoints > 0 && maxWidthMatches;
}

export function classifyPwaClient(input: {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  maxWidthMatches?: boolean;
}): PwaClientPlatform {
  const ua = input.userAgent ?? "";
  const platform = input.platform ?? "";
  const maxTouchPoints = input.maxTouchPoints ?? 0;
  const maxWidthMatches = input.maxWidthMatches ?? false;

  if (detectIos(ua, platform, maxTouchPoints)) return "ios";
  if (detectAndroid(ua)) {
    return detectInAppBrowser(ua) ? "android-webview" : "android-chrome";
  }
  if (detectLikelyPhone(ua, platform, maxTouchPoints, maxWidthMatches)) {
    return "unknown-mobile";
  }
  return "desktop";
}

/** Read whether this document is controlled by an active service worker. */
export function getServiceWorkerControllerUrl(): string | null {
  if (typeof navigator === "undefined") return null;
  return navigator.serviceWorker?.controller?.scriptURL ?? null;
}
