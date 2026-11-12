import { computeDashboard } from "@/lib/dashboard";
import { DashboardSummarySchema } from "@/schemas";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — the dashboard summary the workspace tab renders.
 *
 * Validated against the schema on the way out, as it was originally: the dashboard is the
 * densest screen in the app and a silently malformed field there is hard to spot.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ learnerId: string }> }) {
  await ctx.params;
  try {
    return Response.json(DashboardSummarySchema.parse(computeDashboard()));
  } catch (err) {
    console.error("dashboard: failed", err);
    return jsonError(503, "Could not build the dashboard");
  }
}
