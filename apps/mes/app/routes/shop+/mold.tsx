import { notFound } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { userContext } from "~/context";
import { getShopCrewBoard } from "~/modules/shop/shop.server";
import { ShopCrewPage } from "~/modules/shop/ui/ShopCrewPage";

/**
 * Mold-room crew board (`/shop/mold`): employees whose employee type matches
 * 模房 aliases, each with assigned incomplete maintenance dispatches.
 */
export async function loader({ context, request }: LoaderFunctionArgs) {
  const { companyId } = await requirePermissions(request, {});
  const locationId = context.get(userContext)?.locationId;
  if (!locationId) throw notFound("Location not found");

  const serviceRole = getCarbonServiceRole();
  return getShopCrewBoard(serviceRole, {
    companyId,
    locationId,
    crew: "mold"
  });
}

export default function ShopMoldRoute() {
  const board = useLoaderData<typeof loader>();
  return <ShopCrewPage board={board} />;
}
