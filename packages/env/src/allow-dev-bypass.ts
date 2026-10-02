/**
 * Explicit operator opt-in for magic-link-free sign-in via DEV_BYPASS_EMAIL on
 * a non-local deploy (Railway demo, staging, BYOC test). Never set this on a
 * real production tenant with customer data — anyone who knows the bypass
 * email can mint a session. Accepts "1" or "true" (case-insensitive).
 */
export function parseAllowDevBypassFlag(raw: string | undefined): boolean {
  return raw === "1" || raw?.toLowerCase() === "true";
}
