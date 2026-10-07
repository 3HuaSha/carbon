import { cn } from "@carbon/react";
import { useCallback, useEffect, useState } from "react";
import { LuBell, LuBellOff } from "react-icons/lu";
import { path } from "~/utils/path";
import { detectIos } from "./pwaPlatform";
import { shopIos } from "./shopIos";

type PushState =
  | "loading"
  | "needsHomeScreen"
  | "unsupported"
  | "denied"
  | "off"
  | "on";

function base64UrlToBuffer(value: string): ArrayBuffer {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return buffer;
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function postSubscription(
  intent: "subscribe" | "unsubscribe",
  subscription: PushSubscription
): Promise<boolean> {
  const response = await fetch(path.to.shopPush, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent, subscription: subscription.toJSON() })
  });
  return response.ok;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker
    .register("/serviceWorker.js", { scope: "/", updateViaCache: "none" })
    .catch(() => undefined);
  return navigator.serviceWorker.ready;
}

/**
 * 锁屏通知 opt-in for this device. Subscribes to the location's 提醒 feed;
 * permission is only ever requested from the button tap (iOS requires it).
 */
export function ShopPushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) {
        const ios = detectIos(
          navigator.userAgent,
          navigator.platform,
          navigator.maxTouchPoints
        );
        if (!cancelled) {
          setState(ios && !isStandalone() ? "needsHomeScreen" : "unsupported");
        }
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const registration = await getRegistration();
      const existing = await registration.pushManager.getSubscription();
      if (existing && Notification.permission === "granted") {
        // Re-sync: Redis is fail-soft and the location may have changed.
        await postSubscription("subscribe", existing).catch(() => false);
        if (!cancelled) setState("on");
        return;
      }
      if (!cancelled) setState("off");
    })().catch(() => {
      if (!cancelled) setState("unsupported");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await getRegistration();
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBuffer(publicKey)
        }));
      if (!(await postSubscription("subscribe", subscription))) {
        setError("保存失败，请稍后重试");
        return;
      }
      setState("on");
    } catch {
      setError("开启失败，请确认已从主屏幕图标打开并信任证书");
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await getRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await postSubscription("unsubscribe", subscription).catch(() => false);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setError("关闭失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }, []);

  if (state === "loading") return null;

  const hint =
    state === "needsHomeScreen"
      ? "iPhone 需先「添加到主屏幕」，再从主屏幕图标打开才能开启"
      : state === "unsupported"
        ? "此浏览器不支持锁屏通知"
        : state === "denied"
          ? "通知已被拒绝，请在系统设置里允许本应用通知"
          : state === "on"
            ? "报修、报问题、已修好会推送到锁屏"
            : "开启后报修、报问题、已修好会推送到锁屏";

  const actionable = state === "on" || state === "off";

  return (
    <div className="px-4 pb-2">
      <div className={cn("flex items-center gap-3 px-4 py-3", shopIos.inset)}>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white",
            state === "on"
              ? "bg-[color:var(--shop-run)]"
              : "bg-[color:var(--shop-muted)]"
          )}
        >
          {state === "on" ? (
            <LuBell className="h-[18px] w-[18px]" />
          ) : (
            <LuBellOff className="h-[18px] w-[18px]" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-medium leading-tight">
            锁屏通知{state === "on" ? "已开启" : ""}
          </span>
          <span className={cn("text-[13px]", shopIos.muted)}>
            {error ?? hint}
          </span>
        </span>
        {actionable ? (
          <button
            type="button"
            disabled={busy}
            onClick={state === "on" ? disable : enable}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-[14px] font-medium disabled:opacity-50",
              state === "on"
                ? "bg-[color:var(--shop-track)]"
                : "bg-[color:var(--shop-run)] text-white",
              shopIos.press
            )}
          >
            {busy ? "…" : state === "on" ? "关闭" : "开启"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
