/**
 * View model for the phone PWA machine overview (`/shop`).
 *
 * Machine = work center. Status is derived from open production events and
 * open maintenance dispatches — there is no `machine.status` column.
 */

export const shopMachineStatuses = [
  "running",
  "idle",
  "waitingRepair",
  "inRepair"
] as const;

export type ShopMachineStatus = (typeof shopMachineStatuses)[number];

export const shopStatusFilters = ["all", ...shopMachineStatuses] as const;

export type ShopStatusFilter = (typeof shopStatusFilters)[number];

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

export type ShopOverview = {
  locationId: string;
  locationName: string | null;
  userId: string;
  machines: ShopMachine[];
};

export const shopMaintenanceActions = [
  "Assign",
  "Start",
  "End",
  "Complete"
] as const;

export type ShopMaintenanceAction = (typeof shopMaintenanceActions)[number];
