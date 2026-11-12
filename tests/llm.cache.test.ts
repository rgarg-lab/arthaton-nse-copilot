import { beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * The cache and the budget, against the embedded database. A warm cache is what makes a
 * rehearsed demo instant, and the budget is what stops a tool loop from eating a free
 * tier — both are load-bearing on demo day, so both are tested rather than assumed.
 */

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;

beforeAll(async () => {
  const { migrate } = await import("@/db/migrate");
  await migrate();
}, 120_000);

describe("cache key", () => {
  it("is stable for the same inputs and differs when any part changes", async () => {
    const { cacheKey } = await import("@/lib/llm/cache");
    const base = { family: "claude", cacheKey: "q1", system: "sys", schema: { type: "object" } };
    expect(cacheKey(base)).toBe(cacheKey({ ...base }));
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, cacheKey: "q2" }));
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, system: "other" }));
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, schema: { type: "string" } }));
  });

  it("groups models into families so a fallback within a vendor still hits", async () => {
    const { modelFamily } = await import("@/lib/llm/cache");
    expect(modelFamily("claude-opus-5")).toBe("claude");
    expect(modelFamily("claude-haiku-4-5-20251001")).toBe("claude");
    expect(modelFamily("gemini-2.5-flash")).toBe("gemini");
    expect(modelFamily("mock")).toBe("mock");
  });
});

describe("cache round trip", () => {
  beforeEach(() => {
    process.env.LLM_CACHE = "on";
  });

  it("writes then reads a response", async () => {
    const { readCache, writeCache } = await import("@/lib/llm/cache");
    const response = {
      text: "cached answer",
      toolCalls: [],
      stopReason: "end" as const,
      tokens: { input: 1, output: 2 },
    };
    await writeCache("key-roundtrip", "claude", response);
    const hit = await readCache("key-roundtrip");
    expect(hit?.text).toBe("cached answer");
  });

  it("returns nothing for an unknown key", async () => {
    const { readCache } = await import("@/lib/llm/cache");
    expect(await readCache("never-written")).toBeNull();
  });

  it("is bypassed entirely when LLM_CACHE=off", async () => {
    const { readCache, writeCache, cacheEnabled } = await import("@/lib/llm/cache");
    process.env.LLM_CACHE = "off";
    expect(cacheEnabled()).toBe(false);
    await writeCache("key-off", "claude", {
      text: "should not persist",
      toolCalls: [],
      stopReason: "end",
      tokens: { input: 0, output: 0 },
    });
    expect(await readCache("key-off")).toBeNull();
  });

  // No vi.resetModules() here: resetting would re-import the db module and boot a second,
  // empty in-memory database, losing the schema this file migrated in beforeAll.
  it("serves a second identical generate call from cache", async () => {
    process.env.LLM_CACHE = "on";
    process.env.LLM_MODE = "mock";
    const router = await import("@/lib/llm/router");
    const first = await router.generate({
      messages: [{ role: "user", content: "what is the plan" }],
      cacheKey: "plan-question",
    });
    const second = await router.generate({
      messages: [{ role: "user", content: "what is the plan" }],
      cacheKey: "plan-question",
    });
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.model).toBe("cache");
    expect(second.text).toBe(first.text);
    delete process.env.LLM_MODE;
  });
});

describe("session budget", () => {
  it("stops after maxCalls and reports which limit was hit", async () => {
    const budget = await import("@/lib/llm/budget");
    budget.resetBudget("s1");
    const caps = { maxCalls: 3, maxToolSteps: 10, maxTokens: 1_000_000 };
    budget.chargeCall("s1", caps);
    budget.chargeCall("s1", caps);
    budget.chargeCall("s1", caps);
    expect(() => budget.chargeCall("s1", caps)).toThrow(/maxCalls 3\/3/);
    expect(budget.usage("s1").calls).toBe(3);
  });

  it("stops a runaway tool loop", async () => {
    const budget = await import("@/lib/llm/budget");
    budget.resetBudget("s2");
    const caps = { maxCalls: 100, maxToolSteps: 2, maxTokens: 1_000_000 };
    budget.chargeToolStep("s2", caps);
    budget.chargeToolStep("s2", caps);
    expect(() => budget.chargeToolStep("s2", caps)).toThrow(/maxToolSteps/);
  });

  it("stops once the token ceiling is passed", async () => {
    const budget = await import("@/lib/llm/budget");
    budget.resetBudget("s3");
    const caps = { maxCalls: 100, maxToolSteps: 100, maxTokens: 50 };
    budget.recordTokens("s3", 60);
    expect(() => budget.chargeCall("s3", caps)).toThrow(/maxTokens/);
  });

  it("keeps sessions independent", async () => {
    const budget = await import("@/lib/llm/budget");
    budget.resetBudget();
    const caps = { maxCalls: 1, maxToolSteps: 1, maxTokens: 1000 };
    budget.chargeCall("a", caps);
    expect(() => budget.chargeCall("a", caps)).toThrow();
    expect(() => budget.chargeCall("b", caps)).not.toThrow();
  });
});
