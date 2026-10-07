import { CarbonProvider } from "@carbon/auth";
import { requireAuthSession } from "@carbon/auth/session.server";
import { isSearchParamOnlyNavigation } from "@carbon/utils";
import type {
  LinksFunction,
  LoaderFunctionArgs,
  MiddlewareFunction,
  ShouldRevalidateFunction
} from "react-router";
import { Outlet, useLoaderData, useLocation } from "react-router";
import { userMiddleware } from "~/middleware/user";
import { ShopTabNav } from "~/modules/shop/ui/ShopTabNav";
import ShopIos from "~/styles/shop-ios.css?url";
import { path } from "~/utils/path";

/** Cheap iOS tokens for `/shop` only — opaque surfaces, no blur. */
export const links: LinksFunction = () => [
  { rel: "stylesheet", href: ShopIos }
];

/**
 * Layout for the phone PWA machine overview (`/shop`).
 *
 * Sibling of `display+` / `x+`: reuses `userMiddleware` for auth, company and
 * location scoping without inheriting the operator sidebar chrome. `CarbonProvider`
 * renews the session client-side so an installed PWA does not dump the operator
 * on the login page when the access token expires.
 *
 * `verify: false` — same as `display+`: the cookie + silent refresh is enough
 * for the shop floor PWA. A GoTrue `getUser` on every tile tap was the
 * "read the user again" tax Bowen asked us to stop.
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formMethod,
  formAction,
  defaultShouldRevalidate
}) => {
  // Keep session props fresh after an explicit refresh / company switch.
  if (
    currentUrl.pathname.startsWith("/refresh-session") ||
    currentUrl.pathname.startsWith("/switch-company") ||
    formAction === path.to.refreshSession
  ) {
    return true;
  }

  // Shop leaf navigations (overview ↔ machine ↔ repair/mold) do not change
  // the access token. Re-running this loader only re-reads the cookie and
  // risks an `isExpiringSoon` refresh under a GoTrue blip.
  if (
    currentUrl.pathname.startsWith("/shop") &&
    nextUrl.pathname.startsWith("/shop") &&
    (formMethod === undefined || formMethod === "GET")
  ) {
    return false;
  }

  if (isSearchParamOnlyNavigation({ currentUrl, nextUrl, formMethod })) {
    return false;
  }

  return defaultShouldRevalidate;
};

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
  const { pathname } = useLocation();
  const activeTab = pathname.startsWith(path.to.shopRepair)
    ? "repair"
    : pathname.startsWith(path.to.shopMold)
      ? "mold"
      : "machines";

  return (
    <CarbonProvider session={session}>
      <div className="shop-ios min-h-dvh w-full pl-[calc(52px+env(safe-area-inset-left))] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        <Outlet />
        <ShopTabNav active={activeTab} />
      </div>
    </CarbonProvider>
  );
}
