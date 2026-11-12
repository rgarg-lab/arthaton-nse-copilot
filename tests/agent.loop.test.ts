import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

/**
 * The agent loop end to end, in mock mode, against the embedded database.
 *
 * The headline assertion is phase 4's check: a sample question from idea.config.ts must
 * produce at least two tool calls in the trace. That is the difference between "we called
 * an LLM" and "we built an agent", and it is the thing a judge looks for.
 */

process.env.PGLITE_DIR = "memory://";
process.env.LLM_MODE = "mock";
process.env.LLM_CACHE = "off";
delete process.env.DATABASE_URL;

type DbModule = typeof import("@/db");

let dbMod: DbModule;
let handle: Awaited<ReturnType<DbModule["db"]>>;
let runAgent: typeof import("@/lib/agent/loop").runAgent;
let config: typeof import("@/lib/config").config;

beforeAll(async () => {
  const { migrate } = await import("@/db/migrate");
  await migrate();
  dbMod = await import("@/db");
  handle = await dbMod.db();
  ({ runAgent } = await import("@/lib/agent/loop"));
  ({ config } = await import("@/lib/config"));

  // Seed memory so search_memory has something to find.
  const { applySeed, loadSeedFile } = await import("@/lib/seed");
  await applySeed(handle, await loadSeedFile("placeholder"));
}, 180_000);

beforeEach(async () => {
  const { resetBudget } = await import("@/lib/llm/budget");
  resetBudget();
});

describe("agent loop", () => {
  it("answers a sample question with at least two tool calls in the trace", async () => {
    const question = config().sampleQuestions[0];
    const result = await runAgent({ question, db: handle });

    const toolCalls = result.events.filter((e) => e.type === "tool_call");
    expect(toolCalls.length, `expected >=2 tool calls, trace was: ${result.events.map((e) => e.type).join(",")}`)
      .toBeGreaterThanOrEqual(2);

    // Each call must have a matching result, or the panel shows a call that never landed.
    const results = result.events.filter((e) => e.type === "tool_result");
    expect(results.length).toBe(toolCalls.length);

    expect(result.events.at(-1)?.type).toBe("final");
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.usedFallback).toBe(false);
  }, 120_000);

  it("emits trace events in sequence with no gaps", async () => {
    const result = await runAgent({ question: "What can you do?", db: handle });
    const seqs = result.events.map((e) => e.seq);
    expect(seqs).toEqual([...Array(seqs.length).keys()]);
  }, 120_000);

  it("persists the trace so it survives a reload", async () => {
    const result = await runAgent({ question: "Remember that I prefer short answers.", db: handle });
    const persisted = await dbMod.rows<{ count: number }>(
      handle,
      sql`select count(*)::int as count from trace_events where session_id = ${result.sessionId}`,
    );
    expect(Number(persisted[0].count)).toBe(result.events.length);
  }, 120_000);

  it("persists the conversation", async () => {
    const result = await runAgent({ question: "What can you do?", db: handle });
    const rows = await dbMod.rows<{ role: string }>(
      handle,
      sql`select role from messages where session_id = ${result.sessionId} order by created_at`,
    );
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant"]);
  }, 120_000);

  it("runs with no database at all, just without persistence", async () => {
    const result = await runAgent({ question: "What can you do?", db: null });
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.events.filter((e) => e.type === "tool_call").length).toBeGreaterThanOrEqual(1);
  }, 120_000);

  it("stops at maxSteps instead of looping forever", async () => {
    const tight = { ...config(), agent: { ...config().agent, maxSteps: 1 } };
    const result = await runAgent({ question: "What can you do?", db: handle, config: tight });
    expect(result.steps).toBeLessThanOrEqual(1);
    expect(result.usedFallback).toBe(true);
    expect(result.events.some((e) => e.type === "fallback")).toBe(true);
  }, 120_000);

  it("rejects an idea config naming a tool that does not exist", async () => {
    const broken = {
      ...config(),
      agent: { ...config().agent, enabledTools: ["search_memory", "teleport"] },
    };
    await expect(runAgent({ question: "hi", db: handle, config: broken })).rejects.toThrow(
      /unknown tool\(s\): teleport/,
    );
  });

  it("only exposes the tools the idea enabled", async () => {
    const narrow = {
      ...config(),
      agent: { ...config().agent, enabledTools: ["calculate"], maxSteps: 4 },
    };
    const result = await runAgent({ question: "What is 2 + 2?", db: handle, config: narrow });
    const names = result.events.filter((e) => e.type === "tool_call").map((e) => e.label);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toBe("calculate");
  }, 120_000);
});

describe("tool failures", () => {
  it("reports a failing tool to the model and keeps going", async () => {
    const { ALL_TOOLS } = await import("@/lib/tools");
    const target = ALL_TOOLS.find((t) => t.name === "calculate")!;
    const original = target.run;
    target.run = async () => {
      throw new Error("deliberate tool failure");
    };
    try {
      const narrow = {
        ...config(),
        agent: { ...config().agent, enabledTools: ["calculate", "search_memory"], maxSteps: 5 },
      };
      const result = await runAgent({ question: "What is 10% of 200?", db: handle, config: narrow });
      // The run still produces an answer; the failure is visible in the trace.
      expect(result.answer.length).toBeGreaterThan(0);
      const failed = result.events.find((e) => e.label === "calculate failed");
      expect(failed).toBeDefined();
      expect(result.toolResults.some((r) => !r.ok && /deliberate tool failure/.test(r.error ?? ""))).toBe(true);
    } finally {
      target.run = original;
    }
  }, 120_000);
});
