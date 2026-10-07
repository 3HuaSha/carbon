import { assertIsPost, notFound } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { userContext } from "~/context";
import {
  getShopPushPublicKey,
  parseShopPushSubscription,
  removeShopPushSubscription,
  saveShopPushSubscription
} from "~/modules/shop/shop.push.server";

/**
 * `POST /shop/push` — JSON `{ intent: "subscribe" | "unsubscribe", subscription }`.
 * Company + location come from the session, never the body, so a device only
 * ever receives its own location's 提醒.
 */
export async function action({ context, request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { companyId, userId } = await requirePermissions(request, {});
  const locationId = context.get(userContext)?.locationId;
  if (!locationId) throw notFound("Location not found");

  const body = (await request.json().catch(() => null)) as {
    intent?: unknown;
    subscription?: unknown;
  } | null;
  const subscription = parseShopPushSubscription(body?.subscription);
  if (!subscription) {
    return data({ ok: false, error: "Invalid subscription" }, { status: 400 });
  }

  if (body?.intent === "unsubscribe") {
    await removeShopPushSubscription(subscription.endpoint);
    return { ok: true };
  }

  if (body?.intent !== "subscribe") {
    return data({ ok: false, error: "Invalid intent" }, { status: 400 });
  }
  if (!getShopPushPublicKey()) {
    return data({ ok: false, error: "Push is not configured" }, { status: 503 });
  }

  await saveShopPushSubscription({
    companyId,
    locationId,
    userId,
    subscription
  });
  return { ok: true };
}
