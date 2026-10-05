/**
 * View model for the phone PWA machine overview (`/shop`) and machine detail
 * (`/shop/:workCenterId`).
 *
 * Machine = work center. Status is derived from open production events and
 * open maintenance dispatches — there is no `machine.status` column.
 */

/**
 * Display statuses on `/shop` tiles + detail.
 * Fault / planned (blocking) + Meter stop collapse to **停机**.
 * `awaitingStart` = 待开机 after Complete when not running.
 * `offline` = Meter power-off / unreachable pulse (code 4).
 */
export const shopMachineStatuses = [
  "running",
  "idle",
  "break",
  "down",
  "awaitingStart",
  "offline"
] as const;

export type ShopMachineStatus = (typeof shopMachineStatuses)[number];

/**
 * Grid filter chips: Running + Down only (idle/break still show on tiles when
 * no chip is selected — filter state `"all"`).
 */
export const shopStatusFilterChips = ["running", "down"] as const;

export type ShopStatusFilterChip = (typeof shopStatusFilterChips)[number];

export type ShopStatusFilter = "all" | ShopStatusFilterChip;

export const shopStatusFilters = ["all", ...shopStatusFilterChips] as const;

/**
 * Availability / repair episode kind stored in `maintenanceDispatch.content.shopKind`.
 * `issue` = non-blocking 「报问题」 (machine stays running/idle/break).
 * `planned` may be non-blocking (PWA 计划停机, oeeImpact No Impact) or legacy
 * blocking downtime (oeeImpact Planned, takesWorkCenterOffline true).
 */
export const shopDispatchKinds = [
  "break",
  "planned",
  "fault",
  "issue"
] as const;

/** Reason chips for non-blocking 计划停机 on machine detail. */
export const shopPlannedReasonPresets = ["换模", "保养", "其他"] as const;

export type ShopPlannedReasonPreset = (typeof shopPlannedReasonPresets)[number];

export type ShopDispatchKind = (typeof shopDispatchKinds)[number];

export type ShopOpenDispatch = {
  id: string;
  maintenanceDispatchId: string | null;
  status: string | null;
  assignee: string | null;
  assigneeName: string | null;
  oeeImpact: string | null;
  priority: string | null;
  workCenterId: string | null;
  /** True when the signed-in user has an open maintenanceDispatchEvent. */
  isWorking: boolean;
  /** Derived from `content.shopKind` / `oeeImpact`. */
  shopKind: ShopDispatchKind;
  /** Plain note from `content.note` (mobile MVP). */
  note: string | null;
  /** When the dispatch was created (ISO), if loaded. */
  createdAt: string | null;
};

/** Linked job + inspection for the open production event on a machine. */
export type ShopCurrentWork = {
  jobReadableId: string | null;
  /** Internal job row id — for ERP deep links when present. */
  jobId: string | null;
  jobOperationId: string | null;
  operationStatus: string | null;
  operationType: string | null;
  inspectionId: string | null;
  inspectionStatus: string | null;
};

export type ShopMachine = {
  id: string;
  name: string;
  /** Description, or first process id when description is empty. */
  subtitle: string | null;
  departmentName: string | null;
  status: ShopMachineStatus;
  currentJobReadableId: string | null;
  currentWork: ShopCurrentWork | null;
  isBlocked: boolean;
  openDispatches: ShopOpenDispatch[];
  /**
   * True when downtime just ended (停机 → 空闲). Cleared when someone opens
   * `/shop/:workCenterId`. Server-backed (Redis) so every shop device sees it.
   */
  justFixed?: boolean;
  /**
   * Actual current WO from MachineMeter (`Index_`), when the API is configured
   * and returned a value. Prefer this on the grid over Carbon productionEvent.
   */
  meterWorkOrder?: string | null;
};

/**
 * Reminder kinds: status-boundary transitions, non-blocking 「报问题」 /
 * 「计划停机」, and entering 待开机 after Complete.
 */
export const shopAlertKinds = [
  "down",
  "recovered",
  "issue",
  "planned",
  "awaitingStart"
] as const;

export type ShopAlertKind = (typeof shopAlertKinds)[number];

/** One row on the `/shop/alerts` 提醒 page. */
export type ShopAlert = {
  id: string;
  kind: ShopAlertKind;
  workCenterId: string;
  workCenterName: string;
  /** ISO timestamp when the transition was detected / issue was reported. */
  createdAt: string;
  /** Optional problem note (set for `issue` / `planned` alerts). */
  note?: string | null;
};

/**
 * Assign picker columns on machine detail (fault / planned). Matched via
 * `employeeType.name` aliases in `SHOP_ASSIGN_GROUP_ALIASES`.
 * Display order: 主管 → PE → 模房 → 维修.
 */
export const shopAssignGroups = ["supervisor", "pe", "mold", "repair"] as const;

export type ShopAssignGroup = (typeof shopAssignGroups)[number];

/** Employee row for the `/shop` assign-person picker. */
export type ShopPerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  locationId: string | null;
  employeeTypeName: string | null;
  /** Which assign group this person falls into, if any. */
  assignGroup: ShopAssignGroup | null;
};

export type ShopOverview = {
  locationId: string;
  locationName: string | null;
  userId: string;
  machines: ShopMachine[];
  /** Active employees in the company (location peers sorted first in the UI). */
  people: ShopPerson[];
  /**
   * Meter physical status by workCenterId when MachineMeter was reachable.
   * Used by alert sync for 待开机 auto-clear; null entries when Meter unset.
   */
  meterPhysicalByWorkCenterId?: Record<
    string,
    "running" | "idle" | "stopped" | "offline" | "unknown" | null
  >;
  meterAvailable?: boolean;
};

/** Comment row shown on the machine detail page. */
export type ShopDispatchComment = {
  id: string;
  comment: string;
  createdAt: string | null;
  createdByName: string | null;
};

/** Storage object listed under `${companyId}/maintenance/${dispatchId}/`. */
export type ShopDispatchFile = {
  name: string;
  /** Preview path for `/file/preview/private/...`. */
  path: string;
};

/** Completed/cancelled history stub for Phase 1. */
export type ShopDispatchHistoryItem = {
  id: string;
  maintenanceDispatchId: string | null;
  status: string | null;
  shopKind: ShopDispatchKind;
  assigneeName: string | null;
  completedAt: string | null;
  note: string | null;
};

export type ShopMachineDetail = {
  machine: ShopMachine;
  people: ShopPerson[];
  userId: string;
  locationId: string;
  locationName: string | null;
  /** Comments keyed by open dispatch id. */
  commentsByDispatchId: Record<string, ShopDispatchComment[]>;
  /** Files keyed by open dispatch id. */
  filesByDispatchId: Record<string, ShopDispatchFile[]>;
  /** Recent closed dispatches (minimal Phase 1 list). */
  history: ShopDispatchHistoryItem[];
  meterPhysicalByWorkCenterId?: Record<
    string,
    "running" | "idle" | "stopped" | "offline" | "unknown" | null
  >;
  meterAvailable?: boolean;
};

/** Mutations from the `/shop` detail page. */
export const shopMaintenanceActions = [
  "ReportBreak",
  "ReportPlanned",
  "ReportDowntime",
  /** Non-blocking problem report — does not take the machine offline. */
  "ReportIssue",
  "ResumeAvailability",
  "Assign",
  "Start",
  "End",
  "Complete",
  /** Clear Redis 待开机 after operator confirms the machine is running. */
  "ConfirmStarted"
] as const;

export type ShopMaintenanceAction = (typeof shopMaintenanceActions)[number];

/**
 * Crew boards under `/shop/repair` and `/shop/mold`. People are selected by
 * matching `employeeType.name` against configurable aliases (see
 * `SHOP_CREW_TYPE_ALIASES` in shop.utils).
 */
export const shopCrewKinds = ["repair", "mold"] as const;

export type ShopCrewKind = (typeof shopCrewKinds)[number];

/** One open dispatch assigned to a crew member (not Completed/Cancelled). */
export type ShopCrewTask = {
  id: string;
  maintenanceDispatchId: string | null;
  status: string | null;
  shopKind: ShopDispatchKind;
  note: string | null;
  workCenterId: string | null;
  workCenterName: string | null;
  createdAt: string | null;
};

/** Employee on a crew board + their open assigned tasks. */
export type ShopCrewMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
  locationId: string | null;
  employeeTypeName: string | null;
  tasks: ShopCrewTask[];
};

export type ShopCrewBoard = {
  crew: ShopCrewKind;
  locationId: string;
  locationName: string | null;
  /** Matched `employeeType.name` values used for this board. */
  matchedTypeNames: string[];
  members: ShopCrewMember[];
};
