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
  scorer: z.enum(["contains", "exact", "regex", "judge"]).default("contains"),
  /** Case-insensitive by default; set false where casing matters. */
  ignoreCase: z.boolean().default(true),
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

/** Score one answer. Pure for every scorer but `judge`. */
export async function score(
  testCase: EvalCase,
  answer: string,
): Promise<{ passed: boolean; detail?: string }> {
  const got = testCase.ignoreCase ? answer.toLowerCase() : answer;
  const want = testCase.ignoreCase ? testCase.expected.toLowerCase() : testCase.expected;

  switch (testCase.scorer) {
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

  for (const testCase of suite.cases) {
    const started = Date.now();
    let answer = "";
    let toolCalls = 0;
    let detail: string | undefined;

    try {
      const run = await runAgent({ question: testCase.input, db: opts.db, config: config() });
      answer = run.answer;
      toolCalls = run.toolResults.length;
    } catch (err) {
      detail = `run failed: ${(err as Error).message}`;
    }

    const scored = detail ? { passed: false, detail } : await score(testCase, answer);
    results.push({
      id: testCase.id,
      passed: scored.passed,
      scorer: testCase.scorer,
      expected: testCase.expected,
      got: answer.slice(0, 300),
      detail: scored.detail ?? detail,
      toolCalls,
      ms: Date.now() - started,
    });
  }

  const passed = results.filter((r) => r.passed).length;
  const result: SuiteResult = {
    suite: suite.suite,
    mode: llmMode(),
    total: results.length,
    passed,
    accuracy: results.length === 0 ? 0 : passed / results.length,
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
      `${r.id.padEnd(width)}  ${r.passed ? "pass  " : "FAIL  "}  ${r.scorer.padEnd(8)}  ${String(r.toolCalls).padStart(5)}  ${String(r.ms).padStart(6)}`,
    );
  }
  lines.push(
    "",
    `Measured accuracy: ${result.passed}/${result.total} (${Math.round(result.accuracy * 100)}%) in ${result.mode} mode`,
  );
  if (result.mode === "mock") {
    lines.push(
      "",
      "NOTE: mock mode measures the plumbing, not the model. Re-run with a key and",
      "LLM_MODE=live before quoting this number as accuracy.",
    );
  }
  const failures = result.results.filter((r) => !r.passed);
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
