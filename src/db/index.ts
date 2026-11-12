import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env } from "@/lib/env";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Which driver is behind `db()`. Surfaced on /preflight and in the demo banner. */
export type Driver = "pglite" | "neon" | "postgres";

/**
 * The handle lives on `globalThis`, not in a module-level variable.
 *
 * This is load-bearing, not defensive. Next compiles server components and route handlers
 * into separate module graphs, so `src/db/index.ts` is instantiated more than once inside
 * a single process — and a module-level cache then produces one PGlite instance per graph,
 * each with its own copy of an embedded database pointed at the same directory. The
 * symptom is ugly and confusing: a route handler inserts a row, the page that reads the
 * same table renders without it, and nothing ever converges.
 *
 * A `Symbol.for` key is shared across module instances, so every graph in the process
 * resolves to the same connection. `connecting` dedupes concurrent first calls, which
 * would otherwise boot two instances before either finished.
 */
const STORE = Symbol.for("hackathon-template.db.store");

type Store = { handle?: Db; driver?: Driver; connecting?: Promise<Db> };

function store(): Store {
  const holder = globalThis as typeof globalThis & { [STORE]?: Store };
  holder[STORE] ??= {};
  return holder[STORE];
}

/**
 * Where the embedded database keeps its files. Gitignored; delete the directory to start
 * from a clean schema. `PGLITE_DIR=memory://` keeps it in RAM, which is what the tests use.
 * Read at call time, not import time, so a test can set it before connecting.
 */
export function pgliteDir(): string {
  return env("PGLITE_DIR") ?? ".pglite";
}

/**
 * The app talks to Neon through its connection pooler: the pooled host is the direct host
 * with `-pooler` after the endpoint id. Migrations keep the direct URL because the pooler
 * does not support every session-level statement they use.
 */
export function pooledUrl(url: string): string {
  try {
    const u = new URL(url);
    const [endpoint, ...rest] = u.hostname.split(".");
    if (!u.hostname.endsWith(".neon.tech") || endpoint.endsWith("-pooler")) return url;
    u.hostname = [`${endpoint}-pooler`, ...rest].join(".");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * True on Vercel, where the embedded database cannot work.
 *
 * `NODE_ENV` is the wrong discriminator: `npm start` sets it to "production" locally, and
 * running the production build against PGlite is exactly how the demo is rehearsed. The
 * `VERCEL` variable is set by the platform itself and nowhere else.
 */
function onServerless(): boolean {
  return env("VERCEL") !== undefined;
}

/** What `db()` would connect to, without connecting. */
export function driverFor(url = env("DATABASE_URL")): Driver {
  if (!url) {
    /**
     * Fail loudly rather than quietly rot.
     *
     * PGlite on serverless does not crash — which is the problem. Each lambda gets its own
     * in-process Postgres, re-migrates on every cold start, and drops everything written
     * to it when the instance is recycled. The deployment looks healthy on the first
     * click and loses a judge's session on the second, with nothing in the logs to say
     * why. A deploy that stops is far cheaper than a demo that lies.
     */
    if (onServerless()) {
      throw new Error(
        "DATABASE_URL is not set. The embedded database (PGlite) is per-process and " +
          "cannot be used on serverless: data would be lost between requests. Create a " +
          "Neon project, set DATABASE_URL in the Vercel project's environment variables, " +
          "and run `npm run db:migrate` against it.",
      );
    }
    return "pglite";
  }
  try {
    return new URL(url).hostname.endsWith(".neon.tech") ? "neon" : "postgres";
  } catch {
    return "postgres";
  }
}

/**
 * PGlite: real Postgres compiled to WASM, with pgvector, running in-process against a
 * local directory. It is what makes `git clone && npm install && npm run dev` enough —
 * no database to provision, no connection string to paste, and the same SQL (including
 * `vector` columns and `tsvector` search) as the deployed Neon database.
 *
 * Loaded through `await import` so the WASM payload never enters a bundle that does not
 * use it, and so Neon deployments do not pay for it at all.
 */
async function connectPglite(): Promise<Db> {
  const [{ PGlite }, { vector }, { drizzle }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@electric-sql/pglite-pgvector"),
    import("drizzle-orm/pglite"),
  ]);
  const client = await PGlite.create({ dataDir: pgliteDir(), extensions: { vector } });
  await client.exec("create extension if not exists vector;");
  const handle = drizzle(client, { schema }) as unknown as Db;

  /**
   * Migrate on first connect, for the embedded driver only.
   *
   * This is what makes `git clone && npm install && npm run dev` genuinely enough — the
   * alternative is a fresh clone rendering a stack trace about a missing table, which is
   * a terrible first impression and one more step to remember at 12:30 on hackathon day.
   *
   * Only ever applied to the local embedded database: silently migrating a *remote*
   * database on connect would be an unpleasant surprise, so Neon and Postgres still
   * require an explicit `npm run db:migrate`.
   */
  const ready = await client.query<{ exists: boolean }>(
    `select exists (
       select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'agent_sessions'
     ) as exists`,
  );
  if (!ready.rows[0]?.exists) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the migrator is typed to its own driver
    await migrate(handle as any, { migrationsFolder: "src/db/migrations" });
  }

  return handle;
}

/**
 * The database handle. Async because the embedded driver has to boot WASM; every caller
 * is already in an async route handler or script.
 *
 * Resolution order: no DATABASE_URL → PGlite; a *.neon.tech URL → Neon's serverless
 * driver over the pooler; anything else → node-postgres. All three expose the same
 * Drizzle surface, so nothing above this file can tell them apart.
 */
export async function db(): Promise<Db> {
  const state = store();
  if (state.handle) return state.handle;
  // Two requests arriving together must not each boot a connection.
  if (state.connecting) return state.connecting;

  const url = env("DATABASE_URL");
  const driver = driverFor(url);

  state.connecting = (async () => {
    const handle =
      driver === "pglite"
        ? await connectPglite()
        : driver === "neon"
          ? (drizzleNeon(neon(pooledUrl(url!)), { schema }) as unknown as Db)
          : (drizzlePg(url!, { schema }) as unknown as Db);
    state.handle = handle;
    state.driver = driver;
    return handle;
  })();

  try {
    return await state.connecting;
  } finally {
    state.connecting = undefined;
  }
}

/** The driver actually in use, or null before the first `db()` call. */
export function currentDriver(): Driver | null {
  return store().driver ?? null;
}

/**
 * A handle built without awaiting, or null when the embedded driver is in play.
 *
 * Only Auth.js needs this: its Drizzle adapter is constructed synchronously, and PGlite
 * cannot be. So database-backed sessions require a real DATABASE_URL; with the embedded
 * database, auth falls back to JWT sessions (see src/auth.ts). Nothing else should use
 * this — use `db()`.
 */
export function dbSync(): Db | null {
  const url = env("DATABASE_URL");
  const driver = driverFor(url);
  if (driver === "pglite") return null;
  if (driver === "neon") return drizzleNeon(neon(pooledUrl(url!)), { schema }) as unknown as Db;
  return drizzlePg(url!, { schema }) as unknown as Db;
}

/**
 * Run raw SQL and get typed rows back.
 *
 * `Db` is the driver-agnostic `PgDatabase`, whose `execute` is typed as `unknown` because
 * each driver returns a different result envelope. Hand-written SQL is unavoidable for
 * pgvector distance operators and `tsvector` matching, so this is the one place that
 * knows all three drivers put their rows on `.rows`.
 */
export async function rows<T = Record<string, unknown>>(
  handle: Db,
  query: Parameters<Db["execute"]>[0],
): Promise<T[]> {
  const result = (await handle.execute(query)) as unknown;
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

/** Test seam: drop the memoised handle so the next `db()` reconnects. */
export function resetDb() {
  const state = store();
  state.handle = undefined;
  state.driver = undefined;
  state.connecting = undefined;
}

export * from "./schema";
