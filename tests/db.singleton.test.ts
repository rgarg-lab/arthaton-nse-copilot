import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

/**
 * Regression test for the worst bug in this build.
 *
 * Next compiles server components and route handlers into separate module graphs, so
 * `src/db/index.ts` is instantiated more than once inside one process. With the handle
 * memoised in a module-level variable, each graph got its own PGlite instance pointed at
 * the same directory — a route handler would insert a row and the page reading the same
 * table would render without it, forever, with no error anywhere.
 *
 * `vi.resetModules()` reproduces exactly that condition: it hands out a fresh module
 * instance while the process keeps running. The handle therefore has to live somewhere
 * both instances can see.
 */

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;

beforeAll(async () => {
  const { migrate } = await import("@/db/migrate");
  await migrate();
}, 120_000);

describe("database handle", () => {
  it("is shared across separate module instances in one process", async () => {
    const first = await import("@/db");
    const handleA = await first.db();

    // A second, independent instance of the same module — what Next does in production.
    vi.resetModules();
    const second = await import("@/db");
    const handleB = await second.db();

    expect(handleB, "a second module instance must not open its own database").toBe(handleA);
  }, 120_000);

  it("a write through one instance is visible through the other", async () => {
    const first = await import("@/db");
    const handleA = await first.db();
    const [session] = await handleA
      .insert(first.agentSessions)
      .values({ title: "singleton probe" })
      .returning({ id: first.agentSessions.id });

    vi.resetModules();
    const second = await import("@/db");
    const handleB = await second.db();
    const found = await second.rows<{ count: number }>(
      handleB,
      sql`select count(*)::int as count from agent_sessions where id = ${session.id}`,
    );
    expect(Number(found[0].count), "the row inserted via the first instance must be visible").toBe(1);
  }, 120_000);

  it("does not open two connections when called concurrently", async () => {
    const mod = await import("@/db");
    mod.resetDb();
    const [a, b, c] = await Promise.all([mod.db(), mod.db(), mod.db()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  }, 120_000);
});

/**
 * The embedded database must never be selected on serverless.
 *
 * PGlite on Vercel does not fail — it quietly gives every lambda its own Postgres that is
 * re-migrated on each cold start and discarded when the instance recycles. That is a demo
 * that loses a judge's session with nothing in the logs, so `driverFor` throws instead.
 */
describe("driverFor on serverless", () => {
  const saved = { vercel: process.env.VERCEL, url: process.env.DATABASE_URL };
  afterEach(() => {
    if (saved.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = saved.vercel;
    if (saved.url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved.url;
  });

  it("throws when VERCEL is set and DATABASE_URL is missing", async () => {
    process.env.VERCEL = "1";
    delete process.env.DATABASE_URL;
    const { driverFor } = await import("@/db");
    expect(() => driverFor()).toThrow(/DATABASE_URL is not set/);
  });

  it("still picks neon on serverless when the url is present", async () => {
    process.env.VERCEL = "1";
    process.env.DATABASE_URL = "postgresql://u:p@ep-cool-1.ap-southeast-1.aws.neon.tech/db";
    const { driverFor } = await import("@/db");
    expect(driverFor()).toBe("neon");
  });

  it("leaves local production builds alone", async () => {
    delete process.env.VERCEL;
    delete process.env.DATABASE_URL;
    const { driverFor } = await import("@/db");
    expect(driverFor()).toBe("pglite");
  });
});
