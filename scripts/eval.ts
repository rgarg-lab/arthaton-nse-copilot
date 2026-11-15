import { db } from "@/db";
import { formatTable, loadSuites, runSuite } from "@/lib/evals";

/**
 * `npm run eval` — run every suite in evals/cases and print a table.
 *
 * Exits non-zero when anything failed, so it is usable as a gate; `/demo-check` calls it.
 *
 * ## Mock by default, live only when asked
 *
 * The suite drives the full agent loop for every case, so each case is one provider call
 * plus one per tool-using turn. It respected `LLM_MODE` from `.env.local`, which meant that
 * the moment a key was configured, every `npm run demo-check` quietly spent real quota —
 * and `demo-check` is the command this project tells you to run before a recording, i.e.
 * the one you run repeatedly, on a free tier that rate-limits fast.
 *
 * So the default is now pinned to mock regardless of `.env.local`, and measuring real
 * accuracy is an explicit `npm run eval -- --live`. The mock run still exercises the loop,
 * the tools, the rules and the approvals — everything except the provider — which is what
 * this gate is actually checking.
 */
async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    // Set before anything imports the router, which reads this at call time.
    process.env.LLM_MODE = "mock";
    console.log("eval: mock mode (pass --live to spend real provider quota)\n");
  } else {
    console.log("eval: LIVE mode — this will make one provider call per case, plus tool turns\n");
  }
  const suites = await loadSuites();
  if (suites.length === 0) {
    console.error("no suites found in evals/cases/*.json");
    process.exit(1);
  }

  let handle = null;
  try {
    handle = await db();
  } catch (err) {
    console.warn("running without persistence:", (err as Error).message);
  }

  let failures = 0;
  for (const suite of suites) {
    const result = await runSuite(suite, { db: handle });
    console.log(formatTable(result));
    console.log("");
    failures += result.total - result.passed;
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("eval failed:", err);
  process.exit(1);
});
