/**
 * View model for the phone PWA machine overview (`/shop`) and machine detail
 * (`/shop/:workCenterId`).
 *
 * Machine = work center. Status is derived from open production events and
 * open maintenance dispatches — there is no `machine.status` column.
 */

export const shopMachineStatuses = [
  "running",
  "idle",
  "break",
  "planned",
  "waitingRepair",
  "inRepair"
] as const;

export type ShopMachineStatus = (typeof shopMachineStatuses)[number];

export const shopStatusFilters = ["all", ...shopMachineStatuses] as const;

export type ShopStatusFilter = (typeof shopStatusFilters)[number];

/** Availability / repair episode kind stored in `maintenanceDispatch.content.shopKind`. */
export const shopDispatchKinds = ["break", "planned", "fault"] as const;

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
};

/** Employee row for the `/shop` assign-person picker. */
export type ShopPerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  locationId: string | null;
};

export type ShopOverview = {
  locationId: string;
  locationName: string | null;
  userId: string;
  machines: ShopMachine[];
  /** Active employees in the company (location peers sorted first in the UI). */
  people: ShopPerson[];
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
};

/** Mutations from the `/shop` detail page. */
export const shopMaintenanceActions = [
  "ReportBreak",
  "ReportPlanned",
  "ReportDowntime",
  "ResumeAvailability",
  "Assign",
  "Start",
  "End",
  "Complete"
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
