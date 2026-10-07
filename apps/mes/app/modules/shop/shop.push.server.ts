/**
 * Lock-screen Web Push for the shop 提醒 feed (报修 / 报问题 / 已修好).
 *
 * Subscriptions live in Redis per company + location, next to the 提醒 feed
 * they mirror (see shop.alerts.server.ts) — every device that opted in at a
 * location gets the same pushes the shared bell shows. Redis is fail-soft, so
 * the client re-posts its subscription on every 提醒 visit; a flushed Redis
 * heals itself the next time each phone opens the page.
 */

import {
  WEB_PUSH_VAPID_PRIVATE_KEY,
  WEB_PUSH_VAPID_PUBLIC_KEY,
  WEB_PUSH_VAPID_SUBJECT
} from "@carbon/auth";
import { redis } from "@carbon/kv";
import { getLogger } from "@carbon/logger";
import { datetime } from "@carbon/utils";
import webpush from "web-push";
import { path } from "~/utils/path";
import type { ShopAlert } from "./shop.types";
import { shopAlertText } from "./shop.utils";

const logger = getLogger("mes", "shop-push");

const SUBSCRIPTION_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days, refreshed on visit
/** Push services drop a message nobody received within this window. */
const PUSH_TTL_SECONDS = 60 * 60 * 12;

export type ShopPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type StoredSubscription = {
  subscription: ShopPushSubscription;
  userId: string;
  updatedAt: string;
};

export function getShopPushPublicKey(): string | null {
  return WEB_PUSH_VAPID_PUBLIC_KEY && WEB_PUSH_VAPID_PRIVATE_KEY
    ? WEB_PUSH_VAPID_PUBLIC_KEY
    : null;
}

let vapidConfigured = false;
function ensureVapid(): boolean {
  const publicKey = WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(WEB_PUSH_VAPID_SUBJECT, publicKey, privateKey);
    vapidConfigured = true;
  }
  return true;
}

function locationKey(companyId: string, locationId: string) {
  return `shop:push:${companyId}:${locationId}`;
}

/** endpoint → the location hash it is stored in, so a move cleans up. */
function endpointKey(endpoint: string) {
  return `shop:pushEndpoint:${endpoint}`;
}

/** Validate an untrusted `PushSubscription.toJSON()` from the browser. */
export function parseShopPushSubscription(
  raw: unknown
): ShopPushSubscription | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const keys = r.keys as Record<string, unknown> | undefined;
  if (
    typeof r.endpoint !== "string" ||
    !r.endpoint.startsWith("https://") ||
    r.endpoint.length > 2048 ||
    !keys ||
    typeof keys.p256dh !== "string" ||
    typeof keys.auth !== "string" ||
    keys.p256dh.length > 256 ||
    keys.auth.length > 256
  ) {
    return null;
  }
  return {
    endpoint: r.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth }
  };
}

export async function saveShopPushSubscription(args: {
  companyId: string;
  locationId: string;
  userId: string;
  subscription: ShopPushSubscription;
}): Promise<void> {
  const { companyId, locationId, subscription } = args;
  const key = locationKey(companyId, locationId);
  const previous = await redis.get(endpointKey(subscription.endpoint));
  if (previous && previous !== key) {
    await redis.hdel(previous, subscription.endpoint);
  }

  const stored: StoredSubscription = {
    subscription,
    userId: args.userId,
    updatedAt: datetime.timestamp()
  };
  await Promise.all([
    redis.hset(key, subscription.endpoint, JSON.stringify(stored)),
    redis.expire(key, SUBSCRIPTION_TTL_SECONDS),
    redis.set(
      endpointKey(subscription.endpoint),
      key,
      "EX",
      SUBSCRIPTION_TTL_SECONDS
    )
  ]);
}

export async function removeShopPushSubscription(
  endpoint: string
): Promise<void> {
  const key = await redis.get(endpointKey(endpoint));
  await Promise.all([
    key ? redis.hdel(key, endpoint) : null,
    redis.del(endpointKey(endpoint))
  ]);
}

function parseStored(raw: string): StoredSubscription | null {
  try {
    const parsed = JSON.parse(raw) as StoredSubscription;
    return parseShopPushSubscription(parsed?.subscription) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Push one 提醒 row to every device subscribed at its location. Never throws:
 * a failed push must not fail the 报修 / 已修好 action that raised it.
 */
export async function sendShopAlertPush(args: {
  companyId: string;
  locationId: string;
  alert: ShopAlert;
}): Promise<void> {
  try {
    if (!ensureVapid()) return;
    const key = locationKey(args.companyId, args.locationId);
    const rows = (await redis.hvals(key))
      .map(parseStored)
      .filter((row): row is StoredSubscription => row !== null);
    if (rows.length === 0) return;

    const { title, detail } = shopAlertText(args.alert);
    const payload = JSON.stringify({
      title,
      body: detail,
      tag: args.alert.id,
      url: path.to.shopMachine(args.alert.workCenterId)
    });

    await Promise.all(
      rows.map(async ({ subscription }) => {
        try {
          await webpush.sendNotification(subscription, payload, {
            TTL: PUSH_TTL_SECONDS,
            timeout: 10_000,
            urgency: args.alert.kind === "down" ? "high" : "normal"
          });
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          // 404/410: the browser dropped this subscription — forget it.
          if (statusCode === 404 || statusCode === 410) {
            await removeShopPushSubscription(subscription.endpoint);
            return;
          }
          logger.warn("Web push send failed", {
            companyId: args.companyId,
            statusCode,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      })
    );
  } catch (err) {
    logger.warn("Web push fan-out failed", {
      companyId: args.companyId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
