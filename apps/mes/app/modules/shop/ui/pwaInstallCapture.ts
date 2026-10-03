/**
 * Early capture of Chromium's `beforeinstallprompt`.
 *
 * The event can fire as soon as the service worker is active — often before
 * React hydrates and `useEffect` listeners attach. Capture at module load
 * (from `entry.client.tsx`) and share the deferred event with the shop UI.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
 */

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Listener = (event: BeforeInstallPromptEvent | null) => void;

let deferred: BeforeInstallPromptEvent | null = null;
let capturing = false;
const listeners = new Set<Listener>();

export function ensurePwaInstallCapture(): void {
  if (typeof window === "undefined" || capturing) return;
  capturing = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    for (const listener of listeners) listener(deferred);
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    for (const listener of listeners) listener(null);
  });
}

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

export function clearDeferredInstallPrompt(): void {
  deferred = null;
  for (const listener of listeners) listener(null);
}

export function subscribeDeferredInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  listener(deferred);
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
