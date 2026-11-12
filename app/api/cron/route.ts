import { z } from "zod";
import { db } from "@/db";
import { jsonError } from "@/lib/api";
import { queueDigest, runDeliveries } from "@/lib/scheduler";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel cron hits this. In production it is protected by CRON_SECRET; with no secret set
 * it is open, which is right for local development and for a demo where nothing is at
 * stake, and wrong for a deployment — SETUP.md says so.
 */
function authorised(request: Request): boolean {
  const secret = env("CRON_SECRET");
  if (!secret) return true;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

const SimulateBody = z.object({
  /** The instant to evaluate against; the outbox page's time simulator sends this. */
  asOf: z.string().optional(),
  digest: z.boolean().default(false),
});

/** GET /api/cron — the scheduled run: deliver whatever is due now. */
export async function GET(request: Request) {
  if (!authorised(request)) return jsonError(401, "Unauthorised");
  try {
    const handle = await db();
    const result = await runDeliveries(handle);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("cron failed:", err);
    return jsonError(503, "Cron run failed", { error: (err as Error).message });
  }
}

/**
 * POST /api/cron — the same run, against a supplied instant.
 *
 * This is what makes a scheduler demoable: "fast-forward to 9am tomorrow" delivers
 * exactly what would be delivered then, computed in code rather than mimed.
 */
export async function POST(request: Request) {
  if (!authorised(request)) return jsonError(401, "Unauthorised");

  let body: z.infer<typeof SimulateBody> = { digest: false };
  try {
    const raw = await request.json();
    const parsed = SimulateBody.safeParse(raw);
    if (!parsed.success) return jsonError(400, "Invalid body", z.treeifyError(parsed.error));
    body = parsed.data;
  } catch {
    // An empty body means "run now, no digest".
  }

  const asOf = body.asOf ? new Date(body.asOf) : new Date();
  if (Number.isNaN(asOf.getTime())) return jsonError(400, `asOf is not a valid instant: "${body.asOf}"`);

  try {
    const handle = await db();
    if (body.digest) {
      const since = new Date(asOf.getTime() - 7 * 86_400_000);
      await queueDigest(handle, { since, asOf, label: "Weekly digest" });
    }
    const result = await runDeliveries(handle, { asOf, simulated: Boolean(body.asOf) });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("cron simulate failed:", err);
    return jsonError(503, "Cron run failed", { error: (err as Error).message });
  }
}
