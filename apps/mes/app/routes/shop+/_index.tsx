import { assertIsPost, error, notFound, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { flash } from "@carbon/auth/session.server";
import { useCallback, useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData, useRevalidator } from "react-router";
import { userContext } from "~/context";
import {
  countShopStatuses,
  filterShopMachines,
  type ShopMachine,
  type ShopMaintenanceAction,
  type ShopStatusFilter,
  shopMaintenanceActions
} from "~/modules/shop";
import { runShopMaintenanceAction } from "~/modules/shop/shop.action.server";
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
 *
 * POST actions (ReportDowntime / Assign / Start / End / Complete) reuse the
 * same maintenance service writes as desktop, then revalidate this page.
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

  return overview;
}

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { companyId, userId } = await requirePermissions(request, {});

  const formData = await request.formData();
  const rawAction = String(formData.get("action") ?? "");
  const dispatchId = String(formData.get("dispatchId") ?? "") || null;
  const workCenterId = String(formData.get("workCenterId") ?? "") || null;
  const assigneeId = String(formData.get("assigneeId") ?? "") || null;

  if (!shopMaintenanceActions.includes(rawAction as ShopMaintenanceAction)) {
    return data(
      { ok: false as const },
      await flash(request, error(null, "Invalid maintenance action"))
    );
  }

  if (rawAction !== "ReportDowntime" && !dispatchId) {
    return data(
      { ok: false as const },
      await flash(request, error(null, "Invalid maintenance action"))
    );
  }

  if (rawAction === "ReportDowntime" && !workCenterId) {
    return data(
      { ok: false as const },
      await flash(request, error(null, "Work center is required"))
    );
  }

  const serviceRole = getCarbonServiceRole();
  const result = await runShopMaintenanceAction(serviceRole, {
    action: rawAction as ShopMaintenanceAction,
    dispatchId,
    workCenterId,
    assigneeId,
    companyId,
    userId
  });

  if (!result.ok) {
    return data(
      { ok: false as const },
      await flash(request, error(null, result.message))
    );
  }

  const flashMessage =
    result.telegramUnbound === true
      ? success(`${result.message} — 该员工未绑定 Telegram`)
      : result.warning
        ? error(null, result.message)
        : success(result.message);

  return data(
    {
      ok: true as const,
      action: result.action,
      telegramUnbound: result.telegramUnbound === true
    },
    await flash(request, flashMessage)
  );
}

export default function ShopIndexRoute() {
  const { locationName, machines, userId, people } =
    useLoaderData<typeof loader>();
  const [filter, setFilter] = useState<ShopStatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();

  const counts = countShopStatuses(machines);
  const visible = filterShopMachines(machines, filter);
  const selected =
    selectedId === null
      ? null
      : (machines.find((m) => m.id === selectedId) ?? null);

  const onSelect = useCallback((machine: ShopMachine) => {
    setSelectedId(machine.id);
  }, []);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

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
        userId={userId}
        people={people}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        fetcher={fetcher}
      />
    </div>
  );
}
