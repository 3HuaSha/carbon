import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@carbon/auth", () => ({
  MACHINE_METER_API_BASE_URL: "http://meter.test",
  MACHINE_METER_API_TIMEOUT_MS: "1000"
}));

vi.mock("@carbon/logger", () => ({
  getLogger: () => ({ warn: vi.fn() })
}));

import {
  fetchMeterShopSnapshot,
  resetMeterSnapshotCache
} from "./shop.meter.server";

const POSTGRES_BOARD = "/api/postgres/machine/getPostgresCurrentBoardStatus";
const POSTGRES_REMAINING = "/api/postgres/machine/getPostgresRemaining";
const STATUS_LOG = "/api/postgres/machine/getMachineStatusLog";

type Routes = {
  board?: unknown;
  remaining?: unknown;
  statusLog?: Record<string, unknown>;
};

function stubMeter(routes: Routes) {
  const fetchMock = vi.fn(async (url: string) => {
    const parsed = new URL(url);
    let body: unknown;
    if (parsed.pathname === POSTGRES_BOARD) body = routes.board;
    else if (parsed.pathname === POSTGRES_REMAINING) body = routes.remaining;
    else if (parsed.pathname === STATUS_LOG)
      body = routes.statusLog?.[parsed.searchParams.get("machine") ?? ""];
    if (body === undefined) return new Response("not found", { status: 404 });
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function statusLogCalls(fetchMock: ReturnType<typeof stubMeter>) {
  return fetchMock.mock.calls
    .map(([url]) => new URL(url))
    .filter((u) => u.pathname === STATUS_LOG)
    .map((u) => u.searchParams.get("machine"));
}

describe("fetchMeterShopSnapshot", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    resetMeterSnapshotCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads each machine's newest status-log row when the board lacks status", async () => {
    const fetchMock = stubMeter({
      board: [
        { machine: "t1", datetime_: "2026-09-29T21:13:12.000Z" },
        { machine: "C12", datetime_: "2026-09-23T14:34:02.000Z" },
        { machine: "C99", datetime_: "2026-09-23T14:34:02.000Z" }
      ],
      remaining: [{ index_: "WO-1", machines: "T1" }],
      statusLog: {
        T1: [
          { machine: "T1", machine_status: "1" },
          { machine: "T1", machine_status: "0" }
        ],
        C12: [{ machine: "C12", machine_status: "4" }]
      }
    });

    const snapshot = await fetchMeterShopSnapshot();

    expect(statusLogCalls(fetchMock).sort()).toEqual(["C12", "T1"]);
    expect(snapshot.available).toBe(true);
    expect(snapshot.byMachineId.get("T1")).toEqual({
      machineId: "T1",
      physicalStatus: "running",
      workOrder: "WO-1"
    });
    expect(snapshot.byMachineId.get("C12")?.physicalStatus).toBe("offline");
    expect(snapshot.byMachineId.has("C99")).toBe(false);
  });

  it("skips the status log when the board already carries status", async () => {
    const fetchMock = stubMeter({
      board: [{ Machine: "T1", MachineStatus: "1" }],
      remaining: []
    });

    const snapshot = await fetchMeterShopSnapshot();

    expect(statusLogCalls(fetchMock)).toEqual([]);
    expect(snapshot.byMachineId.get("T1")?.physicalStatus).toBe("running");
  });

  it("leaves a machine unknown when its status log fails or is empty", async () => {
    stubMeter({
      board: [{ machine: "T1" }, { machine: "T2" }, { machine: "T3" }],
      remaining: [],
      statusLog: {
        T1: new Error("connect ECONNREFUSED"),
        T2: [],
        T3: [{ machine_status: "2" }]
      }
    });

    const snapshot = await fetchMeterShopSnapshot();

    expect(snapshot.available).toBe(true);
    expect(snapshot.byMachineId.get("T1")?.physicalStatus).toBe("unknown");
    expect(snapshot.byMachineId.get("T2")?.physicalStatus).toBe("unknown");
    expect(snapshot.byMachineId.get("T3")?.physicalStatus).toBe("stopped");
  });

  it("reports unavailable when every endpoint fails", async () => {
    stubMeter({
      board: new Error("timeout"),
      remaining: new Error("timeout")
    });

    const snapshot = await fetchMeterShopSnapshot();

    expect(snapshot.available).toBe(false);
    expect(snapshot.byMachineId.size).toBe(0);
  });

  it("shares one snapshot across calls within the cache window", async () => {
    const fetchMock = stubMeter({
      board: [{ Machine: "T1", MachineStatus: "1" }],
      remaining: []
    });

    await fetchMeterShopSnapshot();
    await fetchMeterShopSnapshot();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
