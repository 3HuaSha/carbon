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

export function shellUserReadGate(result: ShellUserRead): ShellUserReadGate {
  if (isShellUserReadTimeout(result.error)) return "unavailable";
  if (result.error || result.data == null) return "logout";
  return "serve";
}
