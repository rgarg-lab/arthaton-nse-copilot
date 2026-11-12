import type { NextRequest } from "next/server";
import { authConfigured, handlers } from "@/auth";

export const runtime = "nodejs";

/**
 * The Auth.js catch-all, gated on configuration.
 *
 * Auth.js throws `MissingSecret` the moment one of its handlers runs without
 * `AUTH_SECRET`, so with no credentials set any request to `/api/auth/*` — a stray link, a
 * crawler, the browser prefetching the sign-in page — produced a server error for a
 * feature the deployment had deliberately not enabled. Answering 404 is both quieter and
 * more truthful: there is no auth endpoint here until you configure one.
 *
 * Set AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET to turn it on; see SETUP.md §6.
 */
function notConfigured(): Response {
  return Response.json(
    { error: "Sign-in is not configured on this deployment." },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!authConfigured()) return notConfigured();
  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  if (!authConfigured()) return notConfigured();
  return handlers.POST(request);
}
