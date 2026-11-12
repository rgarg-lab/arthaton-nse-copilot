import { desc } from "drizzle-orm";
import { db, outbox } from "@/db";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/outbox — what the outbox page re-reads after a cron run. */
export async function GET() {
  try {
    const handle = await db();
    const rows = await handle.select().from(outbox).orderBy(desc(outbox.createdAt)).limit(100);
    return Response.json({
      rows: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        connector: row.connector,
        body: row.body,
        status: row.status,
        deliverAfter: row.deliverAfter?.toISOString() ?? null,
        deliveredAt: row.deliveredAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    console.error("outbox read failed:", err);
    return jsonError(503, "Could not read the outbox");
  }
}
