import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("pwaInstallCapture", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores beforeinstallprompt and notifies subscribers", async () => {
    const listeners = new Map<string, Set<EventListener>>();
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        listeners.get(type)?.delete(listener);
      }
    });

    const {
      ensurePwaInstallCapture,
      getDeferredInstallPrompt,
      subscribeDeferredInstallPrompt,
      waitForDeferredInstallPrompt
    } = await import("./pwaInstallCapture");

    ensurePwaInstallCapture();
    expect(getDeferredInstallPrompt()).toBeNull();

    const seen: unknown[] = [];
    const unsubscribe = subscribeDeferredInstallPrompt((event) => {
      seen.push(event);
    });
    expect(seen).toEqual([null]);

    const fakeEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({
        outcome: "accepted" as const,
        platform: ""
      })
    };

    const wait = waitForDeferredInstallPrompt(5000);
    for (const listener of listeners.get("beforeinstallprompt") ?? []) {
      listener(fakeEvent as unknown as Event);
    }

    await expect(wait).resolves.toBe(fakeEvent);
    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    expect(getDeferredInstallPrompt()).toBe(fakeEvent);
    expect(seen.at(-1)).toBe(fakeEvent);

    unsubscribe();
  });

  it("waitForDeferredInstallPrompt times out to null", async () => {
    vi.stubGlobal("window", {
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    });

    const { ensurePwaInstallCapture, waitForDeferredInstallPrompt } =
      await import("./pwaInstallCapture");
    ensurePwaInstallCapture();

    await expect(waitForDeferredInstallPrompt(20)).resolves.toBeNull();
  });
});
