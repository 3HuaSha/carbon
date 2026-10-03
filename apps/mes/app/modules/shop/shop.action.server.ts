import type { Database } from "@carbon/database";
import { getTelegramChatIdForUser } from "@carbon/ee/telegram.server";
import { trigger } from "@carbon/jobs";
import { getLogger } from "@carbon/logger";
import { NotificationEvent } from "@carbon/notifications";
import { datetime } from "@carbon/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assignMaintenanceDispatch,
  endMaintenanceEvent,
  getActiveMaintenanceEventByEmployee,
  postMaintenanceLabor,
  startMaintenanceEvent,
  updateMaintenanceDispatchStatus
} from "~/services/maintenance.service";
import {
  endProductionEventsByWorkCenter,
  notifyScheduleInputsChanged
} from "~/services/operations.service";
import { openDispatchStatuses } from "~/utils/display";
import type { ShopDispatchKind, ShopMaintenanceAction } from "./shop.types";
import { parseShopDispatchContent } from "./shop.utils";

const logger = getLogger("mes", "shop-maintenance");

export type ShopMaintenanceActionResult =
  | {
      ok: true;
      action: ShopMaintenanceAction;
      message: string;
      /** Labor posting failed after a successful status write. */
      warning?: boolean;
      dispatchId?: string;
      /** Assignee has no Telegram binding (Assign / Report* with assignee). */
      telegramUnbound?: boolean;
    }
  | { ok: false; message: string };

async function notifyMaintenanceAssignment(
  client: SupabaseClient<Database>,
  args: {
    companyId: string;
    dispatchId: string;
    assignee: string;
    from: string;
  }
): Promise<{ telegramUnbound: boolean }> {
  try {
    await trigger("notify", {
      companyId: args.companyId,
      documentId: args.dispatchId,
      event: NotificationEvent.MaintenanceDispatchAssignment,
      recipient: { type: "user", userId: args.assignee },
      from: args.from
    });
  } catch (err) {
    logger.error("Failed to notify maintenance assignment", {
      companyId: args.companyId,
      dispatchId: args.dispatchId,
      error: err
    });
  }

  const chatId = await getTelegramChatIdForUser(client, {
    companyId: args.companyId,
    userId: args.assignee
  });
  return { telegramUnbound: !chatId };
}

/**
 * Same DB writes as desktop `x+/dispatch.new`, `x+/maintenance-event`, and
 * `assignMaintenanceDispatch`, but returns JSON so the `/shop` detail page can
 * stay open and revalidate.
 */
export async function runShopMaintenanceAction(
  client: SupabaseClient<Database>,
  args: {
    action: ShopMaintenanceAction;
    dispatchId: string | null;
    workCenterId: string | null;
    /** When Assign / Report*, the employee to assign (defaults to actor for Assign). */
    assigneeId: string | null;
    /** Plain note for Report* / optional on Assign. */
    note: string | null;
    companyId: string;
    userId: string;
  }
): Promise<ShopMaintenanceActionResult> {
  const { action, dispatchId, workCenterId, companyId, userId } = args;
  const currentTime = datetime.timestamp();
  const note = args.note?.trim() || null;

  if (action === "ReportBreak") {
    return createShopAvailabilityDispatch(client, {
      kind: "break",
      workCenterId,
      assigneeId: args.assigneeId,
      note,
      companyId,
      userId,
      currentTime
    });
  }

  if (action === "ReportPlanned") {
    return createShopAvailabilityDispatch(client, {
      kind: "planned",
      workCenterId,
      assigneeId: args.assigneeId,
      note,
      companyId,
      userId,
      currentTime
    });
  }

  if (action === "ReportDowntime") {
    return createShopAvailabilityDispatch(client, {
      kind: "fault",
      workCenterId,
      assigneeId: args.assigneeId,
      note,
      companyId,
      userId,
      currentTime
    });
  }

  if (action === "ResumeAvailability") {
    return resumeShopAvailability(client, {
      dispatchId,
      companyId,
      userId,
      currentTime
    });
  }

  if (!dispatchId) {
    return { ok: false, message: "Maintenance dispatch is required" };
  }

  const [ownedDispatch, ownedWorkCenter] = await Promise.all([
    client
      .from("maintenanceDispatch")
      .select("id, workCenterId, content")
      .eq("id", dispatchId)
      .eq("companyId", companyId)
      .maybeSingle(),
    action === "Start" && workCenterId
      ? client
          .from("workCenter")
          .select("id")
          .eq("id", workCenterId)
          .eq("companyId", companyId)
          .maybeSingle()
      : null
  ]);

  if (!ownedDispatch.data || (ownedWorkCenter && !ownedWorkCenter.data)) {
    logger.warn("Dispatch or work center not found in company", {
      companyId,
      dispatchId,
      workCenterId
    });
    return { ok: false, message: "Maintenance dispatch not found" };
  }

  const resolvedWorkCenterId =
    workCenterId || ownedDispatch.data.workCenterId || null;

  // Optional note attach on Assign when dispatch note is still empty.
  if (action === "Assign" && note) {
    await appendDispatchNote(client, {
      dispatchId,
      existingContent: ownedDispatch.data.content,
      note,
      companyId,
      userId
    });
  }

  const stampScheduleIfOffline = async () => {
    const { data: dispatch } = await client
      .from("maintenanceDispatch")
      .select("takesWorkCenterOffline, workCenterId")
      .eq("id", dispatchId)
      .eq("companyId", companyId)
      .single();
    if (dispatch?.takesWorkCenterOffline && dispatch.workCenterId) {
      await notifyScheduleInputsChanged(
        companyId,
        "work-center",
        "Machine downtime changed",
        dispatch.workCenterId
      );
    }
  };

  if (action === "Assign") {
    const assignee = args.assigneeId || userId;
    const ownedAssignee = await client
      .from("employees")
      .select("id")
      .eq("id", assignee)
      .eq("companyId", companyId)
      .eq("active", true)
      .maybeSingle();
    if (!ownedAssignee.data) {
      return { ok: false, message: "Assignee not found in this company" };
    }

    const result = await assignMaintenanceDispatch(client, {
      dispatchId,
      assignee,
      updatedBy: userId,
      companyId
    });
    if (result.error) {
      logger.error("Failed to assign maintenance dispatch", {
        companyId,
        dispatchId,
        error: result.error
      });
      return { ok: false, message: "Failed to assign maintenance dispatch" };
    }

    const { telegramUnbound } = await notifyMaintenanceAssignment(client, {
      companyId,
      dispatchId,
      assignee,
      from: userId
    });

    return {
      ok: true,
      action,
      message: assignee === userId ? "Assigned to you" : "Assigned",
      telegramUnbound
    };
  }

  if (action === "Start") {
    if (!resolvedWorkCenterId) {
      return { ok: false, message: "Work center is required to start" };
    }

    const existing = await getActiveMaintenanceEventByEmployee(client, {
      dispatchId,
      employeeId: userId,
      companyId
    });
    if (existing.data) {
      return { ok: true, action, message: "Maintenance started" };
    }

    const startEvent = await startMaintenanceEvent(client, {
      maintenanceDispatchId: dispatchId,
      employeeId: userId,
      workCenterId: resolvedWorkCenterId,
      startTime: currentTime,
      companyId,
      createdBy: userId
    });

    if (startEvent.error) {
      logger.error("Failed to start maintenance event", {
        companyId,
        dispatchId,
        error: startEvent.error
      });
      return { ok: false, message: "Failed to start maintenance event" };
    }

    await updateMaintenanceDispatchStatus(client, {
      dispatchId,
      status: "In Progress",
      actualStartTime: currentTime,
      updatedBy: userId,
      companyId
    });

    await stampScheduleIfOffline();
    return { ok: true, action, message: "Maintenance started" };
  }

  if (action === "End") {
    const endEvent = await endMaintenanceEvent(client, {
      dispatchId,
      employeeId: userId,
      endTime: currentTime,
      updatedBy: userId,
      companyId
    });

    if (endEvent.error) {
      return { ok: false, message: "Failed to end maintenance event" };
    }

    const posting = await postMaintenanceLabor(client, {
      maintenanceDispatchIds: [dispatchId],
      companyId,
      userId
    });
    if (posting.error) {
      logger.error("Failed to post maintenance labor", {
        companyId,
        dispatchId,
        error: posting.error
      });
      return {
        ok: false,
        message: "Maintenance paused, but its labor cost did not post"
      };
    }

    return { ok: true, action, message: "Maintenance paused" };
  }

  if (action === "Complete") {
    await endMaintenanceEvent(client, {
      dispatchId,
      employeeId: userId,
      endTime: currentTime,
      updatedBy: userId,
      companyId
    });

    const updateStatus = await updateMaintenanceDispatchStatus(client, {
      dispatchId,
      status: "Completed",
      actualEndTime: currentTime,
      completedAt: currentTime,
      updatedBy: userId,
      companyId
    });

    if (updateStatus.error) {
      return { ok: false, message: "Failed to complete maintenance" };
    }

    await stampScheduleIfOffline();

    const posting = await postMaintenanceLabor(client, {
      maintenanceDispatchIds: [dispatchId],
      companyId,
      userId
    });
    if (posting.error) {
      logger.error("Failed to post maintenance labor", {
        companyId,
        dispatchId,
        error: posting.error
      });
      return {
        ok: true,
        action,
        message: "Maintenance completed, but its labor cost did not post",
        warning: true
      };
    }

    return { ok: true, action, message: "Maintenance completed" };
  }

  return { ok: false, message: "Unknown action" };
}

type AvailabilityKind = ShopDispatchKind;

/**
 * Create break / planned / fault availability episode on a work center.
 * One open offline episode at a time (toast-friendly refusal otherwise).
 */
async function createShopAvailabilityDispatch(
  client: SupabaseClient<Database>,
  args: {
    kind: AvailabilityKind;
    workCenterId: string | null;
    assigneeId: string | null;
    note: string | null;
    companyId: string;
    userId: string;
    currentTime: string;
  }
): Promise<ShopMaintenanceActionResult> {
  const { kind, workCenterId, companyId, userId, currentTime, note } = args;
  if (!workCenterId) {
    return { ok: false, message: "Work center is required" };
  }

  if (kind === "fault" && !note) {
    return {
      ok: false,
      message: "Please add a note describing the fault before reporting"
    };
  }

  const workCenter = await client
    .from("workCenter")
    .select("id, locationId")
    .eq("id", workCenterId)
    .eq("companyId", companyId)
    .maybeSingle();

  if (!workCenter.data) {
    logger.warn("Work center not found for shop availability", {
      companyId,
      workCenterId,
      kind
    });
    return { ok: false, message: "Work center not found" };
  }

  const existingOpen = await client
    .from("maintenanceDispatch")
    .select("id, oeeImpact, content, takesWorkCenterOffline")
    .eq("companyId", companyId)
    .eq("workCenterId", workCenterId)
    .in("status", [...openDispatchStatuses])
    .eq("takesWorkCenterOffline", true)
    .limit(1);

  if (existingOpen.error) {
    logger.error("Failed to check open offline dispatches", {
      companyId,
      workCenterId,
      error: existingOpen.error
    });
    return { ok: false, message: "Failed to create maintenance dispatch" };
  }

  if ((existingOpen.data ?? []).length > 0) {
    return {
      ok: false,
      message:
        "This machine already has an open downtime. Resume or complete it first."
    };
  }

  let assignee: string | undefined;
  if (args.assigneeId) {
    const ownedAssignee = await client
      .from("employees")
      .select("id")
      .eq("id", args.assigneeId)
      .eq("companyId", companyId)
      .eq("active", true)
      .maybeSingle();
    if (!ownedAssignee.data) {
      return { ok: false, message: "Assignee not found in this company" };
    }
    assignee = args.assigneeId;
  }

  const nextSequence = await client.rpc("get_next_sequence", {
    sequence_name: "maintenanceDispatch",
    company_id: companyId
  });

  if (nextSequence.error || !nextSequence.data) {
    logger.error("Failed to get maintenance dispatch sequence", {
      companyId,
      error: nextSequence.error
    });
    return { ok: false, message: "Failed to create maintenance dispatch" };
  }

  const defaults = availabilityDefaults(kind);
  const content = {
    shopKind: kind,
    ...(note ? { note } : {})
  };

  const insertDispatch = await client
    .from("maintenanceDispatch")
    .insert([
      {
        maintenanceDispatchId: nextSequence.data,
        status: assignee ? "Assigned" : "Open",
        priority: defaults.priority,
        severity: defaults.severity,
        oeeImpact: defaults.oeeImpact,
        takesWorkCenterOffline: true,
        source: defaults.source,
        workCenterId,
        locationId: workCenter.data.locationId ?? undefined,
        assignee,
        plannedStartTime: currentTime,
        content,
        companyId,
        createdBy: userId
      }
    ])
    .select("id")
    .single();

  if (insertDispatch.error || !insertDispatch.data?.id) {
    logger.error("Failed to create shop availability dispatch", {
      companyId,
      workCenterId,
      kind,
      error: insertDispatch.error
    });
    return { ok: false, message: "Failed to create maintenance dispatch" };
  }

  const dispatchId = insertDispatch.data.id;

  if (note) {
    await client.from("maintenanceDispatchComment").insert([
      {
        maintenanceDispatchId: dispatchId,
        comment: note,
        companyId,
        createdBy: userId
      }
    ]);
  }

  await endProductionEventsByWorkCenter(client, {
    workCenterId,
    companyId,
    endTime: currentTime
  });

  await notifyScheduleInputsChanged(
    companyId,
    "work-center",
    kind === "break"
      ? "Machine break reported"
      : kind === "planned"
        ? "Planned downtime reported"
        : "Machine downtime reported",
    workCenterId
  );

  let telegramUnbound: boolean | undefined;
  if (assignee && (kind === "fault" || kind === "planned")) {
    const notify = await notifyMaintenanceAssignment(client, {
      companyId,
      dispatchId,
      assignee,
      from: userId
    });
    telegramUnbound = notify.telegramUnbound;
  }

  const actionName: ShopMaintenanceAction =
    kind === "break"
      ? "ReportBreak"
      : kind === "planned"
        ? "ReportPlanned"
        : "ReportDowntime";

  return {
    ok: true,
    action: actionName,
    message: successMessage(kind, !!assignee),
    dispatchId,
    telegramUnbound
  };
}

function availabilityDefaults(kind: AvailabilityKind): {
  priority: "Low" | "Medium" | "High" | "Critical";
  severity:
    | "Preventive"
    | "Operator Performed"
    | "Support Required"
    | "OEM Required";
  oeeImpact: "Down" | "Planned" | "Impact" | "No Impact";
  source: "Scheduled" | "Reactive" | "Non-Conformance";
} {
  if (kind === "break") {
    return {
      priority: "Low",
      severity: "Operator Performed",
      oeeImpact: "No Impact",
      source: "Reactive"
    };
  }
  if (kind === "planned") {
    return {
      priority: "Medium",
      severity: "Preventive",
      oeeImpact: "Planned",
      source: "Reactive"
    };
  }
  // Fault + mold-shop / 模房 — same class as today's Down.
  return {
    priority: "High",
    severity: "Support Required",
    oeeImpact: "Down",
    source: "Reactive"
  };
}

function successMessage(kind: AvailabilityKind, assigned: boolean): string {
  if (kind === "break") return "Machine set to break / away";
  if (kind === "planned") {
    return assigned
      ? "Planned downtime set and assigned"
      : "Planned downtime set";
  }
  return assigned
    ? "Machine set to waiting repair and assigned"
    : "Machine set to waiting repair";
}

/** Complete a break or planned episode without repair labor clock. */
async function resumeShopAvailability(
  client: SupabaseClient<Database>,
  args: {
    dispatchId: string | null;
    companyId: string;
    userId: string;
    currentTime: string;
  }
): Promise<ShopMaintenanceActionResult> {
  const { dispatchId, companyId, userId, currentTime } = args;
  if (!dispatchId) {
    return { ok: false, message: "Maintenance dispatch is required" };
  }

  const owned = await client
    .from("maintenanceDispatch")
    .select(
      "id, workCenterId, takesWorkCenterOffline, content, oeeImpact, status"
    )
    .eq("id", dispatchId)
    .eq("companyId", companyId)
    .maybeSingle();

  if (!owned.data) {
    return { ok: false, message: "Maintenance dispatch not found" };
  }

  const parsed = parseShopDispatchContent(owned.data.content);
  const kind = parsed.shopKind;
  if (kind !== "break" && kind !== "planned") {
    // Also allow Planned oeeImpact without tag for Resume on planned rows.
    if (
      owned.data.oeeImpact !== "Planned" &&
      owned.data.oeeImpact !== "No Impact"
    ) {
      return {
        ok: false,
        message: "Use Complete for repair tickets"
      };
    }
  }

  if (owned.data.status === "Completed" || owned.data.status === "Cancelled") {
    return {
      ok: true,
      action: "ResumeAvailability",
      message: "Already resumed"
    };
  }

  const updateStatus = await updateMaintenanceDispatchStatus(client, {
    dispatchId,
    status: "Completed",
    actualEndTime: currentTime,
    completedAt: currentTime,
    updatedBy: userId,
    companyId
  });

  if (updateStatus.error) {
    return { ok: false, message: "Failed to resume machine" };
  }

  if (owned.data.takesWorkCenterOffline && owned.data.workCenterId) {
    await notifyScheduleInputsChanged(
      companyId,
      "work-center",
      "Machine availability resumed",
      owned.data.workCenterId
    );
  }

  return {
    ok: true,
    action: "ResumeAvailability",
    message: "Machine resumed",
    dispatchId
  };
}

async function appendDispatchNote(
  client: SupabaseClient<Database>,
  args: {
    dispatchId: string;
    existingContent: unknown;
    note: string;
    companyId: string;
    userId: string;
  }
) {
  const parsed = parseShopDispatchContent(args.existingContent);
  const base =
    args.existingContent &&
    typeof args.existingContent === "object" &&
    !Array.isArray(args.existingContent)
      ? (args.existingContent as Record<
          string,
          string | number | boolean | null
        >)
      : {};

  if (!parsed.note) {
    const content = { ...base, note: args.note };
    await client
      .from("maintenanceDispatch")
      .update({
        content,
        updatedBy: args.userId,
        updatedAt: datetime.timestamp()
      })
      .eq("id", args.dispatchId)
      .eq("companyId", args.companyId);
  }

  await client.from("maintenanceDispatchComment").insert([
    {
      maintenanceDispatchId: args.dispatchId,
      comment: args.note,
      companyId: args.companyId,
      createdBy: args.userId
    }
  ]);
}
