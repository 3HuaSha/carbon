/**
 * Values shared by the integration config (bundled for BOTH client and
 * server) and the API client (server-only). They live here, free of imports,
 * because anything `config.tsx` reaches must be safe to serve to the browser —
 * importing these from `client.ts` pulled `@carbon/auth/client.server` into the
 * client bundle, Vite refused to serve it, and the whole app stopped hydrating.
 */

export const MOUNT_DEFAULT_BASE_URL = "https://api.mount.cloud";

/**
 * Mount versions its API by date. Omitting the header defaults to `latest`,
 * so this is always sent. Bumping it is a breaking-change review:
 * 2026-04-01 -> 2026-06-01 already changed the update payload shape.
 */
export const MOUNT_API_VERSION = "2026-06-01";

export const MOUNT_INTEGRATION_ID = "mount";
