/**
 * Shop-floor reminders + 「刚修完」 badge state.
 *
 * Persistence is Redis (company + location / work-center keyed) so every shared
 * PWA device sees the same alerts and badges without a DB migration. Tradeoff:
 * Redis is fail-soft — if it is down, sync no-ops and badges/alerts are empty
 * until it recovers; a flush drops history (TTL also expires old rows).
 */

import { redis } from "@carbon/kv";
import { datetime } from "@carbon/utils";
import type { ShopAlert, ShopMachine, ShopMachineStatus } from "./shop.types";
import {
  detectShopStatusTransitions,
  shopStatusSnapshotFromMachines
} from "./shop.utils";

const ALERTS_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const JUST_FIXED_TTL_SECONDS = 60 * 60 * 48; // 48 hours
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

function parseSnapshot(raw: string | null): Record<string, ShopMachineStatus> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, ShopMachineStatus> = {};
    for (const [id, status] of Object.entries(parsed)) {
      if (
        status === "running" ||
        status === "idle" ||
        status === "break" ||
        status === "down"
      ) {
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
        r.kind === "down" || r.kind === "recovered" || r.kind === "issue"
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
  machines: ShopMachine[];
};

/**
 * Compare last-seen statuses to the current overview, append alerts, set
 * 「刚修完」 flags, refresh the snapshot, and stamp `justFixed` onto machines.
 */
export async function syncShopAlertsForOverview(args: {
  companyId: string;
  locationId: string;
  machines: ShopMachine[];
}): Promise<ShopAlertsSyncResult> {
  const { companyId, locationId, machines } = args;
  const snapKey = statusSnapKey(companyId, locationId);
  const listKey = alertsKey(companyId, locationId);

  const [rawSnap, rawAlerts, rawSeen] = await Promise.all([
    redis.get(snapKey),
    redis.get(listKey),
    redis.get(alertsSeenKey(companyId, locationId))
  ]);

  const previous = parseSnapshot(rawSnap);
  const existingAlerts = parseAlerts(rawAlerts);
  const transitions = detectShopStatusTransitions(previous, machines);

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

  const snapshot = shopStatusSnapshotFromMachines(machines);
  await redis.set(
    snapKey,
    JSON.stringify(snapshot),
    "EX",
    SNAPSHOT_TTL_SECONDS
  );

  const justFixedIds = await getJustFixedWorkCenterIds(
    companyId,
    machines.map((m) => m.id)
  );

  const stamped = machines.map((m) =>
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

/** Clear 「刚修完」 when an operator opens the machine detail page. */
export async function clearJustFixedBadge(args: {
  companyId: string;
  workCenterId: string;
}): Promise<void> {
  await redis.del(justFixedKey(args.companyId, args.workCenterId));
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
  const listKey = alertsKey(args.companyId, args.locationId);
  const rawAlerts = await redis.get(listKey);
  const existing = parseAlerts(rawAlerts);
  const alert: ShopAlert = {
    id: newAlertId(),
    kind: "issue",
    workCenterId: args.workCenterId,
    workCenterName: args.workCenterName,
    createdAt: datetime.timestamp(),
    note: args.note
  };
  const alerts = [alert, ...existing].slice(0, MAX_ALERTS);
  await redis.set(listKey, JSON.stringify(alerts), "EX", ALERTS_TTL_SECONDS);
}

function countUnreadAlerts(alerts: ShopAlert[], seenAt: string | null): number {
  if (!seenAt) return alerts.length;
  // ISO-8601 timestamps sort lexicographically.
  return alerts.filter((a) => a.createdAt > seenAt).length;
}
