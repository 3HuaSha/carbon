/**
 * MachineMeter HTTP client for MES `/shop`.
 *
 * Same API tree kanban-dashboard uses (postgres paths by default). Base URL
 * comes from `MACHINE_METER_API_BASE_URL` — never hardcode factory LAN.
 *
 * MachineMeter lives on the factory internal network. Railway (and most cloud
 * hosts) cannot reach `172.21.*` directly — production needs an HTTPS tunnel
 * or reverse-proxy that exposes the same `/api/postgres/machine/…` paths, or
 * an on-prem sync that pushes status/WO into Carbon. Unset / unreachable →
 * fail open to Carbon-only shop status (报问题 / 待开机 still work).
 */

import {
  MACHINE_METER_API_BASE_URL,
  MACHINE_METER_API_TIMEOUT_MS
} from "@carbon/auth";
import { getLogger } from "@carbon/logger";
import {
  type MeterPhysicalStatus,
  mapMeterStatusCode,
  normalizeMeterMachineId,
  normalizeMeterWorkOrder
} from "./shop.utils";

const logger = getLogger("mes", "shop-meter");

const DEFAULT_TIMEOUT_MS = 8_000;
const STATUS_LOG_CONCURRENCY = 16;
// Status needs one request per machine, so concurrent /shop loads share a
// snapshot instead of each fanning out ~100 requests.
const SNAPSHOT_TTL_MS = 10_000;

let cachedSnapshot: { at: number; promise: Promise<MeterShopSnapshot> } | null =
  null;

export function resetMeterSnapshotCache() {
  cachedSnapshot = null;
}

export type { MeterPhysicalStatus };

export type MeterMachineSnapshot = {
  /** Normalized machine id (uppercase), e.g. T1 / C12. */
  machineId: string;
  physicalStatus: MeterPhysicalStatus;
  /** Current WO / 单号 from Meter `Index_` (Remaining / scanner). */
  workOrder: string | null;
};

export type MeterShopSnapshot = {
  byMachineId: Map<string, MeterMachineSnapshot>;
  /** True when base URL is set and at least one fetch succeeded. */
  available: boolean;
};

function timeoutMs(): number {
  const raw = MACHINE_METER_API_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

function baseUrl(): string | null {
  const raw = MACHINE_METER_API_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.result)) return record.result;
    if (Array.isArray(record.rows)) return record.rows;
  }
  return [];
}

function pickField(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") return row[key];
  }
  return null;
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal
  });
  if (!response.ok) {
    throw new Error(`MachineMeter HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Fetch current board status + per-machine status log + Remaining (Index_ 单号).
 * Cached for SNAPSHOT_TTL_MS.
 * Returns empty / available:false when unset or any hard failure.
 */
export function fetchMeterShopSnapshot(): Promise<MeterShopSnapshot> {
  const now = performance.now();
  if (cachedSnapshot && now - cachedSnapshot.at < SNAPSHOT_TTL_MS) {
    return cachedSnapshot.promise;
  }
  const promise = loadMeterShopSnapshot();
  cachedSnapshot = { at: now, promise };
  return promise;
}

async function loadMeterShopSnapshot(): Promise<MeterShopSnapshot> {
  const base = baseUrl();
  if (!base) {
    return { byMachineId: new Map(), available: false };
  }

  const ms = timeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  try {
    const boardUrl = `${base}/api/postgres/machine/getPostgresCurrentBoardStatus`;
    const remainingUrl = `${base}/api/postgres/machine/getPostgresRemaining`;

    const [boardResult, remainingResult] = await Promise.allSettled([
      fetchJson(boardUrl, controller.signal),
      fetchJson(remainingUrl, controller.signal)
    ]);

    const byMachineId = new Map<string, MeterMachineSnapshot>();

    if (boardResult.status === "fulfilled") {
      for (const raw of normalizeArray(boardResult.value)) {
        const row = asRecord(raw);
        const machineId = normalizeMeterMachineId(
          pickField(row, "Machine", "machine")
        );
        if (!machineId || machineId.includes("99")) continue;
        byMachineId.set(machineId, {
          machineId,
          physicalStatus: mapMeterStatusCode(
            pickField(row, "MachineStatus", "machine_status")
          ),
          workOrder: null
        });
      }
    } else {
      logger.warn("MachineMeter board status fetch failed", {
        error:
          boardResult.reason instanceof Error
            ? boardResult.reason.message
            : String(boardResult.reason)
      });
    }

    // The postgres BoardStatus table carries only {machine, datetime_}; the
    // live status is the newest MachineStatusChanges row, served one machine
    // at a time. (The SQL Server `/api/machine/…` tree is no longer fed.)
    const unknownIds = [...byMachineId.values()]
      .filter((m) => m.physicalStatus === "unknown")
      .map((m) => m.machineId);
    let statusLogFulfilled = false;
    let statusLogFailures = 0;
    for (let i = 0; i < unknownIds.length; i += STATUS_LOG_CONCURRENCY) {
      const batch = unknownIds.slice(i, i + STATUS_LOG_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((machineId) =>
          fetchJson(
            `${base}/api/postgres/machine/getMachineStatusLog?machine=${encodeURIComponent(machineId)}`,
            controller.signal
          )
        )
      );
      results.forEach((result, idx) => {
        if (result.status !== "fulfilled") {
          statusLogFailures++;
          return;
        }
        statusLogFulfilled = true;
        const latest = asRecord(normalizeArray(result.value)[0]);
        const physicalStatus = mapMeterStatusCode(
          pickField(latest, "machine_status", "MachineStatus")
        );
        const existing = byMachineId.get(batch[idx]!);
        if (existing && physicalStatus !== "unknown") {
          byMachineId.set(batch[idx]!, { ...existing, physicalStatus });
        }
      });
    }
    if (statusLogFailures > 0) {
      logger.warn("MachineMeter status log fetch failed", {
        failed: statusLogFailures,
        total: unknownIds.length
      });
    }

    if (remainingResult.status === "fulfilled") {
      for (const raw of normalizeArray(remainingResult.value)) {
        const row = asRecord(raw);
        const workOrder = normalizeMeterWorkOrder(
          pickField(row, "Index_", "index_")
        );
        if (!workOrder) continue;
        const machinesRaw = pickField(row, "Machines", "machines");
        const machineIds = String(machinesRaw ?? "")
          .split(",")
          .map((s) => normalizeMeterMachineId(s))
          .filter(Boolean);
        for (const machineId of machineIds) {
          if (machineId.includes("99")) continue;
          const existing = byMachineId.get(machineId);
          byMachineId.set(machineId, {
            machineId,
            physicalStatus: existing?.physicalStatus ?? "unknown",
            workOrder: existing?.workOrder ?? workOrder
          });
        }
      }
    } else {
      logger.warn("MachineMeter remaining fetch failed", {
        error:
          remainingResult.reason instanceof Error
            ? remainingResult.reason.message
            : String(remainingResult.reason)
      });
    }

    const available =
      boardResult.status === "fulfilled" ||
      statusLogFulfilled ||
      remainingResult.status === "fulfilled";

    return { byMachineId, available };
  } catch (err) {
    logger.warn("MachineMeter snapshot failed (fail open)", {
      error: err instanceof Error ? err.message : String(err)
    });
    return { byMachineId: new Map(), available: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Lookup by workCenter.name (case-insensitive). */
export function meterSnapshotForWorkCenterName(
  snapshot: MeterShopSnapshot,
  workCenterName: string | null | undefined
): MeterMachineSnapshot | null {
  const id = normalizeMeterMachineId(workCenterName);
  if (!id) return null;
  return snapshot.byMachineId.get(id) ?? null;
}
