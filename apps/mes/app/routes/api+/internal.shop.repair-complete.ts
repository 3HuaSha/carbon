import { assertIsPost } from "@carbon/auth";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import {
  isValidShopInternalSecret,
  runShopRepairCompleteFollowUp
} from "~/modules/shop/shop.action.server";

// ERP → MES hook: a dispatch was completed outside the PWA (Telegram 完成).
// Authenticated by the shared SHOP_INTERNAL_SECRET, not a user session.
export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  if (!isValidShopInternalSecret(request)) {
    return data({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    companyId?: unknown;
    dispatchId?: unknown;
  } | null;
  const companyId = typeof body?.companyId === "string" ? body.companyId : "";
  const dispatchId =
    typeof body?.dispatchId === "string" ? body.dispatchId : "";
  if (!companyId || !dispatchId) {
    return data({ ok: false, message: "bad request" }, { status: 400 });
  }

  const result = await runShopRepairCompleteFollowUp(getCarbonServiceRole(), {
    companyId,
    dispatchId
  });
  return data(result, { status: result.ok ? 200 : 409 });
}
