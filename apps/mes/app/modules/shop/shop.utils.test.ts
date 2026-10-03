import { describe, expect, it } from "vitest";
import type { ShopMachine } from "./shop.types";
import {
  countShopStatuses,
  deriveShopMachineStatus,
  filterShopMachines,
  groupShopMachinesByArea,
  shopMachineSubtitle
} from "./shop.utils";

const machine = (
  overrides: Partial<ShopMachine> & Pick<ShopMachine, "id" | "name" | "status">
): ShopMachine => ({
  subtitle: null,
  departmentName: null,
  currentJobReadableId: null,
  currentWork: null,
  isBlocked: false,
  openDispatches: [],
  ...overrides
});

describe("deriveShopMachineStatus", () => {
  it("returns running when an open production event exists", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: true,
        openDispatches: [],
        isBlocked: false
      })
    ).toBe("running");
  });

  it("returns idle when nothing is open", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: false,
        openDispatches: [],
        isBlocked: false
      })
    ).toBe("idle");
  });

  it("returns waitingRepair for Open or Assigned dispatches", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: true,
        openDispatches: [{ status: "Open" }],
        isBlocked: false
      })
    ).toBe("waitingRepair");

    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: false,
        openDispatches: [{ status: "Assigned" }],
        isBlocked: false
      })
    ).toBe("waitingRepair");
  });

  it("returns inRepair for In Progress or blocked", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: true,
        openDispatches: [{ status: "In Progress" }],
        isBlocked: false
      })
    ).toBe("inRepair");

    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: false,
        openDispatches: [],
        isBlocked: true
      })
    ).toBe("inRepair");
  });
});

describe("filterShopMachines / countShopStatuses / groupShopMachinesByArea", () => {
  const machines: ShopMachine[] = [
    machine({
      id: "1",
      name: "B",
      status: "running",
      departmentName: "Welding"
    }),
    machine({
      id: "2",
      name: "A",
      status: "idle",
      departmentName: "Welding"
    }),
    machine({ id: "3", name: "C", status: "inRepair", departmentName: null })
  ];

  it("filters by status", () => {
    expect(filterShopMachines(machines, "all")).toHaveLength(3);
    expect(filterShopMachines(machines, "running").map((m) => m.id)).toEqual([
      "1"
    ]);
  });

  it("counts statuses", () => {
    expect(countShopStatuses(machines)).toEqual({
      running: 1,
      idle: 1,
      waitingRepair: 0,
      inRepair: 1
    });
  });

  it("groups named areas before the untitled bucket", () => {
    const groups = groupShopMachinesByArea(machines);
    expect(groups.map((g) => g.area)).toEqual(["Welding", null]);
    expect(groups[0].machines.map((m) => m.name)).toEqual(["A", "B"]);
  });
});

describe("shopMachineSubtitle", () => {
  it("prefers description over process id", () => {
    expect(
      shopMachineSubtitle({
        description: "CNC mill",
        processes: ["proc-1"]
      })
    ).toBe("CNC mill");
  });

  it("falls back to the first process id", () => {
    expect(
      shopMachineSubtitle({ description: "  ", processes: ["proc-1"] })
    ).toBe("proc-1");
  });
});
