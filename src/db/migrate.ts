import { sql } from "drizzle-orm";
import { db, driverFor, pgliteDir } from "./index";

export const MIGRATIONS_FOLDER = "src/db/migrations";

/**
 * Apply every pending migration against whichever database is configured.
 *
 * `drizzle-kit migrate` only speaks to a real server, so it cannot set up the embedded
 * database — this runs the same generated SQL through the driver-specific migrator
 * instead. `npm run db:migrate` calls it; so do the tests, against a throwaway data
 * directory.
 *
 * pgvector is created first: the generated SQL declares `vector` columns, which fails if
 * the extension is not installed. Neon ships it; PGlite loads it as a WASM extension.
 */
export async function migrate(): Promise<{ driver: string; folder: string }> {
  const driver = driverFor();
  const handle = await db();
  await handle.execute(sql`create extension if not exists vector`);

  if (driver === "pglite") {
    const { migrate: run } = await import("drizzle-orm/pglite/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each migrator is typed to its own driver
    await run(handle as any, { migrationsFolder: MIGRATIONS_FOLDER });
  } else if (driver === "neon") {
    const { migrate: run } = await import("drizzle-orm/neon-http/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    await run(handle as any, { migrationsFolder: MIGRATIONS_FOLDER });
  } else {
    const { migrate: run } = await import("drizzle-orm/node-postgres/migrator");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    await run(handle as any, { migrationsFolder: MIGRATIONS_FOLDER });
  }

  return { driver, folder: driver === "pglite" ? pgliteDir() : "remote" };
}
