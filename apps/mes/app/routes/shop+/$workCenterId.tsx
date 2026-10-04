import { assertIsPost, error, notFound, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { userContext } from "~/context";
import {
  type ShopMaintenanceAction,
  shopMaintenanceActions
} from "~/modules/shop";
import { runShopMaintenanceAction } from "~/modules/shop/shop.action.server";
import { clearJustFixedBadge } from "~/modules/shop/shop.alerts.server";
import { getShopMachineDetail } from "~/modules/shop/shop.server";
import { MachineDetailPage } from "~/modules/shop/ui/MachineDetailPage";

/**
 * Dedicated machine workspace for the phone PWA. Replaces the old BottomSheet
 * primary UX: status, WO/QC, break / planned / fault actions, notes + media.
 */
export async function loader({ context, request, params }: LoaderFunctionArgs) {
  const { companyId, userId } = await requirePermissions(request, {});
  const locationId = context.get(userContext)?.locationId;
  if (!locationId) throw notFound("Location not found");

  const workCenterId = params.workCenterId;
  if (!workCenterId) throw notFound("Work center not found");
  // Static boards live at /shop/repair, /shop/mold, /shop/alerts — never treat
  // those reserved segments as work-center ids if routing ever falls through.
  if (
    workCenterId === "repair" ||
    workCenterId === "mold" ||
    workCenterId === "alerts"
  ) {
    throw notFound("Work center not found");
  }

  const serviceRole = getCarbonServiceRole();
  const [detail] = await Promise.all([
    getShopMachineDetail(serviceRole, {
      companyId,
      locationId,
      userId,
      workCenterId
    }),
    // Visiting the machine clears 「刚修完」 for every shared PWA device.
    clearJustFixedBadge({ companyId, workCenterId })
  ]);

  if (!detail) throw notFound("Work center not found");
  // companyId must ride the loader — `/shop` is a sibling of `/x`, so
  // `useUser()` (which reads authenticated-root route data) cannot supply it.
  return { ...detail, companyId };
}

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { companyId, userId } = await requirePermissions(request, {});

  const formData = await request.formData();
  const rawAction = String(formData.get("action") ?? "");
  const dispatchId = String(formData.get("dispatchId") ?? "") || null;
  const workCenterId = String(formData.get("workCenterId") ?? "") || null;
  const assigneeId = String(formData.get("assigneeId") ?? "") || null;
  const notifyUserIds = String(formData.get("notifyUserIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const note = String(formData.get("note") ?? "") || null;

  if (!shopMaintenanceActions.includes(rawAction as ShopMaintenanceAction)) {
    return data(
      { ok: false as const },
      await flash(request, error(null, "Invalid maintenance action"))
    );
  }

  const reportActions = new Set([
    "ReportBreak",
    "ReportPlanned",
    "ReportDowntime"
  ]);

  if (!reportActions.has(rawAction) && !dispatchId) {
    return data(
      { ok: false as const },
      await flash(request, error(null, "Invalid maintenance action"))
    );
  }

  if (reportActions.has(rawAction) && !workCenterId) {
    return data(
      { ok: false as const },
      await flash(request, error(null, "Work center is required"))
    );
  }

  const serviceRole = getCarbonServiceRole();
  const result = await runShopMaintenanceAction(serviceRole, {
    action: rawAction as ShopMaintenanceAction,
    dispatchId,
    workCenterId,
    assigneeId,
    notifyUserIds,
    note,
    companyId,
    userId
  });

  if (!result.ok) {
    return data(
      { ok: false as const },
      await flash(request, error(null, result.message))
    );
  }

  const flashMessage =
    result.telegramUnbound === true
      ? success(`${result.message} — 该员工未绑定 Telegram`)
      : result.warning
        ? error(null, result.message)
        : success(result.message);

  return data(
    {
      ok: true as const,
      action: result.action,
      dispatchId: result.dispatchId,
      telegramUnbound: result.telegramUnbound === true
    },
    await flash(request, flashMessage)
  );
}

export default function ShopMachineDetailRoute() {
  const detail = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  return (
    <MachineDetailPage
      machine={detail.machine}
      companyId={detail.companyId}
      userId={detail.userId}
      people={detail.people}
      commentsByDispatchId={detail.commentsByDispatchId}
      filesByDispatchId={detail.filesByDispatchId}
      history={detail.history}
      fetcher={fetcher}
    />
  );
}
