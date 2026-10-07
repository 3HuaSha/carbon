import { notFound } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { userContext } from "~/context";
import {
  listShopAlerts,
  markShopAlertsSeen
} from "~/modules/shop/shop.alerts.server";
import { getShopPushPublicKey } from "~/modules/shop/shop.push.server";
import { ShopAlertsPage } from "~/modules/shop/ui/ShopAlertsPage";

/**
 * `/shop/alerts` — 提醒 list for downtime / recovery transitions.
 * Visiting marks the bell unread badge as seen (Redis).
 */
export async function loader({ context, request }: LoaderFunctionArgs) {
  const { companyId } = await requirePermissions(request, {});
  const locationId = context.get(userContext)?.locationId;
  if (!locationId) throw notFound("Location not found");

  const serviceRole = getCarbonServiceRole();
  const [alerts, locationResult] = await Promise.all([
    listShopAlerts({ companyId, locationId }),
    serviceRole
      .from("location")
      .select("name")
      .eq("id", locationId)
      .eq("companyId", companyId)
      .maybeSingle(),
    markShopAlertsSeen({ companyId, locationId })
  ]);

  return {
    alerts,
    locationName: locationResult.data?.name ?? null,
    pushPublicKey: getShopPushPublicKey()
  };
}

export default function ShopAlertsRoute() {
  const { alerts, locationName, pushPublicKey } =
    useLoaderData<typeof loader>();
  return (
    <ShopAlertsPage
      alerts={alerts}
      locationName={locationName}
      pushPublicKey={pushPublicKey}
    />
  );
}
