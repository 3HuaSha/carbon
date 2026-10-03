import { CarbonEdition, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import { updateSubscriptionQuantityForCompany } from "@carbon/stripe/stripe.server";
import { Edition } from "@carbon/utils";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { activateEmployeesValidator } from "~/modules/users";
import { activatePendingEmployees } from "~/modules/users/users.server";

export async function action({ request }: ActionFunctionArgs) {
  const { companyId } = await requirePermissions(request, {
    create: "users"
  });

  const validation = await validator(activateEmployeesValidator).validate(
    await request.formData()
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const { users } = validation.data;

  const result = await activatePendingEmployees({
    userIds: users,
    companyId
  });

  if (!result.success) {
    return data(
      { success: false },
      await flash(
        request,
        error(result.message, "Failed to activate employees")
      )
    );
  }

  if (CarbonEdition === Edition.Cloud && result.activated > 0) {
    await updateSubscriptionQuantityForCompany(companyId);
  }

  return data(
    { success: true },
    await flash(
      request,
      success(
        result.activated === 1
          ? "Employee activated (no invite email)"
          : `Activated ${result.activated} employees (no invite email)`
      )
    )
  );
}
