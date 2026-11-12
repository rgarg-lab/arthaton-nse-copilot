import { z } from "zod";
import { sql } from "drizzle-orm";
import { memoryItems, rows } from "@/db";
import { embed } from "@/lib/llm/embed";
import { isUuid } from "@/schemas";
import type { Tool, ToolContext } from "@/lib/agent/types";

/**
 * Durable memory: store things worth remembering, and find them again.
 *
 * `search_memory` unions keyword hits with vector hits rather than using keyword as a
 * hard prefilter. That is not belt-and-braces — tests/db.schema.test.ts pins the reason:
 * Postgres's `english` parser emits "Asia/Kolkata" as a single token, so a search for
 * "Kolkata" finds nothing by keyword while the embedding matches it fine. Either channel
 * alone has blind spots the other covers.
 */

const SearchInput = z.object({
  query: z.string().min(1).max(1_000).describe("What to look for, in natural language."),
  limit: z.number().int().min(1).max(20).default(5),
  types: z
    .array(z.enum(["fact", "preference", "correction", "note"]))
    .optional()
    .describe("Restrict to certain kinds of memory. Omit to search everything."),
});

const SaveInput = z.object({
  type: z
    .enum(["fact", "preference", "correction", "note"])
    .describe(
      "`fact` for something true about the world, `preference` for how the user wants things, " +
        "`correction` for when they corrected you, `note` for anything else.",
    ),
  content: z.string().min(1).max(5_000).describe("One self-contained sentence. It must make sense alone."),
  source: z.string().max(200).nullable().default(null).describe("Where it came from, e.g. 'user said'."),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type MemoryHit = {
  id: string;
  type: string;
  content: string;
  source: string | null;
  distance: number | null;
  matchedBy: "keyword" | "vector" | "both";
};

/** Scope: a signed-in user's own rows plus the current session's, never anyone else's. */
function scopeClause(ctx: ToolContext) {
  const userId = ctx.userId && isUuid(ctx.userId) ? ctx.userId : null;
  return userId
    ? sql`(user_id = ${userId} or session_id = ${ctx.sessionId})`
    : sql`session_id = ${ctx.sessionId}`;
}

export async function searchMemory(
  ctx: ToolContext,
  input: z.infer<typeof SearchInput>,
): Promise<{ hits: MemoryHit[]; channels: { keyword: number; vector: number } }> {
  if (!ctx.db) return { hits: [], channels: { keyword: 0, vector: 0 } };

  const vector = JSON.stringify(await embed(input.query));
  const typeFilter =
    input.types && input.types.length > 0 ? sql`and type = any(${sql.raw(`array['${input.types.join("','")}']`)})` : sql``;

  // One query, two channels, union'd and ranked. `matchedBy` is surfaced so the trace
  // shows which channel found a given item — useful when tuning an idea's memory.
  const found = await rows<{
    id: string;
    type: string;
    content: string;
    source: string | null;
    distance: number | null;
    keyword_hit: boolean;
    vector_hit: boolean;
  }>(
    ctx.db,
    sql`
      with keyword as (
        select id, true as keyword_hit
        from memory_items
        where ${scopeClause(ctx)} ${typeFilter}
          and searchable @@ plainto_tsquery('english', ${input.query})
        limit ${input.limit}
      ),
      vector as (
        select id, true as vector_hit, embedding <=> ${vector}::vector as distance
        from memory_items
        where ${scopeClause(ctx)} ${typeFilter}
          and embedding is not null
        order by distance asc
        limit ${input.limit}
      )
      select m.id, m.type, m.content, m.source,
             v.distance,
             coalesce(k.keyword_hit, false) as keyword_hit,
             coalesce(v.vector_hit, false) as vector_hit
      from memory_items m
      left join keyword k on k.id = m.id
      left join vector v on v.id = m.id
      where k.keyword_hit is true or v.vector_hit is true
      order by (case when k.keyword_hit then 0 else 1 end), v.distance asc nulls last
      limit ${input.limit}
    `,
  );

  const hits: MemoryHit[] = found.map((r) => ({
    id: r.id,
    type: r.type,
    content: r.content,
    source: r.source,
    distance: r.distance === null ? null : Number(r.distance),
    matchedBy: r.keyword_hit && r.vector_hit ? "both" : r.keyword_hit ? "keyword" : "vector",
  }));

  return {
    hits,
    channels: {
      keyword: hits.filter((h) => h.matchedBy !== "vector").length,
      vector: hits.filter((h) => h.matchedBy !== "keyword").length,
    },
  };
}

export const searchMemoryTool: Tool<typeof SearchInput> = {
  name: "search_memory",
  description:
    "Look for things you were told earlier — facts, preferences, corrections. Call this before " +
    "answering anything that depends on what the user has said before, and before asking them " +
    "something they may already have told you.",
  inputSchema: SearchInput,
  run: (input, ctx) => searchMemory(ctx, input),
};

export const saveMemoryTool: Tool<typeof SaveInput> = {
  name: "save_memory",
  description:
    "Remember one thing for later. Store the fact itself, not the conversation around it: " +
    '"prefers metric units", not "the user said they like metric". One item per call.',
  inputSchema: SaveInput,

  async run(input, ctx) {
    if (!ctx.db) return { saved: false, reason: "no database in this context" };
    const userId = ctx.userId && isUuid(ctx.userId) ? ctx.userId : null;
    const [row] = await ctx.db
      .insert(memoryItems)
      .values({
        sessionId: ctx.sessionId,
        userId,
        type: input.type,
        content: input.content,
        source: input.source,
        metadata: input.metadata,
        embedding: await embed(input.content),
      })
      .returning({ id: memoryItems.id });
    return { saved: true, id: row.id, type: input.type, content: input.content };
  },
};

const CompareInput = z.object({
  claim: z.string().min(1).max(2_000).describe("The new statement to check against memory."),
  limit: z.number().int().min(1).max(10).default(5),
});

/**
 * Find stored items that the new claim contradicts.
 *
 * The comparison itself is delegated to `verify` rather than done here, so there is one
 * definition of "does A support B" in the codebase. A contradiction is the signal an idea
 * usually wants to act on: it is how "learn when corrected" starts.
 */
export const compareWithMemoryTool: Tool<typeof CompareInput> = {
  name: "compare_with_memory",
  description:
    "Check a new statement against what you already remember and report conflicts. Use it when " +
    "the user tells you something that might contradict an earlier preference or fact.",
  inputSchema: CompareInput,

  async run(input, ctx) {
    const { hits } = await searchMemory(ctx, { query: input.claim, limit: input.limit });
    if (hits.length === 0) return { conflicts: [], checked: 0, note: "nothing comparable in memory" };

    const { verifyTool } = await import("./verify");
    const conflicts: { id: string; stored: string; verdict: string; confidence: number; reason: string }[] = [];

    for (const hit of hits) {
      const verdict = (await verifyTool.run(
        { claim: input.claim, source: hit.content, strictness: "semantic" },
        ctx,
      )) as { verdict: string; confidence: number; reason: string };
      if (verdict.verdict === "contradicted" || verdict.verdict === "unsupported") {
        conflicts.push({
          id: hit.id,
          stored: hit.content,
          verdict: verdict.verdict,
          confidence: verdict.confidence,
          reason: verdict.reason,
        });
      }
    }

    return { conflicts, checked: hits.length };
  },
};
