import type { Database } from "@carbon/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openDispatchStatuses } from "~/utils/display";
import type { ShopMachine, ShopOpenDispatch, ShopOverview } from "./shop.types";
import { deriveShopMachineStatus, shopMachineSubtitle } from "./shop.utils";

const DISPATCH_COLUMNS =
  "id, maintenanceDispatchId, status, oeeImpact, priority, assignee, workCenterId";

/**
 * One aggregation for the `/shop` machine grid: location work centers, open
 * production events, and open maintenance dispatches. No per-machine queries.
 */
export async function getShopOverview(
  client: SupabaseClient<Database>,
  args: { companyId: string; locationId: string }
): Promise<ShopOverview> {
  const [workCentersResult, locationResult] = await Promise.all([
    client
      .from("workCenters")
      .select(
        "id, name, description, processes, departmentName, locationName, companyId"
      )
      .eq("companyId", args.companyId)
      .eq("locationId", args.locationId)
      .eq("active", true)
      .order("name", { ascending: true }),
    client
      .from("location")
      .select("id, name")
      .eq("id", args.locationId)
      .eq("companyId", args.companyId)
      .maybeSingle()
  ]);

  if (workCentersResult.error) throw workCentersResult.error;
  if (locationResult.error) throw locationResult.error;

  const workCenters = (workCentersResult.data ?? []).filter(
    (wc): wc is typeof wc & { id: string } => typeof wc.id === "string"
  );
  const workCenterIds = workCenters.map((wc) => wc.id);

  if (workCenterIds.length === 0) {
    return {
      locationId: args.locationId,
      locationName: locationResult.data?.name ?? null,
      machines: []
    };
  }

  const [blockingResult, eventsResult, dispatchesResult] = await Promise.all([
    client
      .from("workCentersWithBlockingStatus")
      .select("id, isBlocked")
      .eq("companyId", args.companyId)
      .in("id", workCenterIds),
    client
      .from("productionEvent")
      .select(
        `
        id,
        workCenterId,
        startTime,
        jobOperation:jobOperationId (
          job:jobId (
            jobId
          )
        )
      `
      )
      .eq("companyId", args.companyId)
      .in("workCenterId", workCenterIds)
      .is("endTime", null)
      .order("startTime", { ascending: true }),
    client
      .from("maintenanceDispatch")
      .select(DISPATCH_COLUMNS)
      .eq("companyId", args.companyId)
      .in("workCenterId", workCenterIds)
      .in("status", [...openDispatchStatuses])
  ]);

  if (blockingResult.error) throw blockingResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (dispatchesResult.error) throw dispatchesResult.error;

  const blockedById = new Map(
    (blockingResult.data ?? []).map((row) => [row.id!, row.isBlocked ?? false])
  );

  const eventsByWorkCenter = new Map<
    string,
    { jobReadableId: string | null }[]
  >();
  for (const row of (eventsResult.data ?? []) as any[]) {
    const workCenterId = row.workCenterId as string;
    const list = eventsByWorkCenter.get(workCenterId) ?? [];
    const job = row.jobOperation?.job ?? {};
    list.push({ jobReadableId: job.jobId ?? null });
    eventsByWorkCenter.set(workCenterId, list);
  }

  const dispatchesByWorkCenter = new Map<string, any[]>();
  const assigneeIds = new Set<string>();
  for (const row of dispatchesResult.data ?? []) {
    const workCenterId = row.workCenterId as string;
    const list = dispatchesByWorkCenter.get(workCenterId) ?? [];
    list.push(row);
    dispatchesByWorkCenter.set(workCenterId, list);
    if (row.assignee) assigneeIds.add(row.assignee);
  }

  const names = await getUserNames(client, [...assigneeIds]);

  const machines: ShopMachine[] = workCenters.map((wc) => {
    const events = eventsByWorkCenter.get(wc.id) ?? [];
    const rawDispatches = dispatchesByWorkCenter.get(wc.id) ?? [];
    const openDispatches: ShopOpenDispatch[] = rawDispatches.map((d) => ({
      id: d.id,
      maintenanceDispatchId: d.maintenanceDispatchId ?? null,
      status: d.status ?? null,
      assignee: d.assignee ?? null,
      assigneeName: d.assignee ? (names.get(d.assignee) ?? null) : null,
      oeeImpact: d.oeeImpact ?? null,
      priority: d.priority ?? null
    }));
    const isBlocked = blockedById.get(wc.id) ?? false;

    return {
      id: wc.id,
      name: wc.name ?? "",
      subtitle: shopMachineSubtitle({
        description: wc.description,
        processes: wc.processes
      }),
      departmentName: wc.departmentName ?? null,
      status: deriveShopMachineStatus({
        hasOpenProductionEvent: events.length > 0,
        openDispatches,
        isBlocked
      }),
      currentJobReadableId: events[0]?.jobReadableId ?? null,
      isBlocked,
      openDispatches
    };
  });

  return {
    locationId: args.locationId,
    locationName:
      locationResult.data?.name ?? workCenters[0]?.locationName ?? null,
    machines
  };
}

async function getUserNames(
  client: SupabaseClient<Database>,
  userIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const { data } = await client
    .from("user")
    .select("id, fullName")
    .in("id", unique);

  return new Map(
    (data ?? []).map((user) => [user.id, user.fullName ?? ""] as const)
  );
}
