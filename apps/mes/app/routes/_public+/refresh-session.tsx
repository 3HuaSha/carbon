import { assertIsPost } from "@carbon/auth";
import { setCompanyId } from "@carbon/auth/company.server";
import {
  getAuthSession,
  refreshAuthSession,
  setAuthSession
} from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { data, redirect, useNavigate } from "react-router";

import { path } from "~/utils/path";

export async function loader() {
  throw redirect(path.to.authenticatedRoot);
}

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);

  // Capture pre-refresh tokens so a failed/duplicate refresh (fail-open) does
  // not Set-Cookie the stale refresh token over a winning rotation.
  const before = await getAuthSession(request);
  const authSession = await refreshAuthSession(request);
  const rotated = authSession.refreshToken !== before?.refreshToken;

  if (!rotated) {
    return data({ success: true });
  }

  const sessionCookie = await setAuthSession(request, {
    authSession
  });
  const companyIdCookie = setCompanyId(authSession.companyId);

  return data(
    { success: true },
    {
      headers: [
        ["Set-Cookie", sessionCookie],
        ["Set-Cookie", companyIdCookie]
      ]
    }
  );
}

export function ErrorBoundary() {
  const navigate = useNavigate();
  navigate(path.to.authenticatedRoot);
  return null;
}
