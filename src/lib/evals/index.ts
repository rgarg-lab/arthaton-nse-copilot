import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { evalRuns, type Db } from "@/db";
import { runAgent } from "@/lib/agent/loop";
import { config } from "@/lib/config";
import { generate, llmMode } from "@/lib/llm/router";

/**
 * A small eval suite, so the README can carry a measured number instead of an adjective.
 *
 * "Measured accuracy: 9/10" is worth more than any amount of describing how careful the
 * agent is, and it takes ten hand-written cases to earn. The scorers are deliberately
 * ordered cheapest-first: `contains` and `exact` are free and deterministic, and the
 * LLM judge is only reached when a case genuinely needs semantic judgement.
 */

export const CaseSchema = z.object({
  id: z.string().min(1),
  input: z.string().min(1),
  /** What a correct answer must contain, equal, or satisfy. */
  expected: z.string().min(1),
  scorer: z.enum(["contains", "exact", "regex", "judge", "tool"]).default("contains"),
  /** Case-insensitive by default; set false where casing matters. */
  ignoreCase: z.boolean().default(true),
  /**
   * Which modes this case means anything in. Defaults to both.
   *
   * `declares-mock-mode` is why this exists. It asserts the answer says "mock",
   * and its own note scopes it: "with no keys the answer must say it is not a
   * real model call". Run live, it failed a model for truthfully answering "I am
   * a real model" — the harness was demanding a lie. A case that is only
   * meaningful in one mode now says so instead of being scored in the other.
   */
  modes: z.array(z.enum(["mock", "live"])).default(["mock", "live"]),
  notes: z.string().optional(),
});

export type EvalCase = z.infer<typeof CaseSchema>;

export const SuiteSchema = z.object({
  suite: z.string().min(1),
  cases: z.array(CaseSchema).min(1),
});

export type CaseResult = {
  id: string;
  passed: boolean;
  /**
   * Why this case was left out of the score, if it was.
   *   "mock-fallback"  — a live run that silently answered from the mock floor
   *   "not-applicable" — the case does not apply to the mode being run
   */
  excluded: null | "mock-fallback" | "not-applicable";
  /** Which model actually answered — "mock-fallback" when every model failed. */
  answeredBy: string;
  scorer: EvalCase["scorer"];
  expected: string;
  got: string;
  detail?: string;
  toolCalls: number;
  ms: number;
};

export type SuiteResult = {
  suite: string;
  mode: string;
  total: number;
  passed: number;
  /** Cases left out of the score — see CaseResult.excluded. */
  excluded: number;
  /** passed / (total - excluded). */
  accuracy: number;
  results: CaseResult[];
};

export const CASES_DIR = path.join("evals", "cases");

export async function loadSuites(dir = CASES_DIR): Promise<z.infer<typeof SuiteSchema>[]> {
  const entries = await readdir(dir).catch(() => []);
  const suites = [];
  for (const entry of entries.filter((e) => e.endsWith(".json"))) {
    const raw = await readFile(path.join(dir, entry), "utf8");
    suites.push(SuiteSchema.parse(JSON.parse(raw)));
  }
  return suites;
}

const JudgeVerdict = z.object({
  correct: z.boolean(),
  reason: z.string().min(1),
});

/**
 * Score one answer. Pure for every scorer but `judge`.
 *
 * `toolsUsed` is the list of tool names the agent actually called, from the run's
 * trace. It backs the `tool` scorer, which exists because the `contains` one was
 * measuring the wrong thing: four cases asserted that a tool's *name* appeared in
 * the prose, which a mock provider satisfies by naming its own tools and a real
 * model does not. Live runs failed `signal-comes-from-the-model` while answering
 * "predicts a **down** direction with a calibrated probability of…" — the tool had
 * been called and its output used. The grounding claim is about the trace, so the
 * assertion belongs on the trace.
 */
export async function score(
  testCase: EvalCase,
  answer: string,
  toolsUsed: string[] = [],
): Promise<{ passed: boolean; detail?: string }> {
  const got = testCase.ignoreCase ? answer.toLowerCase() : answer;
  const want = testCase.ignoreCase ? testCase.expected.toLowerCase() : testCase.expected;

  switch (testCase.scorer) {
    case "tool": {
      const called = toolsUsed.includes(testCase.expected);
      return called
        ? { passed: true }
        : {
            passed: false,
            detail: `expected the agent to call ${testCase.expected}; it called [${
              toolsUsed.join(", ") || "nothing"
            }]`,
          };
    }
    case "exact":
      return { passed: got.trim() === want.trim() };
    case "contains":
      return { passed: got.includes(want) };
    case "regex":
      try {
        return { passed: new RegExp(testCase.expected, testCase.ignoreCase ? "i" : "").test(answer) };
      } catch (err) {
        return { passed: false, detail: `bad regex: ${(err as Error).message}` };
      }
    case "judge": {
      // The judge is a model call, so in mock mode it is not a real judgement. Say so
      // rather than reporting a number that looks measured and is not.
      const result = await generate({
        system:
          "You grade an answer against a requirement. Be strict and literal. " +
          "Return JSON only: { correct: boolean, reason: string }.",
        messages: [
          {
            role: "user",
            content: `Requirement:\n${testCase.expected}\n\nAnswer:\n${answer}`,
          },
        ],
        schema: JudgeVerdict,
        cacheKey: `judge:${testCase.id}:${testCase.expected}:${answer.slice(0, 1000)}`,
        maxTokens: 512,
      });
      return {
        passed: result.data.correct,
        detail:
          llmMode() === "mock"
            ? `MOCK JUDGE (not a real judgement): ${result.data.reason}`
            : result.data.reason,
      };
    }
  }
}

export async function runSuite(
  suite: z.infer<typeof SuiteSchema>,
  opts: { db: Db | null } = { db: null },
): Promise<SuiteResult> {
  const results: CaseResult[] = [];

  // Pacing, live only. Each case drives a full agent loop — roughly six model
  // calls — so seven cases fire ~40 requests in under a minute and walk straight
  // into a free-tier rate limit, after which every remaining case silently
  // answers from the mock. The demo path deliberately does not back off (latency
  // is the scarce thing in front of a judge); a measurement can afford to wait.
  const paceMs = llmMode() === "live" ? Number(process.env.EVAL_PACE_MS ?? 60_000) : 0;
  let first = true;

  for (const testCase of suite.cases) {
    if (!testCase.modes.includes(llmMode() as "mock" | "live")) {
      results.push({
        id: testCase.id,
        passed: false,
        excluded: "not-applicable",
        answeredBy: "",
        scorer: testCase.scorer,
        expected: testCase.expected,
        got: "",
        detail: `only meaningful in ${testCase.modes.join("/")} mode`,
        toolCalls: 0,
        ms: 0,
      });
      continue;
    }
    if (!first && paceMs > 0) {
      await new Promise((r) => setTimeout(r, paceMs));
    }
    first = false;
    const started = Date.now();
    let answer = "";
    let toolCalls = 0;
    let toolsUsed: string[] = [];
    let answeredBy = "";
    let detail: string | undefined;

    try {
      const run = await runAgent({ question: testCase.input, db: opts.db, config: config() });
      answer = run.answer;
      toolCalls = run.toolResults.length;
      toolsUsed = run.toolResults.map((r) => r.name);
      answeredBy = run.model;
    } catch (err) {
      detail = `run failed: ${(err as Error).message}`;
    }

    // The router's floor is to answer from the mock when every model fails, so a
    // judge sees an answer instead of a stack trace. That is right for the demo
    // and wrong for a measurement: a live run that quietly fell back to the mock
    // is not evidence about the model. Rate limits made this concrete — a "live"
    // run once reported 43% that was part live, part mock, with nothing on screen
    // saying so. Such a case is now neither a pass nor a failure.
    const excluded: CaseResult["excluded"] =
      llmMode() === "live" && answeredBy === "mock-fallback" ? "mock-fallback" : null;

    const scored = detail
      ? { passed: false, detail }
      : excluded
        ? { passed: false, detail: "fell back to mock — not a live measurement" }
        : await score(testCase, answer, toolsUsed);

    results.push({
      id: testCase.id,
      passed: scored.passed,
      excluded,
      answeredBy,
      scorer: testCase.scorer,
      expected: testCase.expected,
      got: answer.slice(0, 300),
      detail: scored.detail ?? detail,
      toolCalls,
      ms: Date.now() - started,
    });
  }

  const passed = results.filter((r) => r.passed).length;
  // Contaminated cases are excluded from the denominator rather than counted as
  // failures. They measured nothing, and scoring them either way would be a claim
  // about a model that never answered.
  const measured = results.filter((r) => !r.excluded).length;
  const result: SuiteResult = {
    suite: suite.suite,
    mode: llmMode(),
    total: results.length,
    passed,
    excluded: results.length - measured,
    accuracy: measured === 0 ? 0 : passed / measured,
    results,
  };

  if (opts.db) {
    await opts.db
      .insert(evalRuns)
      .values({
        suite: suite.suite,
        mode: result.mode,
        total: result.total,
        passed: result.passed,
        details: results,
      })
      .catch((err) => console.warn("eval run persist failed:", err));
  }

  return result;
}

/** A fixed-width table, so the output can be pasted straight into the README. */
export function formatTable(result: SuiteResult): string {
  const width = Math.max(10, ...result.results.map((r) => r.id.length));
  const lines = [
    `suite: ${result.suite}   mode: ${result.mode}`,
    "",
    `${"case".padEnd(width)}  result  scorer    tools  ms`,
    `${"-".repeat(width)}  ------  --------  -----  ------`,
  ];
  for (const r of result.results) {
    lines.push(
      `${r.id.padEnd(width)}  ${
      r.excluded ? "n/a   " : r.passed ? "pass  " : "FAIL  "
    }  ${r.scorer.padEnd(8)}  ${String(r.toolCalls).padStart(5)}  ${String(r.ms).padStart(6)}`,
    );
  }
  lines.push(
    "",
    `Measured accuracy: ${result.passed}/${result.total - result.excluded} ` +
      `(${Math.round(result.accuracy * 100)}%) in ${result.mode} mode`,
  );
  const fellBack = result.results.filter((r) => r.excluded === "mock-fallback").length;
  const notApplicable = result.results.filter((r) => r.excluded === "not-applicable").length;
  if (notApplicable > 0) {
    lines.push("", `${notApplicable} case(s) do not apply to ${result.mode} mode and were not scored.`);
  }
  if (fellBack > 0) {
    lines.push(
      "",
      `${fellBack} of ${result.total} cases fell back to the mock and are excluded,`,
      "not failed — they measured nothing. Usually a rate limit. Re-run when quota",
      "allows; a partial run is not a number worth quoting.",
    );
  }
  if (result.mode === "mock") {
    lines.push(
      "",
      "NOTE: mock mode measures the plumbing, not the model. Re-run with a key and",
      "LLM_MODE=live before quoting this number as accuracy.",
    );
  }
  const failures = result.results.filter((r) => !r.passed && !r.excluded);
  if (failures.length > 0) {
    lines.push("", "Failures:");
    for (const f of failures) {
      lines.push(`- ${f.id}: expected ${f.scorer} "${f.expected}"`);
      if (f.detail) lines.push(`    ${f.detail}`);
      lines.push(`    got: ${f.got.replace(/\n/g, " ").slice(0, 160)}`);
    }
  }
  return lines.join("\n");
}
