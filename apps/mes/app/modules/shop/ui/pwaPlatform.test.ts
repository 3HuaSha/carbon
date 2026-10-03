import { describe, expect, it } from "vitest";
import {
  classifyPwaClient,
  detectAndroid,
  detectInAppBrowser,
  detectIos
} from "./pwaPlatform";

describe("pwaPlatform", () => {
  it("detects iPhone / iPadOS", () => {
    expect(
      detectIos(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
      )
    ).toBe(true);
    expect(
      detectIos(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "MacIntel",
        5
      )
    ).toBe(true);
  });

  it("detects Android Chrome vs WeChat / UC WebViews", () => {
    const chromeUa =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
    expect(detectAndroid(chromeUa)).toBe(true);
    expect(detectInAppBrowser(chromeUa)).toBe(false);
    expect(classifyPwaClient({ userAgent: chromeUa })).toBe("android-chrome");

    const wechat =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.0";
    expect(detectInAppBrowser(wechat)).toBe(true);
    expect(classifyPwaClient({ userAgent: wechat })).toBe("android-webview");

    const uc =
      "Mozilla/5.0 (Linux; U; Android 14; zh-CN; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 UCBrowser/13.0.0.0 Mobile Safari/537.36";
    expect(detectInAppBrowser(uc)).toBe(true);
  });

  it("detects Android wv WebView token", () => {
    const wv =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36";
    expect(detectInAppBrowser(wv)).toBe(true);
    expect(classifyPwaClient({ userAgent: wv })).toBe("android-webview");
  });
});
