import type { Database } from "@carbon/database";
import { trigger } from "@carbon/lib/trigger";
import { getLogger } from "@carbon/logger";
import { datetime } from "@carbon/utils";
import type { SupabaseClient } from "@supabase/supabase-js";

const logger = getLogger("ee", "telegram-maintenance");

export type TelegramMaintenanceAction = "Start" | "Complete";

export type TelegramMaintenanceResult =
  | { ok: true; message: string; warning?: boolean }
  | { ok: false; message: string };

/**
 * Same DB writes as MES `/shop` Start / Complete, scoped to the bound
 * Telegram user. Enforces assignee-only (Bowen default).
 */
export async function runTelegramMaintenanceAction(
  client: SupabaseClient<Database>,
  args: {
    action: TelegramMaintenanceAction;
    dispatchId: string;
    companyId: string;
    userId: string;
  }
): Promise<TelegramMaintenanceResult> {
  const { action, dispatchId, companyId, userId } = args;
  const currentTime = datetime.timestamp();

  const { data: dispatch, error } = await client
    .from("maintenanceDispatch")
    .select("id, workCenterId, assignee, status, takesWorkCenterOffline")
    .eq("id", dispatchId)
    .eq("companyId", companyId)
    .maybeSingle();

  if (error || !dispatch) {
    return { ok: false, message: "找不到该维修工单" };
  }

  if (dispatch.assignee !== userId) {
    return { ok: false, message: "仅派工负责人可从 Telegram 操作" };
  }

  if (dispatch.status === "Completed" || dispatch.status === "Cancelled") {
    return {
      ok: false,
      message: dispatch.status === "Completed" ? "工单已完成" : "工单已取消"
    };
  }

  const stampScheduleIfOffline = async () => {
    if (dispatch.takesWorkCenterOffline && dispatch.workCenterId) {
      await trigger("schedule-inputs-changed", {
        companyId,
        kind: "work-center",
        reason: "Machine downtime changed",
        entityId: dispatch.workCenterId
      });
    }
  };

  if (action === "Start") {
    if (!dispatch.workCenterId) {
      return { ok: false, message: "工单缺少工作中心，无法开始" };
    }

    if (dispatch.status === "In Progress") {
      return { ok: true, message: "维修已在进行中" };
    }

    const { data: existing } = await client
      .from("maintenanceDispatchEvent")
      .select("id")
      .eq("maintenanceDispatchId", dispatchId)
      .eq("employeeId", userId)
      .eq("companyId", companyId)
      .is("endTime", null)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const startEvent = await client
        .from("maintenanceDispatchEvent")
        .insert([
          {
            maintenanceDispatchId: dispatchId,
            employeeId: userId,
            workCenterId: dispatch.workCenterId,
            startTime: currentTime,
            companyId,
            createdBy: userId
          }
        ])
        .select("id")
        .single();

      if (startEvent.error) {
        logger.error("Failed to start maintenance event from Telegram", {
          companyId,
          dispatchId,
          error: startEvent.error
        });
        return { ok: false, message: "开始失败，请稍后重试" };
      }
    }

    const updateStatus = await client
      .from("maintenanceDispatch")
      .update({
        status: "In Progress",
        actualStartTime: currentTime,
        updatedBy: userId
      })
      .eq("id", dispatchId)
      .eq("companyId", companyId);

    if (updateStatus.error) {
      return { ok: false, message: "更新工单状态失败" };
    }

    await stampScheduleIfOffline();
    return { ok: true, message: "已开始维修" };
  }

  // Complete
  await client
    .from("maintenanceDispatchEvent")
    .update({
      endTime: currentTime,
      updatedBy: userId
    })
    .eq("maintenanceDispatchId", dispatchId)
    .eq("employeeId", userId)
    .eq("companyId", companyId)
    .is("endTime", null);

  const updateStatus = await client
    .from("maintenanceDispatch")
    .update({
      status: "Completed",
      actualEndTime: currentTime,
      completedAt: currentTime,
      updatedBy: userId
    })
    .eq("id", dispatchId)
    .eq("companyId", companyId);

  if (updateStatus.error) {
    return { ok: false, message: "完成失败，请稍后重试" };
  }

  await stampScheduleIfOffline();

  const posting = await client.functions.invoke<{
    success: boolean;
    error?: string;
  }>("post-maintenance-event", {
    body: {
      maintenanceDispatchIds: [dispatchId],
      companyId,
      userId
    }
  });

  if (posting.error) {
    logger.error("Failed to post maintenance labor from Telegram", {
      companyId,
      dispatchId,
      error: posting.error
    });
    return {
      ok: true,
      message: "已完成，但人工成本过账失败",
      warning: true
    };
  }

  return { ok: true, message: "维修已完成" };
}
