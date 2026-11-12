import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Phase 5's check: an action goes queue → approve → outbox, and nothing reaches a
 * connector without that approval.
 *
 * The ordering guarantee is tested explicitly: the outbox row must exist even when the
 * connector fails, because losing a user's approval to a third-party outage is the one
 * failure mode this design exists to prevent.
 */

process.env.PGLITE_DIR = "memory://";
process.env.LLM_MODE = "mock";
process.env.LLM_CACHE = "off";
delete process.env.DATABASE_URL;

type DbModule = typeof import("@/db");

let dbMod: DbModule;
let handle: Awaited<ReturnType<DbModule["db"]>>;
let sessionId: string;

beforeAll(async () => {
  const { migrate } = await import("@/db/migrate");
  await migrate();
  dbMod = await import("@/db");
  handle = await dbMod.db();
}, 180_000);

beforeEach(async () => {
  const [session] = await handle
    .insert(dbMod.agentSessions)
    .values({ title: "approvals test" })
    .returning({ id: dbMod.agentSessions.id });
  sessionId = session.id;
});

async function queueAction(kind: string, payload: Record<string, unknown>, preview: string) {
  const [row] = await handle
    .insert(dbMod.pendingActions)
    .values({ sessionId, connector: "mock", kind, preview, payload, status: "pending" })
    .returning({ id: dbMod.pendingActions.id });
  return row.id;
}

describe("the agent cannot act directly", () => {
  it("send_message queues a pending action instead of sending", async () => {
    const { sendMessageTool } = await import("@/lib/tools/actions");
    const { config } = await import("@/lib/config");
    const result = (await sendMessageTool.run(
      { to: "someone@example.com", subject: "Hello", body: "This is the body." },
      {
        sessionId,
        userId: null,
        db: handle,
        config: config(),
        emit: async (e) => ({ ...e, seq: 0, at: new Date().toISOString() }),
        mock: true,
      },
    )) as { queued: boolean; actionId: string; status: string };

    expect(result.queued).toBe(true);
    expect(result.status).toBe("pending_approval");

    const [row] = await handle
      .select()
      .from(dbMod.pendingActions)
      .where(eq(dbMod.pendingActions.id, result.actionId));
    expect(row.status).toBe("pending");

    // Crucially: nothing in the outbox yet.
    const sent = await handle.select().from(dbMod.outbox).where(eq(dbMod.outbox.sessionId, sessionId));
    expect(sent).toHaveLength(0);
  });

  it("marks external tools as external so the rules layer can see them", async () => {
    const { ALL_TOOLS } = await import("@/lib/tools");
    const external = ALL_TOOLS.filter((t) => t.external).map((t) => t.name).sort();
    expect(external).toEqual(["create_task", "schedule_reminder", "send_message"]);
  });
});

describe("approve", () => {
  it("moves an action to the outbox and marks it delivered", async () => {
    const { approve, listPending } = await import("@/lib/approvals");
    const actionId = await queueAction("send_message", { to: "a@b.c", body: "hi" }, "To: a@b.c\n\nhi");

    const pendingBefore = await listPending(handle, sessionId);
    expect(pendingBefore.map((p) => p.id)).toContain(actionId);

    const result = await approve(handle, actionId);
    expect(result.ok).toBe(true);
    expect(result.outboxId).toBeDefined();

    const [action] = await handle
      .select()
      .from(dbMod.pendingActions)
      .where(eq(dbMod.pendingActions.id, actionId));
    expect(action.status).toBe("approved");
    expect(action.decidedAt).not.toBeNull();

    const [sent] = await handle.select().from(dbMod.outbox).where(eq(dbMod.outbox.id, result.outboxId!));
    expect(sent.status).toBe("delivered");
    expect(sent.deliveredAt).not.toBeNull();
    expect(sent.body).toContain("hi");

    const pendingAfter = await listPending(handle, sessionId);
    expect(pendingAfter.map((p) => p.id)).not.toContain(actionId);
  });

  it("delivers the edited text, not the original", async () => {
    const { approve } = await import("@/lib/approvals");
    const actionId = await queueAction("send_message", { to: "a@b.c", body: "original" }, "original preview");
    const result = await approve(handle, actionId, {
      preview: "edited preview",
      payload: { body: "edited body" },
    });
    const [sent] = await handle.select().from(dbMod.outbox).where(eq(dbMod.outbox.id, result.outboxId!));
    expect(sent.body).toBe("edited preview");

    const [action] = await handle
      .select()
      .from(dbMod.pendingActions)
      .where(eq(dbMod.pendingActions.id, actionId));
    expect((action.payload as { body: string }).body).toBe("edited body");
  });

  it("refuses to approve the same action twice", async () => {
    const { approve } = await import("@/lib/approvals");
    const actionId = await queueAction("create_task", { title: "once" }, "Task: once");
    expect((await approve(handle, actionId)).ok).toBe(true);
    const second = await approve(handle, actionId);
    expect(second.ok).toBe(false);
    expect(second.detail).toMatch(/already approved/);
  });

  it("records the approval even when the connector fails", async () => {
    // The ordering guarantee: outbox first, delivery second.
    const integrations = await import("@/lib/integrations");
    const original = integrations.mockConnector.push;
    integrations.mockConnector.push = async () => ({ ok: false, detail: "connector exploded" });
    try {
      const { approve } = await import("@/lib/approvals");
      const actionId = await queueAction("send_message", { to: "a@b.c", body: "x" }, "preview");
      const result = await approve(handle, actionId);
      expect(result.ok).toBe(false);
      // The approval survived the failure and is retryable.
      expect(result.outboxId).toBeDefined();
      const [sent] = await handle.select().from(dbMod.outbox).where(eq(dbMod.outbox.id, result.outboxId!));
      expect(sent.status).toBe("failed");
      expect(sent.body).toBe("preview");
    } finally {
      integrations.mockConnector.push = original;
    }
  });

  it("schedules a reminder rather than delivering it immediately", async () => {
    const { approve } = await import("@/lib/approvals");
    const deliverAt = new Date(Date.now() + 86_400_000).toISOString();
    const actionId = await queueAction("schedule_reminder", { body: "stand up", deliverAt }, "Reminder");
    const result = await approve(handle, actionId);
    expect(result.ok).toBe(true);
    const [sent] = await handle.select().from(dbMod.outbox).where(eq(dbMod.outbox.id, result.outboxId!));
    expect(sent.status).toBe("queued");
    expect(sent.deliveredAt).toBeNull();
    expect(sent.deliverAfter?.toISOString()).toBe(deliverAt);
  });
});

describe("reject", () => {
  it("marks an action rejected and writes nothing to the outbox", async () => {
    const { reject } = await import("@/lib/approvals");
    const actionId = await queueAction("send_message", { to: "a@b.c", body: "no" }, "preview");
    expect((await reject(handle, actionId)).ok).toBe(true);
    const [action] = await handle
      .select()
      .from(dbMod.pendingActions)
      .where(eq(dbMod.pendingActions.id, actionId));
    expect(action.status).toBe("rejected");
    const sent = await handle.select().from(dbMod.outbox).where(eq(dbMod.outbox.sessionId, sessionId));
    expect(sent).toHaveLength(0);
  });
});

describe("scheduler", () => {
  it("delivers a reminder only once its time has come", async () => {
    const { approve } = await import("@/lib/approvals");
    const { runDeliveries } = await import("@/lib/scheduler");
    const deliverAt = new Date(Date.now() + 86_400_000);
    const actionId = await queueAction(
      "schedule_reminder",
      { body: "tomorrow", deliverAt: deliverAt.toISOString() },
      "Reminder: tomorrow",
    );
    const { outboxId } = await approve(handle, actionId);

    // Now: not due.
    const notYet = await runDeliveries(handle, { asOf: new Date() });
    expect(notYet.items.map((i) => i.id)).not.toContain(outboxId);

    // Fast-forward past it: due. This is the time simulator the outbox page exposes.
    const later = await runDeliveries(handle, {
      asOf: new Date(deliverAt.getTime() + 60_000),
      simulated: true,
    });
    expect(later.items.map((i) => i.id)).toContain(outboxId);
    expect(later.delivered).toBeGreaterThan(0);

    const [sent] = await handle.select().from(dbMod.outbox).where(eq(dbMod.outbox.id, outboxId!));
    expect(sent.status).toBe("delivered");
  });

  it("is idempotent — a second run does not deliver twice", async () => {
    const { approve } = await import("@/lib/approvals");
    const { runDeliveries } = await import("@/lib/scheduler");
    const past = new Date(Date.now() - 86_400_000);
    const actionId = await queueAction(
      "schedule_reminder",
      { body: "overdue", deliverAt: past.toISOString() },
      "Reminder: overdue",
    );
    const { outboxId } = await approve(handle, actionId);

    const first = await runDeliveries(handle, { asOf: new Date() });
    expect(first.items.map((i) => i.id)).toContain(outboxId);
    const second = await runDeliveries(handle, { asOf: new Date() });
    expect(second.items.map((i) => i.id)).not.toContain(outboxId);
  });
});

describe("connector resolution", () => {
  it("falls back to the mock when the named connector is not configured", async () => {
    const { resolveConnector } = await import("@/lib/integrations");
    const { connector, fellBack } = resolveConnector("github-issues");
    expect(connector.id).toBe("mock");
    expect(fellBack).toBe(true);
  });

  it("reports only the mock as configured with no keys set", async () => {
    const { configuredConnectors } = await import("@/lib/integrations");
    expect(configuredConnectors().map((c) => c.id)).toEqual(["mock"]);
  });
});
