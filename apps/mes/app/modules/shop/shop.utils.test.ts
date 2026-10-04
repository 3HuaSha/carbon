import { describe, expect, it } from "vitest";
import type { ShopMachine } from "./shop.types";
import {
  countShopStatuses,
  deriveShopMachineStatus,
  filterShopMachines,
  groupShopMachinesByArea,
  matchesShopCrewEmployeeType,
  parseShopDispatchContent,
  resolveShopDispatchKind,
  shopMachineSubtitle
} from "./shop.utils";

describe("matchesShopCrewEmployeeType", () => {
  it("matches Chinese and English repair aliases", () => {
    expect(matchesShopCrewEmployeeType("机修", "repair")).toBe(true);
    expect(matchesShopCrewEmployeeType("维修班", "repair")).toBe(true);
    expect(matchesShopCrewEmployeeType("Maintenance", "repair")).toBe(true);
    expect(matchesShopCrewEmployeeType("Admin", "repair")).toBe(false);
  });

  it("matches mold-room aliases without colliding with repair", () => {
    expect(matchesShopCrewEmployeeType("模房", "mold")).toBe(true);
    expect(matchesShopCrewEmployeeType("Mold Shop", "mold")).toBe(true);
    expect(matchesShopCrewEmployeeType("机修", "mold")).toBe(false);
    expect(matchesShopCrewEmployeeType(null, "mold")).toBe(false);
  });
});

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

  it("returns down for Open, Assigned, or In Progress fault", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: true,
        openDispatches: [
          { status: "Open", oeeImpact: "Down", shopKind: "fault" }
        ],
        isBlocked: false
      })
    ).toBe("down");

    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: false,
        openDispatches: [
          { status: "Assigned", oeeImpact: "Down", shopKind: "fault" }
        ],
        isBlocked: false
      })
    ).toBe("down");

    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: true,
        openDispatches: [
          { status: "In Progress", oeeImpact: "Down", shopKind: "fault" }
        ],
        isBlocked: false
      })
    ).toBe("down");
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

  it("returns down for planned downtime (same presentation as fault)", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: false,
        openDispatches: [
          { status: "Open", oeeImpact: "Planned", shopKind: "planned" }
        ],
        isBlocked: false
      })
    ).toBe("down");
  });

  it("prefers down over break when both are open", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: false,
        openDispatches: [
          { status: "Open", oeeImpact: "No Impact", shopKind: "break" },
          { status: "Assigned", oeeImpact: "Down", shopKind: "fault" }
        ],
        isBlocked: false
      })
    ).toBe("down");
  });

  it("returns down when blocked with no open dispatch", () => {
    expect(
      deriveShopMachineStatus({
        hasOpenProductionEvent: false,
        openDispatches: [],
        isBlocked: true
      })
    ).toBe("down");
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
    machine({ id: "3", name: "C", status: "down", departmentName: null }),
    machine({ id: "4", name: "D", status: "break", departmentName: null }),
    machine({ id: "5", name: "E", status: "down", departmentName: null })
  ];

  it("filters by running / down / all (idle and break still on tiles when all)", () => {
    expect(filterShopMachines(machines, "all")).toHaveLength(5);
    expect(filterShopMachines(machines, "running").map((m) => m.id)).toEqual([
      "1"
    ]);
    expect(filterShopMachines(machines, "down").map((m) => m.id)).toEqual([
      "3",
      "5"
    ]);
  });

  it("counts statuses", () => {
    expect(countShopStatuses(machines)).toEqual({
      running: 1,
      idle: 1,
      break: 1,
      down: 2
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
