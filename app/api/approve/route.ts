import { z } from "zod";
import { db } from "@/db";
import { approve, listPending, reject } from "@/lib/approvals";
import { jsonError, parseBody } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  actionId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  /** The tray lets the user edit before approving; this is what they changed it to. */
  edits: z
    .object({
      preview: z.string().min(1).max(10_000).optional(),
      payload: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

/** GET /api/approve?sessionId= — what is waiting for a decision. */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId") ?? undefined;
  try {
    const handle = await db();
    const pending = await listPending(handle, sessionId);
    return Response.json({ pending });
  } catch (err) {
    console.error("approve: list failed", err);
    return jsonError(503, "Could not read the approval queue");
  }
}

/**
 * POST /api/approve — approve or reject one action.
 *
 * Approving is the only way anything reaches a connector: the agent's tools can queue but
 * never send. See src/lib/approvals for why the outbox row is written before delivery is
 * attempted.
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, Body);
  if (!parsed.ok) return parsed.response;

  let handle;
  try {
    handle = await db();
  } catch (err) {
    console.error("approve: database unavailable", err);
    return jsonError(503, "Database unavailable");
  }

  if (parsed.data.decision === "reject") {
    const result = await reject(handle, parsed.data.actionId);
    return Response.json(result, { status: result.ok ? 200 : 409 });
  }

  const result = await approve(handle, parsed.data.actionId, parsed.data.edits);
  // A failed delivery is not a failed request: the approval was recorded and is retryable.
  return Response.json(result, { status: result.ok || result.outboxId ? 200 : 409 });
}
