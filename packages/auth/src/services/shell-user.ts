type ShellUserRead = {
  data: unknown;
  error: { message?: string } | null;
};

export type ShellUserReadGate = "serve" | "unavailable" | "logout";

/**
 * Supabase-js 2.80 turns a thrown fetch into
 * `{ message: "${name}: ${message}" }`. AbortSignal.timeout rejects as
 * TimeoutError / "The operation was aborted due to timeout".
 */
export function isShellUserReadTimeout(
  error: { message?: string } | null | undefined
): boolean {
  return (error?.message ?? "").includes("aborted due to timeout");
}

/** GoTrue / fetch blips that must not force logout or refresh-token rotation. */
export function isAuthTransportError(
  error: { message?: string; status?: number } | null | undefined
): boolean {
  if (isShellUserReadTimeout(error)) return true;
  const message = (error?.message ?? "").toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("etimedout") ||
    message.includes("socket") ||
    error?.status === 408 ||
    error?.status === 502 ||
    error?.status === 503 ||
    error?.status === 504 ||
    error?.status === 524
  );
}

export function shellUserReadGate(result: ShellUserRead): ShellUserReadGate {
  if (isShellUserReadTimeout(result.error)) return "unavailable";
  if (result.error || result.data == null) return "logout";
  return "serve";
}
