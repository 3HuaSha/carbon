import { getLogger } from "@carbon/logger";

const log = getLogger("mes", "schedule-notify");

/**
 * Stamp the schedule as outdated so the debounced replan wave regenerates the
 * affected location. Mirrors ERP `production.service.ts` — used when a MES
 * maintenance dispatch changes a work center's downtime window.
 *
 * Never throws into the caller — a lost schedule notify must not fail the
 * business write that raised it (shop 停机 / ReportDowntime, maintenance
 * start/complete, etc.). Same contract as ERP `notifyScheduleInputsChanged`
 * and `raiseMoment`. Railway/demo often has no reachable Inngest; `trigger`
 * then rejects with `fetch failed` and would otherwise 500 the route after
 * the dispatch row already committed.
 */
export async function notifyScheduleInputsChanged(
  companyId: string,
  kind:
    | "ability"
    | "shift"
    | "employee-shift"
    | "work-center"
    | "location"
    | "reorder"
    | "people",
  reason: string,
  entityId?: string
) {
  try {
    const { trigger } = await import("@carbon/jobs");
    await trigger("schedule-inputs-changed", {
      companyId,
      kind,
      reason,
      entityId
    });
  } catch (err) {
    log.error("Failed to notify schedule inputs changed", {
      companyId,
      kind,
      reason,
      entityId,
      err
    });
  }
}
