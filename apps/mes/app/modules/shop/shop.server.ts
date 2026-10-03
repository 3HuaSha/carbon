import type { Database } from "@carbon/database";
import { storage } from "@carbon/files";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openDispatchStatuses } from "~/utils/display";
import type {
  ShopCurrentWork,
  ShopDispatchComment,
  ShopDispatchFile,
  ShopDispatchHistoryItem,
  ShopMachine,
  ShopMachineDetail,
  ShopOpenDispatch,
  ShopOverview,
  ShopPerson
} from "./shop.types";
import {
  deriveShopMachineStatus,
  parseShopDispatchContent,
  resolveShopDispatchKind,
  shopMachineSubtitle
} from "./shop.utils";

const DISPATCH_COLUMNS =
  "id, maintenanceDispatchId, status, oeeImpact, priority, assignee, workCenterId, content, createdAt";

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
      machines: [],
      people: []
    };
  }

  const [blockingResult, eventsResult, dispatchesResult, peopleResult] =
    await Promise.all([
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
        .in("status", [...openDispatchStatuses]),
      client
        .from("employees")
        .select("id, name, avatarUrl, locationId")
        .eq("companyId", args.companyId)
        .eq("active", true)
        .order("name", { ascending: true })
    ]);

  if (blockingResult.error) throw blockingResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (dispatchesResult.error) throw dispatchesResult.error;
  if (peopleResult.error) throw peopleResult.error;

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
    const openDispatches = mapOpenDispatches(rawDispatches, {
      workCenterId: wc.id,
      names,
      workingDispatchIds
    });
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

  const people = mapPeople(peopleResult.data ?? [], args.locationId);

  return {
    locationId: args.locationId,
    locationName:
      locationResult.data?.name ?? workCenters[0]?.locationName ?? null,
    userId: args.userId,
    machines,
    people
  };
}

/**
 * Detail page loader for one work center at the session location. Reuses the
 * overview aggregation (no N+1), then loads comments, storage files, and a
 * short closed-dispatch history for that machine only.
 */
export async function getShopMachineDetail(
  client: SupabaseClient<Database>,
  args: {
    companyId: string;
    locationId: string;
    userId: string;
    workCenterId: string;
  }
): Promise<ShopMachineDetail | null> {
  const overview = await getShopOverview(client, {
    companyId: args.companyId,
    locationId: args.locationId,
    userId: args.userId
  });

  const machine = overview.machines.find((m) => m.id === args.workCenterId);
  if (!machine) return null;

  const openIds = machine.openDispatches.map((d) => d.id);

  const [commentsByDispatchId, filesByDispatchId, history] = await Promise.all([
    getCommentsByDispatchIds(client, {
      companyId: args.companyId,
      dispatchIds: openIds
    }),
    getFilesByDispatchIds(client, {
      companyId: args.companyId,
      dispatchIds: openIds
    }),
    getRecentDispatchHistory(client, {
      companyId: args.companyId,
      workCenterId: args.workCenterId
    })
  ]);

  return {
    machine,
    people: overview.people,
    userId: overview.userId,
    locationId: overview.locationId,
    locationName: overview.locationName,
    commentsByDispatchId,
    filesByDispatchId,
    history
  };
}

function mapOpenDispatches(
  rawDispatches: any[],
  args: {
    workCenterId: string;
    names: Map<string, string>;
    workingDispatchIds: Set<string>;
  }
): ShopOpenDispatch[] {
  return rawDispatches.map((d) => {
    const parsed = parseShopDispatchContent(d.content);
    const shopKind = resolveShopDispatchKind({
      shopKind: parsed.shopKind,
      oeeImpact: d.oeeImpact ?? null
    });
    return {
      id: d.id,
      maintenanceDispatchId: d.maintenanceDispatchId ?? null,
      status: d.status ?? null,
      assignee: d.assignee ?? null,
      assigneeName: d.assignee ? (args.names.get(d.assignee) ?? null) : null,
      oeeImpact: d.oeeImpact ?? null,
      priority: d.priority ?? null,
      workCenterId: d.workCenterId ?? args.workCenterId,
      isWorking: args.workingDispatchIds.has(d.id),
      shopKind,
      note: parsed.note,
      createdAt: d.createdAt ?? null
    };
  });
}

function mapPeople(
  rows: {
    id?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
    locationId?: string | null;
  }[],
  locationId: string
): ShopPerson[] {
  return rows
    .filter(
      (row): row is typeof row & { id: string } => typeof row.id === "string"
    )
    .map((row) => ({
      id: row.id,
      name: row.name?.trim() || row.id,
      avatarUrl: row.avatarUrl ?? null,
      locationId: row.locationId ?? null
    }))
    .sort((a, b) => {
      const aHere = a.locationId === locationId ? 0 : 1;
      const bHere = b.locationId === locationId ? 0 : 1;
      if (aHere !== bHere) return aHere - bHere;
      return a.name.localeCompare(b.name);
    });
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

async function getCommentsByDispatchIds(
  client: SupabaseClient<Database>,
  args: { companyId: string; dispatchIds: string[] }
): Promise<Record<string, ShopDispatchComment[]>> {
  const empty: Record<string, ShopDispatchComment[]> = {};
  if (args.dispatchIds.length === 0) return empty;

  const { data, error } = await client
    .from("maintenanceDispatchComment")
    .select(
      `
      id,
      comment,
      createdAt,
      maintenanceDispatchId,
      createdBy:user!maintenanceDispatchComment_createdBy_fkey(id, fullName)
    `
    )
    .eq("companyId", args.companyId)
    .in("maintenanceDispatchId", args.dispatchIds)
    .order("createdAt", { ascending: true });

  if (error) throw error;

  const result: Record<string, ShopDispatchComment[]> = {};
  for (const id of args.dispatchIds) result[id] = [];

  for (const row of (data ?? []) as any[]) {
    const dispatchId = row.maintenanceDispatchId as string;
    const list = result[dispatchId] ?? [];
    list.push({
      id: row.id,
      comment: row.comment ?? "",
      createdAt: row.createdAt ?? null,
      createdByName: row.createdBy?.fullName ?? null
    });
    result[dispatchId] = list;
  }
  return result;
}

async function getFilesByDispatchIds(
  client: SupabaseClient<Database>,
  args: { companyId: string; dispatchIds: string[] }
): Promise<Record<string, ShopDispatchFile[]>> {
  const result: Record<string, ShopDispatchFile[]> = {};
  for (const id of args.dispatchIds) result[id] = [];
  if (args.dispatchIds.length === 0) return result;

  await Promise.all(
    args.dispatchIds.map(async (dispatchId) => {
      const listed = await storage(client)
        .company(args.companyId)
        .list(`${args.companyId}/maintenance/${dispatchId}`);
      const files = (listed.data ?? [])
        .filter((item) => !!item.name && !item.name.endsWith("/"))
        .map((item) => ({
          name: item.name,
          path: `${args.companyId}/maintenance/${dispatchId}/${item.name}`
        }));
      result[dispatchId] = files;
    })
  );

  return result;
}

async function getRecentDispatchHistory(
  client: SupabaseClient<Database>,
  args: { companyId: string; workCenterId: string }
): Promise<ShopDispatchHistoryItem[]> {
  const { data, error } = await client
    .from("maintenanceDispatch")
    .select(
      "id, maintenanceDispatchId, status, oeeImpact, content, assignee, completedAt"
    )
    .eq("companyId", args.companyId)
    .eq("workCenterId", args.workCenterId)
    .in("status", ["Completed", "Cancelled"])
    .order("completedAt", { ascending: false })
    .limit(5);

  if (error) throw error;

  const names = await getUserNames(
    client,
    (data ?? [])
      .map((d) => d.assignee)
      .filter((id): id is string => typeof id === "string")
  );

  return (data ?? []).map((d) => {
    const parsed = parseShopDispatchContent(d.content);
    return {
      id: d.id,
      maintenanceDispatchId: d.maintenanceDispatchId ?? null,
      status: d.status ?? null,
      shopKind: resolveShopDispatchKind({
        shopKind: parsed.shopKind,
        oeeImpact: d.oeeImpact ?? null
      }),
      assigneeName: d.assignee ? (names.get(d.assignee) ?? null) : null,
      completedAt: d.completedAt ?? null,
      note: parsed.note
    };
  });
}
