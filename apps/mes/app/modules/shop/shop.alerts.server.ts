/**
 * Shop-floor reminders + 「刚修完」 + 「待开机」 state.
 *
 * Persistence is Redis (company + location / work-center keyed) so every shared
 * PWA device sees the same alerts and badges without a DB migration. Tradeoff:
 * Redis is fail-soft — if it is down, sync no-ops and badges/alerts are empty
 * until it recovers; a flush drops history (TTL also expires old rows).
 *
 * 待开机 uses the same Redis pattern as 「刚修完」 (`shop:awaitingStart:…`)
 * rather than a DB column — shared PWA devices, no migration, fail-soft.
 */

import { redis } from "@carbon/kv";
import { datetime } from "@carbon/utils";
import type { ShopAlert, ShopMachine, ShopMachineStatus } from "./shop.types";
import type { MeterPhysicalStatus } from "./shop.utils";
import {
  detectShopStatusTransitions,
  mergeShopMachineStatus,
  shopStatusSnapshotFromMachines
} from "./shop.utils";

const ALERTS_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const JUST_FIXED_TTL_SECONDS = 60 * 60 * 48; // 48 hours
const AWAITING_START_TTL_SECONDS = 60 * 60 * 48; // 48 hours
const MAX_ALERTS = 50;
const SNAPSHOT_TTL_SECONDS = 60 * 60 * 24 * 14;

function statusSnapKey(companyId: string, locationId: string) {
  return `shop:statusSnap:${companyId}:${locationId}`;
}

function alertsKey(companyId: string, locationId: string) {
  return `shop:alerts:${companyId}:${locationId}`;
}

function alertsSeenKey(companyId: string, locationId: string) {
  return `shop:alertsSeenAt:${companyId}:${locationId}`;
}

function justFixedKey(companyId: string, workCenterId: string) {
  return `shop:justFixed:${companyId}:${workCenterId}`;
}

function awaitingStartKey(companyId: string, workCenterId: string) {
  return `shop:awaitingStart:${companyId}:${workCenterId}`;
}

function isShopMachineStatus(value: unknown): value is ShopMachineStatus {
  return (
    value === "running" ||
    value === "idle" ||
    value === "break" ||
    value === "down" ||
    value === "awaitingStart" ||
    value === "offline"
  );
}

function parseSnapshot(raw: string | null): Record<string, ShopMachineStatus> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, ShopMachineStatus> = {};
    for (const [id, status] of Object.entries(parsed)) {
      if (isShopMachineStatus(status)) {
        out[id] = status;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function parseAlerts(raw: string | null): ShopAlert[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ShopAlert[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const kind =
        r.kind === "down" ||
        r.kind === "recovered" ||
        r.kind === "issue" ||
        r.kind === "awaitingStart"
          ? r.kind
          : null;
      if (
        typeof r.id !== "string" ||
        !kind ||
        typeof r.workCenterId !== "string" ||
        typeof r.workCenterName !== "string" ||
        typeof r.createdAt !== "string"
      ) {
        continue;
      }
      const note =
        typeof r.note === "string" ? r.note : r.note == null ? undefined : null;
      out.push({
        id: r.id,
        kind,
        workCenterId: r.workCenterId,
        workCenterName: r.workCenterName,
        createdAt: r.createdAt,
        ...(note !== undefined ? { note } : {})
      });
    }
    return out;
  } catch {
    return [];
  }
}

function newAlertId(): string {
  return crypto.randomUUID();
}

export type ShopAlertsSyncResult = {
  alerts: ShopAlert[];
  unreadCount: number;
  justFixedIds: Set<string>;
  awaitingStartIds: Set<string>;
  machines: ShopMachine[];
};

/**
 * Compare last-seen statuses to the current overview, append alerts, set
 * 「刚修完」 flags, refresh the snapshot, and stamp badges onto machines.
 *
 * Also applies Redis 待开机 overlays (and auto-clears them when the machine
 * is physically running again).
 */
export async function syncShopAlertsForOverview(args: {
  companyId: string;
  locationId: string;
  machines: ShopMachine[];
  /** Optional Meter physical status by workCenterId for merge / auto-clear. */
  meterPhysicalByWorkCenterId?: Map<string, MeterPhysicalStatus | null>;
}): Promise<ShopAlertsSyncResult> {
  const { companyId, locationId, machines } = args;
  const snapKey = statusSnapKey(companyId, locationId);
  const listKey = alertsKey(companyId, locationId);

  const [rawSnap, rawAlerts, rawSeen, awaitingStartIds] = await Promise.all([
    redis.get(snapKey),
    redis.get(listKey),
    redis.get(alertsSeenKey(companyId, locationId)),
    getAwaitingStartWorkCenterIds(
      companyId,
      machines.map((m) => m.id)
    )
  ]);

  // Auto-clear 待开机 when Meter/Carbon says running.
  const stillAwaiting = new Set(awaitingStartIds);
  const clearIds: string[] = [];
  for (const machine of machines) {
    if (!stillAwaiting.has(machine.id)) continue;
    const meterPhysical =
      args.meterPhysicalByWorkCenterId?.get(machine.id) ?? null;
    const running = meterPhysical === "running" || machine.status === "running";
    if (running) {
      clearIds.push(machine.id);
      stillAwaiting.delete(machine.id);
    }
  }
  if (clearIds.length > 0) {
    await Promise.all(
      clearIds.map((id) => redis.del(awaitingStartKey(companyId, id)))
    );
  }

  // Apply 待开机 overlay onto display status (Meter already merged into
  // machine.status by the loader when available).
  const withAwaiting: ShopMachine[] = machines.map((m) => {
    if (!stillAwaiting.has(m.id)) return m;
    const meterPhysical = args.meterPhysicalByWorkCenterId?.get(m.id) ?? null;
    return {
      ...m,
      status: mergeShopMachineStatus({
        carbonStatus: m.status,
        meterPhysical,
        awaitingStart: true
      })
    };
  });

  const previous = parseSnapshot(rawSnap);
  const existingAlerts = parseAlerts(rawAlerts);
  const transitions = detectShopStatusTransitions(previous, withAwaiting);

  const nowIso = datetime.timestamp();
  const newAlerts: ShopAlert[] = transitions.map((t) => ({
    id: newAlertId(),
    kind: t.kind,
    workCenterId: t.workCenterId,
    workCenterName: t.workCenterName,
    createdAt: nowIso
  }));

  const justFixedFromTransitions = transitions
    .filter((t) => t.justFixed)
    .map((t) => t.workCenterId);

  if (justFixedFromTransitions.length > 0) {
    await Promise.all(
      justFixedFromTransitions.map((workCenterId) =>
        redis.set(
          justFixedKey(companyId, workCenterId),
          "1",
          "EX",
          JUST_FIXED_TTL_SECONDS
        )
      )
    );
  }

  const alerts =
    newAlerts.length > 0
      ? [...newAlerts, ...existingAlerts].slice(0, MAX_ALERTS)
      : existingAlerts;

  if (newAlerts.length > 0) {
    await redis.set(listKey, JSON.stringify(alerts), "EX", ALERTS_TTL_SECONDS);
  } else if (rawAlerts) {
    // Refresh TTL so an active shop keeps the list alive.
    await redis.set(listKey, JSON.stringify(alerts), "EX", ALERTS_TTL_SECONDS);
  }

  const snapshot = shopStatusSnapshotFromMachines(withAwaiting);
  await redis.set(
    snapKey,
    JSON.stringify(snapshot),
    "EX",
    SNAPSHOT_TTL_SECONDS
  );

  const justFixedIds = await getJustFixedWorkCenterIds(
    companyId,
    withAwaiting.map((m) => m.id)
  );

  const stamped = withAwaiting.map((m) =>
    justFixedIds.has(m.id)
      ? { ...m, justFixed: true }
      : { ...m, justFixed: false }
  );

  const seenAt = typeof rawSeen === "string" ? rawSeen : null;
  const unreadCount = countUnreadAlerts(alerts, seenAt);

  return {
    alerts,
    unreadCount,
    justFixedIds,
    awaitingStartIds: stillAwaiting,
    machines: stamped
  };
}

export async function listShopAlerts(args: {
  companyId: string;
  locationId: string;
}): Promise<ShopAlert[]> {
  const raw = await redis.get(alertsKey(args.companyId, args.locationId));
  return parseAlerts(raw);
}

/** Mark the 提醒 page as visited so the bell unread badge clears. */
export async function markShopAlertsSeen(args: {
  companyId: string;
  locationId: string;
}): Promise<void> {
  await redis.set(
    alertsSeenKey(args.companyId, args.locationId),
    datetime.timestamp(),
    "EX",
    ALERTS_TTL_SECONDS
  );
}

export async function getShopAlertsUnreadCount(args: {
  companyId: string;
  locationId: string;
}): Promise<number> {
  const [rawAlerts, rawSeen] = await Promise.all([
    redis.get(alertsKey(args.companyId, args.locationId)),
    redis.get(alertsSeenKey(args.companyId, args.locationId))
  ]);
  return countUnreadAlerts(
    parseAlerts(rawAlerts),
    typeof rawSeen === "string" ? rawSeen : null
  );
}

export async function getJustFixedWorkCenterIds(
  companyId: string,
  workCenterIds: string[]
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (workCenterIds.length === 0) return ids;

  const values = await Promise.all(
    workCenterIds.map((id) => redis.get(justFixedKey(companyId, id)))
  );
  for (let i = 0; i < workCenterIds.length; i++) {
    if (values[i]) ids.add(workCenterIds[i]!);
  }
  return ids;
}

export async function getAwaitingStartWorkCenterIds(
  companyId: string,
  workCenterIds: string[]
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (workCenterIds.length === 0) return ids;

  const values = await Promise.all(
    workCenterIds.map((id) => redis.get(awaitingStartKey(companyId, id)))
  );
  for (let i = 0; i < workCenterIds.length; i++) {
    if (values[i]) ids.add(workCenterIds[i]!);
  }
  return ids;
}

/** Clear 「刚修完」 when an operator opens the machine detail page. */
export async function clearJustFixedBadge(args: {
  companyId: string;
  workCenterId: string;
}): Promise<void> {
  await redis.del(justFixedKey(args.companyId, args.workCenterId));
}

/** Persist 待开机 after Complete when the machine is not running. */
export async function setAwaitingStart(args: {
  companyId: string;
  workCenterId: string;
}): Promise<void> {
  await redis.set(
    awaitingStartKey(args.companyId, args.workCenterId),
    "1",
    "EX",
    AWAITING_START_TTL_SECONDS
  );
}

/** Clear 待开机 (已开机 / production started). */
export async function clearAwaitingStart(args: {
  companyId: string;
  workCenterId: string;
}): Promise<void> {
  await redis.del(awaitingStartKey(args.companyId, args.workCenterId));
}

/**
 * Push a non-blocking 「报问题」 row into the shared shop 提醒 feed.
 * Status does not change, so this is not driven by the status-snapshot diff.
 */
export async function appendShopIssueAlert(args: {
  companyId: string;
  locationId: string;
  workCenterId: string;
  workCenterName: string;
  note: string | null;
}): Promise<void> {
  await appendShopAlert({
    ...args,
    kind: "issue",
    note: args.note
  });
}

/** Push a 待开机 row into the shared shop 提醒 feed. */
export async function appendShopAwaitingStartAlert(args: {
  companyId: string;
  locationId: string;
  workCenterId: string;
  workCenterName: string;
}): Promise<void> {
  await appendShopAlert({
    ...args,
    kind: "awaitingStart",
    note: null
  });
}

async function appendShopAlert(args: {
  companyId: string;
  locationId: string;
  workCenterId: string;
  workCenterName: string;
  kind: "issue" | "awaitingStart";
  note: string | null;
}): Promise<void> {
  const listKey = alertsKey(args.companyId, args.locationId);
  const rawAlerts = await redis.get(listKey);
  const existing = parseAlerts(rawAlerts);
  const alert: ShopAlert = {
    id: newAlertId(),
    kind: args.kind,
    workCenterId: args.workCenterId,
    workCenterName: args.workCenterName,
    createdAt: datetime.timestamp(),
    ...(args.note != null ? { note: args.note } : {})
  };
  const alerts = [alert, ...existing].slice(0, MAX_ALERTS);
  await redis.set(listKey, JSON.stringify(alerts), "EX", ALERTS_TTL_SECONDS);
}

function countUnreadAlerts(alerts: ShopAlert[], seenAt: string | null): number {
  if (!seenAt) return alerts.length;
  // ISO-8601 timestamps sort lexicographically.
  return alerts.filter((a) => a.createdAt > seenAt).length;
}
