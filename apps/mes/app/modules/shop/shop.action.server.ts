import type { Database } from "@carbon/database";
import {
  getTelegramChatIdForUser,
  markMaintenanceAssignTelegramCompleted,
  sendMaintenanceAssignmentTelegram
} from "@carbon/ee/telegram.server";
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
import {
  appendShopAwaitingStartAlert,
  appendShopIssueAlert,
  clearAwaitingStart,
  setAwaitingStart
} from "./shop.alerts.server";
import {
  fetchMeterShopSnapshot,
  meterSnapshotForWorkCenterName
} from "./shop.meter.server";
import type { ShopDispatchKind, ShopMaintenanceAction } from "./shop.types";
import {
  isShopMachinePhysicallyRunning,
  parseShopDispatchContent
} from "./shop.utils";

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
    /** Carbon `maintenanceDispatch.assignee` (single user). */
    assignee: string;
    /**
     * Everyone selected in the four-column picker (includes primary).
     * Inngest + sync Telegram DM each; group message once.
     */
    notifyUserIds?: string[];
    from: string;
  }
): Promise<{ telegramUnbound: boolean }> {
  const notifyUserIds = Array.from(
    new Set(
      (args.notifyUserIds?.length
        ? args.notifyUserIds
        : [args.assignee]
      ).filter(Boolean)
    )
  );

  try {
    await trigger("notify", {
      companyId: args.companyId,
      documentId: args.dispatchId,
      event: NotificationEvent.MaintenanceDispatchAssignment,
      recipient:
        notifyUserIds.length === 1
          ? { type: "user", userId: notifyUserIds[0]! }
          : { type: "users", userIds: notifyUserIds },
      from: args.from
    });
  } catch (err) {
    // Railway demos often set INNGEST_DEV with no Inngest server/cloud keys —
    // trigger() fails and carbon/send-telegram never runs. Sync-send DM+group.
    logger.error("Failed to notify maintenance assignment via Inngest", {
      companyId: args.companyId,
      dispatchId: args.dispatchId,
      error: err instanceof Error ? err.message : String(err)
    });
    try {
      const telegram = await sendMaintenanceAssignmentTelegram(client, {
        companyId: args.companyId,
        dispatchId: args.dispatchId,
        assigneeUserId: args.assignee,
        notifyUserIds,
        assignerUserId: args.from
      });
      logger.info("Telegram sync fallback after Inngest notify failure", {
        companyId: args.companyId,
        dispatchId: args.dispatchId,
        dmSent: telegram.dmSent,
        groupSent: telegram.groupSent,
        telegramUnbound: telegram.telegramUnbound
      });
      return { telegramUnbound: telegram.telegramUnbound };
    } catch (syncErr) {
      logger.error("Telegram sync fallback failed", {
        companyId: args.companyId,
        dispatchId: args.dispatchId,
        error: syncErr instanceof Error ? syncErr.message : String(syncErr)
      });
    }
  }

  // Flag when the primary assignee has no Telegram binding (UI flash copy).
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
    /** When Assign / Report*, the primary Carbon assignee (required for Assign). */
    assigneeId: string | null;
    /** All selected people for Telegram notify (includes primary when set). */
    notifyUserIds: string[];
    /** Plain note for Report* / optional on Assign. */
    note: string | null;
    companyId: string;
    userId: string;
  }
): Promise<ShopMaintenanceActionResult> {
  const { action, dispatchId, workCenterId, companyId, userId } = args;
  const currentTime = datetime.timestamp();
  const note = args.note?.trim() || null;
  const notifyUserIds = args.notifyUserIds;

  if (action === "ReportBreak") {
    return createShopAvailabilityDispatch(client, {
      kind: "break",
      workCenterId,
      assigneeId: args.assigneeId,
      notifyUserIds,
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
      notifyUserIds,
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
      notifyUserIds,
      note,
      companyId,
      userId,
      currentTime
    });
  }

  if (action === "ReportIssue") {
    return createShopIssueDispatch(client, {
      workCenterId,
      assigneeId: args.assigneeId,
      notifyUserIds,
      note,
      companyId,
      userId,
      currentTime
    });
  }

  if (action === "ConfirmStarted") {
    return confirmShopMachineStarted(client, {
      workCenterId,
      companyId
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
    // No self-claim: Assign requires an explicit primary from the picker.
    const assignee = args.assigneeId;
    if (!assignee) {
      return { ok: false, message: "Assignee is required" };
    }
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
      notifyUserIds: notifyUserIds.length > 0 ? notifyUserIds : [assignee],
      from: userId
    });

    return {
      ok: true,
      action,
      message: "Assigned",
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

    // Edit Telegram assign DMs + crew group message to「已完成 ✓」when tracked.
    try {
      await markMaintenanceAssignTelegramCompleted(client, {
        companyId,
        dispatchId,
        force: true
      });
    } catch (err) {
      logger.warn("Failed to mark Telegram assign messages completed", {
        companyId,
        dispatchId,
        error: err instanceof Error ? err.message : String(err)
      });
    }

    const posting = await postMaintenanceLabor(client, {
      maintenanceDispatchIds: [dispatchId],
      companyId,
      userId
    });

    // 待开机: if machine is not running at Complete, persist Redis flag + alert.
    await maybeEnterAwaitingStartAfterComplete(client, {
      companyId,
      workCenterId: resolvedWorkCenterId,
      dispatchWorkCenterId: ownedDispatch.data.workCenterId
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

/** Offline availability episodes only — not non-blocking `issue`. */
type AvailabilityKind = Exclude<ShopDispatchKind, "issue">;

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
    notifyUserIds: string[];
    note: string | null;
    companyId: string;
    userId: string;
    currentTime: string;
  }
): Promise<ShopMaintenanceActionResult> {
  const {
    kind,
    workCenterId,
    companyId,
    userId,
    currentTime,
    note,
    notifyUserIds
  } = args;
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
      notifyUserIds: notifyUserIds.length > 0 ? notifyUserIds : [assignee],
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

/**
 * Non-blocking 「报问题」: create a maintenance dispatch that does NOT take the
 * work center offline, does NOT end production events, and appears in 提醒.
 */
async function createShopIssueDispatch(
  client: SupabaseClient<Database>,
  args: {
    workCenterId: string | null;
    assigneeId: string | null;
    notifyUserIds: string[];
    note: string | null;
    companyId: string;
    userId: string;
    currentTime: string;
  }
): Promise<ShopMaintenanceActionResult> {
  const { workCenterId, companyId, userId, currentTime, note, notifyUserIds } =
    args;

  if (!workCenterId) {
    return { ok: false, message: "Work center is required" };
  }

  if (!note) {
    return {
      ok: false,
      message: "Please describe the problem before reporting"
    };
  }

  const workCenter = await client
    .from("workCenter")
    .select("id, name, locationId")
    .eq("id", workCenterId)
    .eq("companyId", companyId)
    .maybeSingle();

  if (!workCenter.data) {
    logger.warn("Work center not found for shop issue report", {
      companyId,
      workCenterId
    });
    return { ok: false, message: "Work center not found" };
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
    logger.error("Failed to get maintenance dispatch sequence for issue", {
      companyId,
      error: nextSequence.error
    });
    return { ok: false, message: "Failed to create maintenance dispatch" };
  }

  const content = {
    shopKind: "issue" as const,
    note
  };

  const insertDispatch = await client
    .from("maintenanceDispatch")
    .insert([
      {
        maintenanceDispatchId: nextSequence.data,
        status: assignee ? "Assigned" : "Open",
        priority: "Medium",
        severity: "Support Required",
        oeeImpact: "No Impact",
        // Key difference from 故障报修 / planned / break: machine stays up.
        takesWorkCenterOffline: false,
        source: "Reactive",
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
    logger.error("Failed to create shop issue dispatch", {
      companyId,
      workCenterId,
      error: insertDispatch.error
    });
    return { ok: false, message: "Failed to create maintenance dispatch" };
  }

  const dispatchId = insertDispatch.data.id;

  await client.from("maintenanceDispatchComment").insert([
    {
      maintenanceDispatchId: dispatchId,
      comment: note,
      companyId,
      createdBy: userId
    }
  ]);

  // Shared PWA 提醒 bell — status snapshot will not detect this (no downtime).
  const locationId = workCenter.data.locationId;
  if (locationId) {
    try {
      await appendShopIssueAlert({
        companyId,
        locationId,
        workCenterId,
        workCenterName: workCenter.data.name ?? workCenterId,
        note
      });
    } catch (err) {
      logger.warn("Failed to append shop issue alert (Redis fail-soft)", {
        companyId,
        workCenterId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  let telegramUnbound: boolean | undefined;
  if (assignee) {
    const notify = await notifyMaintenanceAssignment(client, {
      companyId,
      dispatchId,
      assignee,
      notifyUserIds: notifyUserIds.length > 0 ? notifyUserIds : [assignee],
      from: userId
    });
    telegramUnbound = notify.telegramUnbound;
  }

  return {
    ok: true,
    action: "ReportIssue",
    message: assignee ? "Problem reported and assigned" : "Problem reported",
    dispatchId,
    telegramUnbound
  };
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

/** Operator tapped 已开机 — clear Redis 待开机 for this work center. */
async function confirmShopMachineStarted(
  client: SupabaseClient<Database>,
  args: { workCenterId: string | null; companyId: string }
): Promise<ShopMaintenanceActionResult> {
  const { workCenterId, companyId } = args;
  if (!workCenterId) {
    return { ok: false, message: "Work center is required" };
  }

  const owned = await client
    .from("workCenter")
    .select("id")
    .eq("id", workCenterId)
    .eq("companyId", companyId)
    .maybeSingle();

  if (!owned.data) {
    return { ok: false, message: "Work center not found" };
  }

  try {
    await clearAwaitingStart({ companyId, workCenterId });
  } catch (err) {
    logger.warn("Failed to clear awaiting-start (Redis fail-soft)", {
      companyId,
      workCenterId,
      error: err instanceof Error ? err.message : String(err)
    });
  }

  return {
    ok: true,
    action: "ConfirmStarted",
    message: "已开机"
  };
}

/**
 * After Complete: if the work center is not running (Meter when available,
 * else open productionEvent), set 待开机 + 提醒 alert.
 */
async function maybeEnterAwaitingStartAfterComplete(
  client: SupabaseClient<Database>,
  args: {
    companyId: string;
    workCenterId: string | null;
    dispatchWorkCenterId: string | null;
  }
): Promise<void> {
  const workCenterId = args.workCenterId || args.dispatchWorkCenterId;
  if (!workCenterId) return;

  const workCenter = await client
    .from("workCenter")
    .select("id, name, locationId")
    .eq("id", workCenterId)
    .eq("companyId", args.companyId)
    .maybeSingle();

  if (!workCenter.data) return;

  let meterAvailable = false;
  let meterPhysical:
    | "running"
    | "idle"
    | "stopped"
    | "offline"
    | "unknown"
    | null = null;
  try {
    const meter = await fetchMeterShopSnapshot();
    meterAvailable = meter.available;
    const snap = meterSnapshotForWorkCenterName(meter, workCenter.data.name);
    meterPhysical = snap?.physicalStatus ?? null;
  } catch {
    meterAvailable = false;
  }

  const openEvents = await client
    .from("productionEvent")
    .select("id")
    .eq("companyId", args.companyId)
    .eq("workCenterId", workCenterId)
    .is("endTime", null)
    .limit(1);

  const hasOpenProductionEvent = (openEvents.data ?? []).length > 0;
  const running = isShopMachinePhysicallyRunning({
    meterAvailable,
    meterPhysical,
    hasOpenProductionEvent
  });

  if (running) return;

  try {
    await setAwaitingStart({
      companyId: args.companyId,
      workCenterId
    });
    const locationId = workCenter.data.locationId;
    if (locationId) {
      await appendShopAwaitingStartAlert({
        companyId: args.companyId,
        locationId,
        workCenterId,
        workCenterName: workCenter.data.name ?? workCenterId
      });
    }
  } catch (err) {
    logger.warn(
      "Failed to set awaiting-start after Complete (Redis fail-soft)",
      {
        companyId: args.companyId,
        workCenterId,
        error: err instanceof Error ? err.message : String(err)
      }
    );
  }
}
