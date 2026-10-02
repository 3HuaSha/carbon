import { CarbonProvider } from "@carbon/auth";
import { requireAuthSession } from "@carbon/auth/session.server";
import type { LoaderFunctionArgs, MiddlewareFunction } from "react-router";
import { Outlet, useLoaderData } from "react-router";
import { userMiddleware } from "~/middleware/user";

/**
 * Layout for the phone PWA machine overview (`/shop`).
 *
 * Sibling of `display+` / `x+`: reuses `userMiddleware` for auth, company and
 * location scoping without inheriting the operator sidebar chrome. `CarbonProvider`
 * renews the session client-side so an installed PWA does not dump the operator
 * on the login page when the access token expires.
 */
export const middleware: MiddlewareFunction[] = [userMiddleware];

export async function loader({ request }: LoaderFunctionArgs) {
  const { accessToken, expiresAt, expiresIn } = await requireAuthSession(
    request,
    { verify: false }
  );

  return { session: { accessToken, expiresAt, expiresIn } };
}

export default function ShopLayout() {
  const { session } = useLoaderData<typeof loader>();

  return (
    <CarbonProvider session={session}>
      <div className="min-h-dvh w-full bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        <Outlet />
      </div>
    </CarbonProvider>
  );
}
