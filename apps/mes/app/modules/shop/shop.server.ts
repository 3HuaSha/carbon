import type { Database } from "@carbon/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openDispatchStatuses } from "~/utils/display";
import type {
  ShopCurrentWork,
  ShopMachine,
  ShopOpenDispatch,
  ShopOverview
} from "./shop.types";
import { deriveShopMachineStatus, shopMachineSubtitle } from "./shop.utils";

const DISPATCH_COLUMNS =
  "id, maintenanceDispatchId, status, oeeImpact, priority, assignee, workCenterId";

/**
 * One aggregation for the `/shop` machine grid: location work centers, open
 * production events (with WO/QC), and open maintenance dispatches. No
 * per-machine queries.
 */
export async function getShopOverview(
  client: SupabaseClient<Database>,
  args: { companyId: string; locationId: string; userId: string }
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
      userId: args.userId,
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
        jobOperationId,
        jobOperation:jobOperationId (
          id,
          status,
          operationType,
          job:jobId (
            id,
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

  type EventRow = {
    workCenterId: string;
    jobOperationId: string | null;
    jobReadableId: string | null;
    jobId: string | null;
    operationStatus: string | null;
    operationType: string | null;
  };

  const eventsByWorkCenter = new Map<string, EventRow[]>();
  const operationIds = new Set<string>();
  for (const row of (eventsResult.data ?? []) as any[]) {
    const workCenterId = row.workCenterId as string;
    const list = eventsByWorkCenter.get(workCenterId) ?? [];
    const op = row.jobOperation ?? {};
    const job = op.job ?? {};
    const jobOperationId =
      (row.jobOperationId as string | null) ?? (op.id as string | null) ?? null;
    if (jobOperationId) operationIds.add(jobOperationId);
    list.push({
      workCenterId,
      jobOperationId,
      jobReadableId: job.jobId ?? null,
      jobId: job.id ?? null,
      operationStatus: op.status ?? null,
      operationType: op.operationType ?? null
    });
    eventsByWorkCenter.set(workCenterId, list);
  }

  const dispatchIds = (dispatchesResult.data ?? []).map((d) => d.id as string);

  const [inspectionsByOperation, workingDispatchIds, names] = await Promise.all(
    [
      getInspectionsByOperationIds(client, {
        companyId: args.companyId,
        operationIds: [...operationIds]
      }),
      getWorkingDispatchIds(client, {
        companyId: args.companyId,
        userId: args.userId,
        dispatchIds
      }),
      getUserNames(
        client,
        (dispatchesResult.data ?? [])
          .map((d) => d.assignee)
          .filter((id): id is string => typeof id === "string")
      )
    ]
  );

  const dispatchesByWorkCenter = new Map<string, any[]>();
  for (const row of dispatchesResult.data ?? []) {
    const workCenterId = row.workCenterId as string;
    const list = dispatchesByWorkCenter.get(workCenterId) ?? [];
    list.push(row);
    dispatchesByWorkCenter.set(workCenterId, list);
  }

  const machines: ShopMachine[] = workCenters.map((wc) => {
    const events = eventsByWorkCenter.get(wc.id) ?? [];
    const first = events[0] ?? null;
    const inspection = first?.jobOperationId
      ? (inspectionsByOperation.get(first.jobOperationId) ?? null)
      : null;

    const currentWork: ShopCurrentWork | null = first
      ? {
          jobReadableId: first.jobReadableId,
          jobId: first.jobId,
          jobOperationId: first.jobOperationId,
          operationStatus: first.operationStatus,
          operationType: first.operationType,
          inspectionId: inspection?.id ?? null,
          inspectionStatus: inspection?.status ?? null
        }
      : null;

    const rawDispatches = dispatchesByWorkCenter.get(wc.id) ?? [];
    const openDispatches: ShopOpenDispatch[] = rawDispatches.map((d) => ({
      id: d.id,
      maintenanceDispatchId: d.maintenanceDispatchId ?? null,
      status: d.status ?? null,
      assignee: d.assignee ?? null,
      assigneeName: d.assignee ? (names.get(d.assignee) ?? null) : null,
      oeeImpact: d.oeeImpact ?? null,
      priority: d.priority ?? null,
      workCenterId: d.workCenterId ?? wc.id,
      isWorking: workingDispatchIds.has(d.id)
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
      currentJobReadableId: first?.jobReadableId ?? null,
      currentWork,
      isBlocked,
      openDispatches
    };
  });

  return {
    locationId: args.locationId,
    locationName:
      locationResult.data?.name ?? workCenters[0]?.locationName ?? null,
    userId: args.userId,
    machines
  };
}

async function getInspectionsByOperationIds(
  client: SupabaseClient<Database>,
  args: { companyId: string; operationIds: string[] }
): Promise<Map<string, { id: string; status: string | null }>> {
  if (args.operationIds.length === 0) return new Map();

  const { data, error } = await client
    .from("inspection")
    .select("id, status, sourceDocumentLineId")
    .eq("companyId", args.companyId)
    .eq("sourceDocument", "Job Operation")
    .in("sourceDocumentLineId", args.operationIds);

  if (error) throw error;

  const map = new Map<string, { id: string; status: string | null }>();
  for (const row of data ?? []) {
    const opId = row.sourceDocumentLineId;
    if (!opId || map.has(opId)) continue;
    map.set(opId, { id: row.id, status: row.status ?? null });
  }
  return map;
}

async function getWorkingDispatchIds(
  client: SupabaseClient<Database>,
  args: { companyId: string; userId: string; dispatchIds: string[] }
): Promise<Set<string>> {
  if (args.dispatchIds.length === 0) return new Set();

  const { data, error } = await client
    .from("maintenanceDispatchEvent")
    .select("maintenanceDispatchId")
    .eq("companyId", args.companyId)
    .eq("employeeId", args.userId)
    .in("maintenanceDispatchId", args.dispatchIds)
    .is("endTime", null);

  if (error) throw error;

  return new Set(
    (data ?? [])
      .map((row) => row.maintenanceDispatchId)
      .filter((id): id is string => typeof id === "string")
  );
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
