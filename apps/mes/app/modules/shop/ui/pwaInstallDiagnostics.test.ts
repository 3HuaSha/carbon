import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("pwaInstallDiagnostics", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("logs once per session and includes SW + BIP signals", async () => {
    const info = vi.fn();
    const session = new Map<string, string>();
    vi.stubGlobal("console", { ...console, info });
    vi.stubGlobal("navigator", {
      userAgent: "Android Chrome Test",
      serviceWorker: {
        controller: { scriptURL: "https://mes.example/serviceWorker.js" }
      },
      getInstalledRelatedApps: async () => [{ platform: "webapp", id: "/shop" }]
    });
    vi.stubGlobal("window", {
      location: { href: "https://mes.example/shop" },
      matchMedia: () => ({ matches: false }),
      sessionStorage: {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => {
          session.set(key, value);
        }
      },
      __carbonMesPwa: { deferred: null, capturing: true }
    });

    const { logPwaInstallDiagnosticsOnce } = await import(
      "./pwaInstallDiagnostics"
    );

    const first = await logPwaInstallDiagnosticsOnce({
      rememberedInstalled: false
    });
    expect(first).toMatchObject({
      bipDeferred: false,
      swController: "https://mes.example/serviceWorker.js",
      relatedAppsCount: 1,
      rememberedInstalled: false
    });
    expect(info).toHaveBeenCalledTimes(1);

    const second = await logPwaInstallDiagnosticsOnce();
    expect(second).toBeNull();
    expect(info).toHaveBeenCalledTimes(1);
  });
});
