import { describe, expect, it } from "vitest";
import type { ShopMachine, ShopPerson } from "./shop.types";
import {
  countShopStatuses,
  defaultSelectedAssignIds,
  deriveShopMachineStatus,
  detectShopStatusTransitions,
  filterShopMachines,
  formatShopTilePersonLine,
  groupPeopleByAssignGroup,
  groupShopMachinesByArea,
  matchesShopAssignGroup,
  matchesShopCrewEmployeeType,
  parseShopDispatchContent,
  presentShopDispatchProblem,
  resolvePrimaryAssigneeId,
  resolveShopAssignGroup,
  resolveShopDispatchKind,
  shopMachineSubtitle,
  shopStatusSnapshotFromMachines
} from "./shop.utils";

describe("formatShopTilePersonLine", () => {
  it("joins assignee and downtime reason on one line when down", () => {
    expect(
      formatShopTilePersonLine({
        status: "down",
        assigneeName: "明 小",
        downtimeReason: "2号披风液压泄漏"
      })
    ).toEqual({ text: "明 小 · 2号披风液压泄漏", tone: "assignee" });
  });

  it("uses 未分配 then reason when down and unassigned", () => {
    expect(
      formatShopTilePersonLine({
        status: "down",
        assigneeName: null,
        downtimeReason: "异响"
      })
    ).toEqual({ text: "未分配 · 异响", tone: "unassigned" });
  });

  it("omits reason clutter when not down", () => {
    expect(
      formatShopTilePersonLine({
        status: "running",
        assigneeName: "明 小",
        downtimeReason: "should-not-show"
      })
    ).toEqual({ text: "明 小", tone: "assignee" });
    expect(
      formatShopTilePersonLine({
        status: "idle",
        assigneeName: null,
        downtimeReason: "should-not-show"
      })
    ).toEqual({ text: "—", tone: "empty" });
  });

  it("shows 未分配 alone when down with no reason", () => {
    expect(
      formatShopTilePersonLine({
        status: "down",
        assigneeName: "  ",
        downtimeReason: null
      })
    ).toEqual({ text: "未分配", tone: "unassigned" });
  });
});

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

describe("matchesShopAssignGroup / resolveShopAssignGroup", () => {
  it("matches supervisor aliases", () => {
    expect(matchesShopAssignGroup("主管", "supervisor")).toBe(true);
    expect(matchesShopAssignGroup("班长", "supervisor")).toBe(true);
    expect(matchesShopAssignGroup("Supervisor", "supervisor")).toBe(true);
    expect(matchesShopAssignGroup("Manager", "supervisor")).toBe(true);
    expect(matchesShopAssignGroup("机修", "supervisor")).toBe(false);
  });

  it("matches PE aliases without colliding with other columns", () => {
    expect(matchesShopAssignGroup("PE", "pe")).toBe(true);
    expect(matchesShopAssignGroup("Pe", "pe")).toBe(true);
    expect(matchesShopAssignGroup("工艺", "pe")).toBe(true);
    expect(matchesShopAssignGroup("Process Engineer", "pe")).toBe(true);
    expect(matchesShopAssignGroup("工艺工程师", "pe")).toBe(true);
    expect(matchesShopAssignGroup("主管", "pe")).toBe(false);
    expect(matchesShopAssignGroup("机修", "pe")).toBe(false);
  });

  it("resolves groups in display order 主管 → PE → 模房 → 维修", () => {
    expect(resolveShopAssignGroup("主管")).toBe("supervisor");
    expect(resolveShopAssignGroup("PE")).toBe("pe");
    expect(resolveShopAssignGroup("工艺员")).toBe("pe");
    expect(resolveShopAssignGroup("模房")).toBe("mold");
    expect(resolveShopAssignGroup("维修班")).toBe("repair");
    expect(resolveShopAssignGroup("Admin")).toBe(null);
  });
});

describe("groupPeopleByAssignGroup / primary assignee", () => {
  const person = (
    overrides: Partial<ShopPerson> & Pick<ShopPerson, "id" | "name">
  ): ShopPerson => ({
    avatarUrl: null,
    locationId: null,
    employeeTypeName: null,
    assignGroup: null,
    ...overrides
  });

  it("buckets people and keeps empty columns", () => {
    const people = [
      person({ id: "1", name: "A", assignGroup: "supervisor" }),
      person({ id: "2", name: "B", assignGroup: "repair" }),
      person({ id: "3", name: "C", assignGroup: "pe" }),
      person({ id: "4", name: "D", assignGroup: null })
    ];
    const groups = groupPeopleByAssignGroup(people);
    expect(groups.supervisor.map((p) => p.id)).toEqual(["1"]);
    expect(groups.pe.map((p) => p.id)).toEqual(["3"]);
    expect(groups.mold).toEqual([]);
    expect(groups.repair.map((p) => p.id)).toEqual(["2"]);
  });

  it("defaults selection to every supervisor", () => {
    const people = [
      person({ id: "s1", name: "S1", assignGroup: "supervisor" }),
      person({ id: "s2", name: "S2", assignGroup: "supervisor" }),
      person({ id: "p1", name: "P1", assignGroup: "pe" })
    ];
    expect(defaultSelectedAssignIds(people)).toEqual(["s1", "s2"]);
  });

  it("picks primary = first selected 主管, else first overall column order", () => {
    const people = [
      person({ id: "s1", name: "S1", assignGroup: "supervisor" }),
      person({ id: "s2", name: "S2", assignGroup: "supervisor" }),
      person({ id: "p1", name: "P1", assignGroup: "pe" }),
      person({ id: "r1", name: "R1", assignGroup: "repair" })
    ];
    expect(resolvePrimaryAssigneeId(["p1", "s2", "r1"], people)).toBe("s2");
    expect(resolvePrimaryAssigneeId(["r1", "p1"], people)).toBe("p1");
    expect(resolvePrimaryAssigneeId([], people)).toBe(null);
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

describe("presentShopDispatchProblem", () => {
  it("uses content.note as headline and drops the mirrored reporter comment", () => {
    const presented = presentShopDispatchProblem({
      note: "2号披风",
      comments: [
        {
          id: "c1",
          comment: "2号披风",
          createdAt: null,
          createdByName: "Test User"
        }
      ]
    });
    expect(presented.problemText).toBe("2号披风");
    expect(presented.followUpComments).toEqual([]);
  });

  it("keeps later comments that are not the mirrored note", () => {
    const presented = presentShopDispatchProblem({
      note: "液压泄漏",
      comments: [
        {
          id: "c1",
          comment: "液压泄漏",
          createdAt: null,
          createdByName: "Test User"
        },
        {
          id: "c2",
          comment: "已换密封圈",
          createdAt: null,
          createdByName: "明 小"
        }
      ]
    });
    expect(presented.problemText).toBe("液压泄漏");
    expect(presented.followUpComments.map((c) => c.id)).toEqual(["c2"]);
  });

  it("falls back to the first comment when note is empty", () => {
    const presented = presentShopDispatchProblem({
      note: null,
      comments: [
        {
          id: "c1",
          comment: "异响",
          createdAt: null,
          createdByName: "Test User"
        }
      ]
    });
    expect(presented.problemText).toBe("异响");
    expect(presented.followUpComments).toEqual([]);
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

describe("detectShopStatusTransitions", () => {
  it("skips machines with no prior snapshot (cold start)", () => {
    expect(
      detectShopStatusTransitions({}, [
        { id: "t1", name: "T1", status: "down" }
      ])
    ).toEqual([]);
  });

  it("alerts when status becomes down", () => {
    expect(
      detectShopStatusTransitions({ t1: "running", t2: "idle" }, [
        { id: "t1", name: "T1", status: "down" },
        { id: "t2", name: "T2", status: "idle" }
      ])
    ).toEqual([
      {
        kind: "down",
        workCenterId: "t1",
        workCenterName: "T1",
        justFixed: false
      }
    ]);
  });

  it("alerts + justFixed when down → idle", () => {
    expect(
      detectShopStatusTransitions({ t1: "down" }, [
        { id: "t1", name: "T1", status: "idle" }
      ])
    ).toEqual([
      {
        kind: "recovered",
        workCenterId: "t1",
        workCenterName: "T1",
        justFixed: true
      }
    ]);
  });

  it("does not justFixed when down → running", () => {
    expect(
      detectShopStatusTransitions({ t1: "down" }, [
        { id: "t1", name: "T1", status: "running" }
      ])
    ).toEqual([]);
  });

  it("builds a status snapshot map", () => {
    expect(
      shopStatusSnapshotFromMachines([
        { id: "a", status: "idle" },
        { id: "b", status: "down" }
      ])
    ).toEqual({ a: "idle", b: "down" });
  });
});
