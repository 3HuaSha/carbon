import { notFound } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { userContext } from "~/context";
import { getShopCrewBoard } from "~/modules/shop/shop.server";
import { ShopCrewPage } from "~/modules/shop/ui/ShopCrewPage";

/**
 * Repair crew board (`/shop/repair`): employees whose employee type matches
 * 维修/机修 aliases, each with assigned incomplete maintenance dispatches.
 */
export async function loader({ context, request }: LoaderFunctionArgs) {
  const { companyId } = await requirePermissions(request, {});
  const locationId = context.get(userContext)?.locationId;
  if (!locationId) throw notFound("Location not found");

  const serviceRole = getCarbonServiceRole();
  return getShopCrewBoard(serviceRole, {
    companyId,
    locationId,
    crew: "repair"
  });
}

export default function ShopRepairRoute() {
  const board = useLoaderData<typeof loader>();
  return <ShopCrewPage board={board} />;
}
