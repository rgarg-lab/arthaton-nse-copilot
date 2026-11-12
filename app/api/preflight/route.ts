import { preflight } from "@/lib/preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/preflight — the readiness report, also used by `npm run preflight`. */
export async function GET() {
  const report = await preflight();
  return Response.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
