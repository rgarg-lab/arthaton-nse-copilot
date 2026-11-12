import { currentUser } from "@/auth";
import { jsonError } from "@/lib/api";
import type { SessionUser } from "@/schemas";

export { safeCallbackUrl, signInUrl } from "./signInUrl";

/**
 * Route-level authorisation. 401 when nobody is signed in. Resource-level checks ("does
 * this row belong to the caller?") return 404 rather than 403 — an unowned id must look
 * exactly like an unknown one — and are added per idea alongside its tables.
 */
export async function requireSession(): Promise<{ ok: true; user: SessionUser } | { ok: false; response: Response }> {
  const user = await currentUser();
  if (!user) return { ok: false, response: jsonError(401, "Sign in to continue") };
  return { ok: true, user };
}
