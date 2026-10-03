/**
 * Early capture of Chromium's `beforeinstallprompt`.
 *
 * The event can fire as soon as the service worker is active — often before
 * React hydrates and `useEffect` listeners attach. Capture at module load
 * (from `entry.client.tsx`) and share the deferred event with the shop UI.
 *
 * An even earlier listener + SW registration runs from an inline <head>
 * script (`pwaBootstrapSnippet.ts` via `root.tsx`) so Android Chrome does not
 * miss BIP while the entry.client bundle is still downloading.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
 */

import { PWA_BOOTSTRAP_WINDOW_KEY } from "./pwaBootstrapSnippet";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Listener = (event: BeforeInstallPromptEvent | null) => void;

type EarlyPwaBridge = {
  deferred: BeforeInstallPromptEvent | null;
  capturing: boolean;
};

/** Persists across reloads in this browser profile after a successful install. */
export const PWA_INSTALLED_STORAGE_KEY = "carbon-mes-pwa-installed";

let deferred: BeforeInstallPromptEvent | null = null;
let capturing = false;
const listeners = new Set<Listener>();

function notify(event: BeforeInstallPromptEvent | null): void {
  for (const listener of listeners) listener(event);
}

function getEarlyBridge(): EarlyPwaBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { [PWA_BOOTSTRAP_WINDOW_KEY]?: EarlyPwaBridge })[
    PWA_BOOTSTRAP_WINDOW_KEY
  ];
}

function syncEarlyBridge(event: BeforeInstallPromptEvent | null): void {
  const bridge = getEarlyBridge();
  if (bridge) bridge.deferred = event;
}

function forgetPwaInstalled(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PWA_INSTALLED_STORAGE_KEY);
  } catch {
    // Private mode / quota — ignore.
  }
}

export function rememberPwaInstalled(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, "1");
  } catch {
    // Private mode / quota — ignore.
  }
}

export function wasPwaInstallRemembered(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PWA_INSTALLED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function storeDeferred(event: BeforeInstallPromptEvent): void {
  // BIP proves Chromium still considers the origin installable — drop any
  // stale "already installed" memory from a prior accept/uninstall cycle.
  forgetPwaInstalled();
  deferred = event;
  syncEarlyBridge(event);
  notify(deferred);
}

export function ensurePwaInstallCapture(): void {
  if (typeof window === "undefined") return;

  // Adopt an event captured by the <head> bootstrap before this module ran.
  const early = getEarlyBridge()?.deferred;
  if (early && !deferred) {
    storeDeferred(early);
  }

  if (capturing) return;
  capturing = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    storeDeferred(event as BeforeInstallPromptEvent);
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    syncEarlyBridge(null);
    rememberPwaInstalled();
    notify(null);
  });
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  if (!deferred) {
    const early = getEarlyBridge()?.deferred;
    if (early) {
      deferred = early;
    }
  }
  return deferred;
}

/**
 * Drop a deferred prompt only after `prompt()` + `user_choice`, or when the
 * app is installed. Do not clear merely because the help sheet opened.
 */
export function clearDeferredInstallPrompt(): void {
  deferred = null;
  syncEarlyBridge(null);
  notify(null);
}

/**
 * Call from a user-gesture handler with no `await` beforehand.
 * Invokes `prompt()` synchronously, then clears the deferred event only after
 * `userChoice` resolves (accepted or dismissed). If `prompt()` throws before
 * the browser accepts the call, the deferred event is left in place for retry.
 */
export async function promptDeferredInstall(
  event: BeforeInstallPromptEvent
): Promise<"accepted" | "dismissed"> {
  let promptStarted = false;
  try {
    const promptPromise = event.prompt();
    promptStarted = true;
    await promptPromise;
    const { outcome } = await event.userChoice;
    clearDeferredInstallPrompt();
    if (outcome === "accepted") {
      rememberPwaInstalled();
    }
    return outcome;
  } catch (error) {
    if (promptStarted) {
      // Chromium consumes the event once prompt() is entered.
      clearDeferredInstallPrompt();
    }
    throw error;
  }
}

export function subscribeDeferredInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  listener(getDeferredInstallPrompt());
  return () => {
    listeners.delete(listener);
  };
}

/** Wait until a deferred prompt is available, or `timeoutMs` elapses. */
export function waitForDeferredInstallPrompt(
  timeoutMs: number
): Promise<BeforeInstallPromptEvent | null> {
  const existing = getDeferredInstallPrompt();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;

    const unsubscribe = subscribeDeferredInstallPrompt((event) => {
      if (!event || settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(event);
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve(getDeferredInstallPrompt());
    }, timeoutMs);
  });
}
