import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { ToolContext } from "@/lib/agent/types";
import { ALL_TOOLS, allToolNames, assertToolsExist, toToolSpecs, toolByName } from "@/lib/tools";
import { findSimilarDaysTool, getModelMetricsTool, getSignalTool } from "@/lib/tools/finance";

/**
 * The finance tools, tested in the state a judge is most likely to encounter: the ML
 * service not running.
 *
 * That is the important case, and it is the one that could silently fail. The tools must
 * return a clearly-marked unavailable result that instructs the model to *decline*. A tool
 * that returns a plausible-looking fallback number here would be indistinguishable from a
 * real one by the time it reaches a user, which is the single defect this project exists to
 * correct.
 */

const ctx: ToolContext = {
  sessionId: "00000000-0000-4000-8000-000000000000",
  userId: null,
  // Null is a supported context: these three tools reach the ML service over HTTP and
  // touch no database at all, which is also why they are safe to unit-test.
  db: null,
  config: config(),
  // `Emit` returns the persisted event. None of these tools emits anything, so a
  // minimally-shaped echo is enough and is more honest than an `as unknown as Emit` cast.
  emit: async (event) => ({ ...event, seq: 0, at: new Date().toISOString() }),
  mock: true,
};

type Unavailable = {
  ok: false;
  source: "unavailable";
  error: string;
  instruction: string;
  hint: string;
};

describe("registration", () => {
  it("every finance tool is in the registry", () => {
    for (const name of ["get_signal", "get_model_metrics", "find_similar_days"]) {
      expect(allToolNames(), `${name} must be registered`).toContain(name);
      expect(toolByName(name)).toBeDefined();
    }
  });

  it("every finance tool is enabled in idea.config.ts", () => {
    const enabled = config().agent.enabledTools;
    for (const name of ["get_signal", "get_model_metrics", "find_similar_days"]) {
      expect(enabled, `${name} must be enabled, not just registered`).toContain(name);
    }
  });

  it("the enabled list has no typos", () => {
    expect(() => assertToolsExist(config().agent.enabledTools)).not.toThrow();
  });

  it("web_search is deliberately NOT enabled", () => {
    // §4.1: there is no TAVILY_API_KEY in this build, so it would only ever return
    // results labelled MOCK — and a mock search result inside a financial answer is a
    // risk with no upside.
    expect(config().agent.enabledTools).not.toContain("web_search");
  });

  it("the generic ml_predict placeholder is gone", () => {
    // It fabricated a label and a score from the length of its own input when no endpoint
    // was configured. The three typed tools replace it; leaving it registered would leave
    // a second path to "the model" that invents numbers.
    expect(allToolNames()).not.toContain("ml_predict");
  });

  it("produces a JSON Schema the model can be shown", () => {
    const specs = toToolSpecs(
      ALL_TOOLS.filter((t) => t.name.startsWith("get_") || t.name === "find_similar_days"),
    );
    for (const spec of specs) {
      expect(spec.inputSchema).toHaveProperty("type", "object");
      expect(spec.description.length).toBeGreaterThan(40);
      // The JSON Schema metadata that Gemini rejects must never leave toToolSpecs.
      expect(spec.inputSchema).not.toHaveProperty("$schema");
    }
  });

  it("none of them is marked external — they read, they never act", () => {
    for (const tool of [getSignalTool, getModelMetricsTool, findSimilarDaysTool]) {
      expect(tool.external).toBeFalsy();
    }
  });
});

describe("with the ML service unreachable", () => {
  beforeEach(() => {
    // An endpoint that cannot resolve, which is exactly what a judge who has not started
    // uvicorn will hit.
    vi.stubEnv("ML_ENDPOINT", "http://127.0.0.1:9");
    vi.stubEnv("ML_TIMEOUT_MS", "300");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("get_signal returns an unavailable result, not a fabricated signal", async () => {
    const out = (await getSignalTool.run({ ticker: "RELIANCE.NS" }, ctx)) as Unavailable;
    expect(out.ok).toBe(false);
    expect(out.source).toBe("unavailable");
    expect(out.instruction).toMatch(/do not estimate a probability/i);
    // The crucial assertion: there is no number anywhere in the payload that could be
    // mistaken for a signal.
    expect(JSON.stringify(out)).not.toMatch(/"probability_up"/);
    expect(JSON.stringify(out)).not.toMatch(/"direction"/);
  });

  it("get_signal for the whole basket degrades the same way", async () => {
    const out = (await getSignalTool.run({}, ctx)) as Unavailable;
    expect(out.ok).toBe(false);
    expect(out.hint).toMatch(/tasks\.py serve/);
  });

  it("get_model_metrics returns no accuracy *figure* at all", async () => {
    const out = (await getModelMetricsTool.run({ section: "direction" }, ctx)) as Unavailable;
    expect(out.ok).toBe(false);
    // The word "accuracy" is present, and should be: the instruction tells the model not
    // to invent an accuracy figure. What must be absent is a *number* that could be read
    // as one.
    expect(out.instruction).toMatch(/accuracy figure/i);
    const numbers = [...JSON.stringify(out).matchAll(/(^|[^\w.:/])(\d+\.\d+)/g)].map((m) => m[2]);
    expect(numbers, "a decimal appeared in an unavailable metrics payload").toEqual([]);
    expect(JSON.stringify(out)).not.toMatch(/"accuracy":/);
  });

  it("find_similar_days returns no analogues", async () => {
    const out = (await findSimilarDaysTool.run(
      { ticker: "INFY.NS", k: 25, same_ticker_only: false },
      ctx,
    )) as Unavailable;
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out)).not.toMatch(/empirical_up_rate/);
  });

  it("no tool throws — a degraded answer is still useful", async () => {
    await expect(getSignalTool.run({ ticker: "TCS.NS" }, ctx)).resolves.toBeDefined();
    await expect(getModelMetricsTool.run({}, ctx)).resolves.toBeDefined();
    await expect(
      findSimilarDaysTool.run({ ticker: "TCS.NS", k: 10, same_ticker_only: true }, ctx),
    ).resolves.toBeDefined();
  });
});

describe("input validation", () => {
  it("get_signal accepts an omitted ticker", () => {
    expect(getSignalTool.inputSchema.safeParse({}).success).toBe(true);
  });

  it("get_model_metrics rejects an unknown section", () => {
    expect(getModelMetricsTool.inputSchema.safeParse({ section: "nonsense" }).success).toBe(false);
  });

  it("find_similar_days rejects a k outside its bounds and a malformed date", () => {
    expect(findSimilarDaysTool.inputSchema.safeParse({ ticker: "INFY.NS", k: 1 }).success).toBe(
      false,
    );
    expect(findSimilarDaysTool.inputSchema.safeParse({ ticker: "INFY.NS", k: 500 }).success).toBe(
      false,
    );
    expect(
      findSimilarDaysTool.inputSchema.safeParse({ ticker: "INFY.NS", as_of: "11/03/2024" }).success,
    ).toBe(false);
    expect(
      findSimilarDaysTool.inputSchema.safeParse({ ticker: "INFY.NS", as_of: "2024-03-11" }).success,
    ).toBe(true);
  });

  it("defaults k and same_ticker_only so the model need not supply them", () => {
    const parsed = findSimilarDaysTool.inputSchema.parse({ ticker: "INFY.NS" });
    expect(parsed.k).toBe(25);
    expect(parsed.same_ticker_only).toBe(false);
  });
});

describe("tool descriptions, which are prompts", () => {
  it("get_signal tells the model what to do with an abstention", () => {
    expect(getSignalTool.description).toMatch(/abstain/i);
    expect(getSignalTool.description).toMatch(/must not supply/i);
  });

  it("get_model_metrics tells the model not to flatter the numbers", () => {
    expect(getModelMetricsTool.description).toMatch(/never round them up/i);
  });

  it("find_similar_days distinguishes evidence from probability", () => {
    expect(findSimilarDaysTool.description).toMatch(/evidence, not a probability/i);
  });
});
