import { getMountClient } from "./lib/client";

/**
 * Mount has no install-time server state to converge.
 *
 * An earlier revision registered event-system subscriptions here so a write to
 * customer/supplier/item would push immediately. That was wrong twice over:
 * the event queue routes every SYNC record into the accounting sync function,
 * whose payload schema only admits accounting providers — a Mount record would
 * fail the parse for the whole chunk, taking any accounting records batched
 * with it. Delivery is the publish sweep instead (see lib/publish.ts), which
 * needs no subscriptions and is its own retry.
 *
 * If near-real-time publishing is ever wanted, the way in is a new event-system
 * handler type (the path SEARCH, AUDIT and EMBEDDING took), not a SYNC
 * subscription — and the sweep still has to sit underneath it, because a
 * dropped event is otherwise invisible.
 */
export async function mountHealthcheck(companyId: string) {
  return await getMountClient().healthcheck(companyId);
}
