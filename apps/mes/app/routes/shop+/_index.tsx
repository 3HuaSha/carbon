import { notFound } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { useInterval } from "@carbon/react";
import { useCallback, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useRevalidator } from "react-router";
import { userContext } from "~/context";
import {
  countShopStatuses,
  filterShopMachines,
  type ShopMachine,
  type ShopStatusFilter
} from "~/modules/shop";
import { syncShopAlertsForOverview } from "~/modules/shop/shop.alerts.server";
import { getShopOverview } from "~/modules/shop/shop.server";
import { MachineGrid, ShopEmptyState, ShopHeader } from "~/modules/shop/ui";
import { path } from "~/utils/path";

/** Poll so shared PWAs pick up Telegram / other-device status transitions. */
const SHOP_POLL_MS = 20_000;

/**
 * Phone PWA machine overview. Lists every active work center at the session
 * location with status derived from open production events and maintenance
 * dispatches. Tap a tile → `/shop/:workCenterId` detail page.
 */
export async function loader({ context, request }: LoaderFunctionArgs) {
  const { companyId, userId } = await requirePermissions(request, {});
  const locationId = context.get(userContext)?.locationId;
  if (!locationId) throw notFound("Location not found");

  const serviceRole = getCarbonServiceRole();
  const overview = await getShopOverview(serviceRole, {
    companyId,
    locationId,
    userId
  });

  const synced = await syncShopAlertsForOverview({
    companyId,
    locationId,
    machines: overview.machines,
    meterPhysicalByWorkCenterId: new Map(
      Object.entries(overview.meterPhysicalByWorkCenterId ?? {})
    )
  });

  return {
    ...overview,
    machines: synced.machines,
    alertUnreadCount: synced.unreadCount
  };
}

export default function ShopIndexRoute() {
  const { locationName, machines, alertUnreadCount } =
    useLoaderData<typeof loader>();
  const [filter, setFilter] = useState<ShopStatusFilter>("all");
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  useInterval(() => {
    if (revalidator.state === "idle") revalidator.revalidate();
  }, SHOP_POLL_MS);

  const counts = countShopStatuses(machines);
  const visible = filterShopMachines(machines, filter);

  const onSelect = useCallback(
    (machine: ShopMachine) => {
      navigate(path.to.shopMachine(machine.id));
    },
    [navigate]
  );

  return (
    <div className="shop-ios-page-enter mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <ShopHeader
        locationName={locationName}
        total={machines.length}
        counts={counts}
        filter={filter}
        onFilterChange={setFilter}
        alertUnreadCount={alertUnreadCount}
      />

      {machines.length === 0 ? (
        <ShopEmptyState />
      ) : (
        <MachineGrid machines={visible} onSelect={onSelect} />
      )}
    </div>
  );
}
