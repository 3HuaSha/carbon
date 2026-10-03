import type { Database } from "@carbon/database";
import { getLogger } from "@carbon/logger";
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
import { notifyScheduleInputsChanged } from "~/services/operations.service";
import type { ShopMaintenanceAction } from "./shop.types";

const logger = getLogger("mes", "shop-maintenance");

export type ShopMaintenanceActionResult =
  | {
      ok: true;
      action: ShopMaintenanceAction;
      message: string;
      /** Labor posting failed after a successful status write. */
      warning?: boolean;
    }
  | { ok: false; message: string };

/**
 * Same DB writes as desktop `x+/maintenance-event` + `assignMaintenanceDispatch`,
 * but returns JSON so the `/shop` BottomSheet can stay open and revalidate.
 */
export async function runShopMaintenanceAction(
  client: SupabaseClient<Database>,
  args: {
    action: ShopMaintenanceAction;
    dispatchId: string;
    workCenterId: string | null;
    companyId: string;
    userId: string;
  }
): Promise<ShopMaintenanceActionResult> {
  const { action, dispatchId, workCenterId, companyId, userId } = args;
  const currentTime = datetime.timestamp();

  const [ownedDispatch, ownedWorkCenter] = await Promise.all([
    client
      .from("maintenanceDispatch")
      .select("id, workCenterId")
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
    const result = await assignMaintenanceDispatch(client, {
      dispatchId,
      assignee: userId,
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
    return { ok: true, action, message: "Assigned to you" };
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
