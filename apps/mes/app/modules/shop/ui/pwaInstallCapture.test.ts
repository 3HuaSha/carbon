import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("pwaInstallCapture", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubWindow() {
    const listeners = new Map<string, Set<EventListener>>();
    const map = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      }
    } as Storage;

    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        listeners.get(type)?.delete(listener);
      },
      localStorage
    });

    return { listeners, localStorage };
  }

  async function loadCapture() {
    const { listeners, localStorage } = stubWindow();
    const capture = await import("./pwaInstallCapture");
    capture.ensurePwaInstallCapture();
    return { capture, listeners, localStorage };
  }

  function fireBip(
    listeners: Map<string, Set<EventListener>>,
    event: {
      preventDefault: () => void;
      prompt: () => Promise<void>;
      userChoice: Promise<{
        outcome: "accepted" | "dismissed";
        platform: string;
      }>;
    }
  ) {
    for (const listener of listeners.get("beforeinstallprompt") ?? []) {
      listener(event as unknown as Event);
    }
  }

  it("stores beforeinstallprompt and notifies subscribers", async () => {
    const { capture, listeners } = await loadCapture();
    expect(capture.getDeferredInstallPrompt()).toBeNull();

    const seen: unknown[] = [];
    const unsubscribe = capture.subscribeDeferredInstallPrompt((event) => {
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

    const wait = capture.waitForDeferredInstallPrompt(5000);
    fireBip(listeners, fakeEvent);

    await expect(wait).resolves.toBe(fakeEvent);
    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    expect(capture.getDeferredInstallPrompt()).toBe(fakeEvent);
    expect(seen.at(-1)).toBe(fakeEvent);

    unsubscribe();
  });

  it("waitForDeferredInstallPrompt times out to null", async () => {
    const { capture } = await loadCapture();
    await expect(capture.waitForDeferredInstallPrompt(20)).resolves.toBeNull();
  });

  it("promptDeferredInstall clears only after user_choice and remembers accept", async () => {
    const { capture, listeners, localStorage } = await loadCapture();

    let resolveChoice!: (value: {
      outcome: "accepted" | "dismissed";
      platform: string;
    }) => void;
    const userChoice = new Promise<{
      outcome: "accepted" | "dismissed";
      platform: string;
    }>((resolve) => {
      resolveChoice = resolve;
    });

    const fakeEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn(async () => undefined),
      userChoice
    };
    fireBip(listeners, fakeEvent);
    expect(capture.getDeferredInstallPrompt()).toBe(fakeEvent);

    const pending = capture.promptDeferredInstall(
      fakeEvent as unknown as import("./pwaInstallCapture").BeforeInstallPromptEvent
    );
    // Still held until user_choice settles
    expect(capture.getDeferredInstallPrompt()).toBe(fakeEvent);

    resolveChoice({ outcome: "accepted", platform: "web" });
    await expect(pending).resolves.toBe("accepted");
    expect(capture.getDeferredInstallPrompt()).toBeNull();
    expect(capture.wasPwaInstallRemembered()).toBe(true);
    expect(localStorage.getItem(capture.PWA_INSTALLED_STORAGE_KEY)).toBe("1");
  });

  it("promptDeferredInstall clears after dismiss but does not remember install", async () => {
    const { capture, listeners, localStorage } = await loadCapture();

    const fakeEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({
        outcome: "dismissed" as const,
        platform: ""
      })
    };
    fireBip(listeners, fakeEvent);

    await expect(
      capture.promptDeferredInstall(
        fakeEvent as unknown as import("./pwaInstallCapture").BeforeInstallPromptEvent
      )
    ).resolves.toBe("dismissed");
    expect(capture.getDeferredInstallPrompt()).toBeNull();
    expect(capture.wasPwaInstallRemembered()).toBe(false);
    expect(localStorage.getItem(capture.PWA_INSTALLED_STORAGE_KEY)).toBeNull();
  });

  it("keeps deferred when prompt() throws before starting", async () => {
    const { capture, listeners } = await loadCapture();

    const fakeEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn(() => {
        throw new Error("no gesture");
      }),
      userChoice: Promise.resolve({
        outcome: "dismissed" as const,
        platform: ""
      })
    };
    fireBip(listeners, fakeEvent);

    await expect(
      capture.promptDeferredInstall(
        fakeEvent as unknown as import("./pwaInstallCapture").BeforeInstallPromptEvent
      )
    ).rejects.toThrow("no gesture");
    expect(capture.getDeferredInstallPrompt()).toBe(fakeEvent);
  });

  it("clears deferred when prompt() rejects after starting", async () => {
    const { capture, listeners } = await loadCapture();

    const fakeEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn(async () => {
        throw new Error("aborted");
      }),
      userChoice: Promise.resolve({
        outcome: "dismissed" as const,
        platform: ""
      })
    };
    fireBip(listeners, fakeEvent);

    await expect(
      capture.promptDeferredInstall(
        fakeEvent as unknown as import("./pwaInstallCapture").BeforeInstallPromptEvent
      )
    ).rejects.toThrow("aborted");
    expect(capture.getDeferredInstallPrompt()).toBeNull();
  });

  it("appinstalled clears deferred and remembers install", async () => {
    const { capture, listeners, localStorage } = await loadCapture();

    const fakeEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({
        outcome: "accepted" as const,
        platform: ""
      })
    };
    fireBip(listeners, fakeEvent);
    expect(capture.getDeferredInstallPrompt()).toBe(fakeEvent);

    for (const listener of listeners.get("appinstalled") ?? []) {
      listener(new Event("appinstalled"));
    }

    expect(capture.getDeferredInstallPrompt()).toBeNull();
    expect(localStorage.getItem(capture.PWA_INSTALLED_STORAGE_KEY)).toBe("1");
  });
});
