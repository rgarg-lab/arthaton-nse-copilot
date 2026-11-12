import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

/**
 * The database layer against the embedded driver, which is what CI and a fresh clone get.
 * Proves the three things the rest of the template assumes: the generated migrations
 * apply, a `vector` column answers a nearest-neighbour query, and the generated
 * `tsvector` answers a keyword query. No DATABASE_URL, no keys.
 */

// Set before importing the db module so it connects in-memory rather than to ./.pglite.
process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;

type DbModule = typeof import("@/db");
type SeedModule = typeof import("@/lib/seed");

let dbMod: DbModule;
let seedMod: SeedModule;
let handle: Awaited<ReturnType<DbModule["db"]>>;
let rows: DbModule["rows"];

beforeAll(async () => {
  dbMod = await import("@/db");
  seedMod = await import("@/lib/seed");
  const { migrate } = await import("@/db/migrate");
  await migrate();
  handle = await dbMod.db();
  rows = dbMod.rows;
}, 120_000);

describe("embedded database", () => {
  it("chooses the embedded driver when DATABASE_URL is unset", () => {
    expect(dbMod.driverFor(undefined)).toBe("pglite");
    expect(dbMod.currentDriver()).toBe("pglite");
  });

  it("still routes a neon URL through the pooler", () => {
    expect(dbMod.driverFor("postgresql://u:p@ep-x-1.ap-southeast-1.aws.neon.tech/db")).toBe("neon");
    expect(dbMod.driverFor("postgresql://u:p@localhost:5432/app")).toBe("postgres");
    expect(dbMod.pooledUrl("postgresql://u:p@ep-x-1.ap-southeast-1.aws.neon.tech/db")).toContain(
      "ep-x-1-pooler",
    );
  });

  it("has pgvector installed", async () => {
    const found = await rows<{ extname: string }>(
      handle,
      sql`select extname from pg_extension where extname = 'vector'`,
    );
    expect(found.length).toBe(1);
  });

  it("created every application table", async () => {
    const tables = await rows<{ table_name: string }>(
      handle,
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = new Set(tables.map((r) => r.table_name));
    for (const t of [
      "agent_sessions",
      "messages",
      "memory_items",
      "documents",
      "chunks",
      "pending_actions",
      "outbox",
      "trace_events",
      "llm_cache",
      "eval_runs",
      "users",
      "accounts",
      "sessions",
      "verification_tokens",
    ]) {
      expect(names, `missing table ${t}`).toContain(t);
    }
  });

  it("loads the placeholder seed", async () => {
    const seed = await seedMod.loadSeedFile("placeholder");
    const result = await seedMod.applySeed(handle, seed);
    expect(result.memory).toBe(3);
    expect(result.chunks).toBe(3);
    expect(result.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("answers a vector nearest-neighbour query over seeded memory", async () => {
    const { mockEmbed } = await import("@/lib/llm/embed");
    const probe = JSON.stringify(mockEmbed("short answers with the number first"));
    const hits = await rows<{ content: string; distance: number }>(
      handle,
      sql`select content, embedding <=> ${probe}::vector as distance
          from memory_items order by distance asc limit 1`,
    );
    expect(hits[0].content).toMatch(/short answers/i);
    expect(Number(hits[0].distance)).toBeLessThan(0.5);
  });

  it("answers a keyword query over the generated tsvector", async () => {
    const hits = await rows<{ content: string }>(
      handle,
      sql`select content from memory_items where searchable @@ plainto_tsquery('english', 'Monday')`,
    );
    expect(hits.length).toBe(1);
    expect(hits[0].content).toMatch(/Monday/);
  });

  /**
   * Keyword search alone is not enough, and this is why: Postgres's `english` parser
   * classifies "Asia/Kolkata" as one `file` token, so searching for "Kolkata" misses the
   * row entirely while searching the whole token finds it. `search_memory` therefore
   * unions keyword hits with vector hits rather than using keyword as a hard prefilter —
   * the mock embedder tokenises on word characters and does match the bare word.
   */
  it("misses a word inside a slash-joined token, which vector search still finds", async () => {
    const keyword = await rows(
      handle,
      sql`select content from memory_items where searchable @@ plainto_tsquery('english', 'Kolkata')`,
    );
    expect(keyword.length).toBe(0);

    const wholeToken = await rows(
      handle,
      sql`select content from memory_items where searchable @@ plainto_tsquery('english', 'Asia/Kolkata')`,
    );
    expect(wholeToken.length).toBe(1);

    const { mockEmbed } = await import("@/lib/llm/embed");
    const probe = JSON.stringify(mockEmbed("Kolkata"));
    const vectorHit = await rows<{ content: string }>(
      handle,
      sql`select content, embedding <=> ${probe}::vector as distance
          from memory_items order by distance asc limit 1`,
    );
    expect(vectorHit[0].content).toMatch(/Kolkata/);
  });

  it("indexed chunk text for retrieval too", async () => {
    const hits = await rows(
      handle,
      sql`select content from chunks where searchable @@ plainto_tsquery('english', 'approve')`,
    );
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe("mock embeddings", () => {
  it("are deterministic and unit length", async () => {
    const { mockEmbed } = await import("@/lib/llm/embed");
    const a = mockEmbed("the same text");
    const b = mockEmbed("the same text");
    expect(a).toEqual(b);
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it("put texts sharing words closer than texts sharing none", async () => {
    const { mockEmbed } = await import("@/lib/llm/embed");
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i], 0);
    const base = mockEmbed("quarterly revenue forecast");
    const near = mockEmbed("revenue forecast for the quarter");
    const far = mockEmbed("bicycle maintenance schedule");
    expect(dot(base, near)).toBeGreaterThan(dot(base, far));
  });
});
