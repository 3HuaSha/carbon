import { notFound } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { useCallback, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { userContext } from "~/context";
import {
  countShopStatuses,
  filterShopMachines,
  type ShopMachine,
  type ShopStatusFilter
} from "~/modules/shop";
import { getShopOverview } from "~/modules/shop/shop.server";
import {
  MachineDetailSheet,
  MachineGrid,
  ShopEmptyState,
  ShopHeader
} from "~/modules/shop/ui";

/**
 * Phone PWA machine overview. Lists every active work center at the session
 * location with status derived from open production events and maintenance
 * dispatches — the same signals as the desktop MES / wall displays.
 */
export async function loader({ context, request }: LoaderFunctionArgs) {
  const { companyId } = await requirePermissions(request, {});
  const locationId = context.get(userContext)?.locationId;
  if (!locationId) throw notFound("Location not found");

  const serviceRole = getCarbonServiceRole();
  const overview = await getShopOverview(serviceRole, {
    companyId,
    locationId
  });

  return overview;
}

export default function ShopIndexRoute() {
  const { locationName, machines } = useLoaderData<typeof loader>();
  const [filter, setFilter] = useState<ShopStatusFilter>("all");
  const [selected, setSelected] = useState<ShopMachine | null>(null);

  const counts = countShopStatuses(machines);
  const visible = filterShopMachines(machines, filter);

  const onSelect = useCallback((machine: ShopMachine) => {
    setSelected(machine);
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <ShopHeader
        locationName={locationName}
        total={machines.length}
        counts={counts}
        filter={filter}
        onFilterChange={setFilter}
      />

      {machines.length === 0 ? (
        <ShopEmptyState />
      ) : (
        <MachineGrid machines={visible} onSelect={onSelect} />
      )}

      <MachineDetailSheet
        machine={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
