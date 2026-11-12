import { and, desc, eq } from "drizzle-orm";
import { outbox, pendingActions, type Db } from "@/db";
import { resolveConnector } from "@/lib/integrations";

/**
 * The approval queue: the only path from an agent's intention to the outside world.
 *
 * The ordering in `approve` is deliberate and worth stating. The outbox row is written
 * *before* the connector is called, then updated with the outcome. If the connector times
 * out, 500s, or the function is killed mid-flight, the record of what the user approved
 * still exists and can be retried — the work is never lost because a third party had a
 * bad moment. The alternative (call first, record after) loses the approval exactly when
 * things are going wrong.
 */

export type PendingAction = {
  id: string;
  sessionId: string;
  connector: string;
  kind: string;
  preview: string;
  payload: Record<string, unknown>;
  status: string;
  createdAt: Date;
};

export async function listPending(db: Db, sessionId?: string): Promise<PendingAction[]> {
  const rows = await db
    .select()
    .from(pendingActions)
    .where(
      sessionId
        ? and(eq(pendingActions.status, "pending"), eq(pendingActions.sessionId, sessionId))
        : eq(pendingActions.status, "pending"),
    )
    .orderBy(desc(pendingActions.createdAt))
    .limit(50);
  return rows as PendingAction[];
}

export type ApprovalResult = {
  ok: boolean;
  actionId: string;
  outboxId?: string;
  connector: string;
  /** True when the named connector was not configured and the mock took over. */
  fellBack: boolean;
  detail?: string;
  ref?: string;
};

/**
 * Approve one action, optionally with edits.
 *
 * `edits` exists because the tray lets the user change the text before approving — which
 * is the point of a preview. The edited payload is what gets delivered and what gets
 * stored, so the record matches what actually went out.
 */
export async function approve(
  db: Db,
  actionId: string,
  edits?: { preview?: string; payload?: Record<string, unknown> },
): Promise<ApprovalResult> {
  const [action] = await db.select().from(pendingActions).where(eq(pendingActions.id, actionId)).limit(1);
  if (!action) return { ok: false, actionId, connector: "none", fellBack: false, detail: "no such action" };
  if (action.status !== "pending") {
    return {
      ok: false,
      actionId,
      connector: action.connector,
      fellBack: false,
      detail: `already ${action.status}`,
    };
  }

  const preview = edits?.preview ?? action.preview;
  const payload = { ...(action.payload as Record<string, unknown>), ...(edits?.payload ?? {}) };
  const { connector, fellBack } = resolveConnector(action.connector);

  // 1. Record the approval first, so it survives a connector failure.
  const [queued] = await db
    .insert(outbox)
    .values({
      sessionId: action.sessionId,
      actionId: action.id,
      connector: connector.id,
      kind: action.kind,
      body: preview,
      // A reminder is scheduled, not sent now; the cron route delivers it later.
      deliverAfter:
        action.kind === "schedule_reminder" && typeof payload.deliverAt === "string"
          ? new Date(payload.deliverAt)
          : null,
      status: "queued",
    })
    .returning({ id: outbox.id });

  await db
    .update(pendingActions)
    .set({ status: "approved", decidedAt: new Date(), payload })
    .where(eq(pendingActions.id, actionId));

  // A scheduled reminder is not delivered now — it waits for its time.
  if (action.kind === "schedule_reminder" && payload.deliverAt) {
    return {
      ok: true,
      actionId,
      outboxId: queued.id,
      connector: connector.id,
      fellBack,
      detail: `Scheduled for ${String(payload.deliverAt)}.`,
    };
  }

  // 2. Now attempt delivery.
  const result = await connector.push({ kind: action.kind, payload, preview });

  await db
    .update(outbox)
    .set({
      status: result.ok ? "delivered" : "failed",
      deliveredAt: result.ok ? new Date() : null,
      result: { ok: result.ok, ref: result.ref ?? null, detail: result.detail ?? null, fellBack },
    })
    .where(eq(outbox.id, queued.id));

  if (!result.ok) {
    await db
      .update(pendingActions)
      .set({ status: "failed" })
      .where(eq(pendingActions.id, actionId));
  }

  return {
    ok: result.ok,
    actionId,
    outboxId: queued.id,
    connector: connector.id,
    fellBack,
    detail: result.detail,
    ref: result.ref,
  };
}

export async function reject(db: Db, actionId: string): Promise<{ ok: boolean; detail?: string }> {
  const [action] = await db.select().from(pendingActions).where(eq(pendingActions.id, actionId)).limit(1);
  if (!action) return { ok: false, detail: "no such action" };
  if (action.status !== "pending") return { ok: false, detail: `already ${action.status}` };
  await db
    .update(pendingActions)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(eq(pendingActions.id, actionId));
  return { ok: true };
}
