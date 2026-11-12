import { db } from "@/db";
import { formatTable, loadSuites, runSuite } from "@/lib/evals";

/**
 * `npm run eval` — run every suite in evals/cases and print a table.
 *
 * Exits non-zero when anything failed, so it is usable as a gate; `/demo-check` calls it.
 */
async function main() {
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
