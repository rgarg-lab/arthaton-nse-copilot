import { and, asc, eq, isNotNull, lte, or, sql } from "drizzle-orm";
import { outbox, type Db } from "@/db";
import { resolveConnector } from "@/lib/integrations";

/**
 * Reminders and digests, delivered from the outbox.
 *
 * Due-ness is computed in SQL against a timestamp the caller supplies, not against
 * `now()` inside the query. That is what makes the time simulator possible: the outbox
 * page can ask "what would be delivered if it were 9am tomorrow?" and get a truthful
 * answer, which is how you demo a scheduler in a three-minute video without waiting.
 */

export type DeliveryResult = {
  delivered: number;
  failed: number;
  items: { id: string; kind: string; ok: boolean; detail?: string }[];
  /** The instant the run was evaluated against. */
  asOf: string;
  simulated: boolean;
};

/** What is due at `asOf` and not yet delivered. */
export async function dueItems(db: Db, asOf: Date, limit = 25) {
  return db
    .select()
    .from(outbox)
    .where(
      and(
        eq(outbox.status, "queued"),
        // Null deliverAfter means "as soon as approved"; a timestamp means "not before".
        or(lte(outbox.deliverAfter, asOf), sql`${outbox.deliverAfter} is null`),
      ),
    )
    .orderBy(asc(outbox.deliverAfter))
    .limit(limit);
}

/**
 * Deliver everything due. Safe to call repeatedly: a delivered row leaves the `queued`
 * state, so a cron that fires twice does not send twice.
 */
export async function runDeliveries(
  db: Db,
  opts: { asOf?: Date; simulated?: boolean; limit?: number } = {},
): Promise<DeliveryResult> {
  const asOf = opts.asOf ?? new Date();
  const items = await dueItems(db, asOf, opts.limit ?? 25);
  const result: DeliveryResult = {
    delivered: 0,
    failed: 0,
    items: [],
    asOf: asOf.toISOString(),
    simulated: Boolean(opts.simulated),
  };

  for (const item of items) {
    const { connector, fellBack } = resolveConnector(item.connector);
    const pushed = await connector.push({
      kind: item.kind,
      payload: {},
      preview: item.body,
    });
    await db
      .update(outbox)
      .set({
        status: pushed.ok ? "delivered" : "failed",
        deliveredAt: pushed.ok ? asOf : null,
        result: {
          ok: pushed.ok,
          ref: pushed.ref ?? null,
          detail: pushed.detail ?? null,
          fellBack,
          simulated: Boolean(opts.simulated),
        },
      })
      .where(eq(outbox.id, item.id));

    if (pushed.ok) result.delivered += 1;
    else result.failed += 1;
    result.items.push({ id: item.id, kind: item.kind, ok: pushed.ok, detail: pushed.detail });
  }

  return result;
}

/**
 * A periodic digest: one outbox entry summarising what happened.
 *
 * Computed in code — counts, dates, groupings — and only the wording would ever come from
 * a model. An idea overrides `summarise` to change what the digest says.
 */
export async function queueDigest(
  db: Db,
  opts: { sessionId?: string; since: Date; asOf?: Date; label?: string },
): Promise<{ queued: boolean; body: string }> {
  const asOf = opts.asOf ?? new Date();
  const delivered = await db
    .select({ kind: outbox.kind, count: sql<number>`count(*)::int` })
    .from(outbox)
    .where(and(eq(outbox.status, "delivered"), isNotNull(outbox.deliveredAt)))
    .groupBy(outbox.kind);

  const lines = delivered.map((r) => `- ${r.kind}: ${Number(r.count)}`);
  const body =
    `${opts.label ?? "Digest"} for the period ending ${asOf.toISOString().slice(0, 10)}\n\n` +
    (lines.length > 0 ? lines.join("\n") : "- nothing delivered in this period");

  await db.insert(outbox).values({
    sessionId: opts.sessionId ?? null,
    connector: "mock",
    kind: "digest",
    body,
    deliverAfter: asOf,
    status: "queued",
  });

  return { queued: true, body };
}
