import { describe, expect, it } from "vitest";
import type { ShopMachine } from "./shop.types";
import {
  countShopStatuses,
  deriveShopMachineStatus,
  filterShopMachines,
  groupShopMachinesByArea,
  parseShopDispatchContent,
  resolveShopDispatchKind,
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

describe("resolveShopDispatchKind", () => {
  it("prefers explicit shopKind", () => {
    expect(
      resolveShopDispatchKind({ shopKind: "break", oeeImpact: "Down" })
    ).toBe("break");
  });

  it("infers planned / fault from oeeImpact", () => {
    expect(resolveShopDispatchKind({ oeeImpact: "Planned" })).toBe("planned");
    expect(resolveShopDispatchKind({ oeeImpact: "Down" })).toBe("fault");
  });
});

describe("parseShopDispatchContent", () => {
  it("reads shopKind and note from content JSON", () => {
    expect(
      parseShopDispatchContent({ shopKind: "planned", note: " changeover " })
    ).toEqual({ shopKind: "planned", note: "changeover" });
  });

  it("returns nulls for empty content", () => {
    expect(parseShopDispatchContent({})).toEqual({
      shopKind: null,
      note: null
    });
  });
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

  it("returns waitingRepair for Open or Assigned fault dispatches", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: true,
        openDispatches: [
          { status: "Open", oeeImpact: "Down", shopKind: "fault" }
        ],
        isBlocked: false
      })
    ).toBe("waitingRepair");

    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: false,
        openDispatches: [
          { status: "Assigned", oeeImpact: "Down", shopKind: "fault" }
        ],
        isBlocked: false
      })
    ).toBe("waitingRepair");
  });

  it("returns inRepair for fault In Progress", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: true,
        openDispatches: [
          { status: "In Progress", oeeImpact: "Down", shopKind: "fault" }
        ],
        isBlocked: false
      })
    ).toBe("inRepair");
  });

  it("returns break for break shopKind even when production was running", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: false,
        openDispatches: [
          { status: "Open", oeeImpact: "No Impact", shopKind: "break" }
        ],
        isBlocked: false
      })
    ).toBe("break");
  });

  it("returns planned for planned downtime (not waitingRepair)", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: false,
        openDispatches: [
          { status: "Open", oeeImpact: "Planned", shopKind: "planned" }
        ],
        isBlocked: false
      })
    ).toBe("planned");
  });

  it("prefers fault waiting over planned", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: false,
        openDispatches: [
          { status: "Open", oeeImpact: "Planned", shopKind: "planned" },
          { status: "Assigned", oeeImpact: "Down", shopKind: "fault" }
        ],
        isBlocked: false
      })
    ).toBe("waitingRepair");
  });

  it("prefers inRepair over waitingRepair", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: false,
        openDispatches: [
          { status: "Open", oeeImpact: "Down", shopKind: "fault" },
          { status: "In Progress", oeeImpact: "Down", shopKind: "fault" }
        ],
        isBlocked: false
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
    machine({ id: "3", name: "C", status: "inRepair", departmentName: null }),
    machine({ id: "4", name: "D", status: "break", departmentName: null }),
    machine({ id: "5", name: "E", status: "planned", departmentName: null })
  ];

  it("filters by status", () => {
    expect(filterShopMachines(machines, "all")).toHaveLength(5);
    expect(filterShopMachines(machines, "running").map((m) => m.id)).toEqual([
      "1"
    ]);
    expect(filterShopMachines(machines, "break").map((m) => m.id)).toEqual([
      "4"
    ]);
  });

  it("counts statuses", () => {
    expect(countShopStatuses(machines)).toEqual({
      running: 1,
      idle: 1,
      break: 1,
      planned: 1,
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
