import { preflight } from "@/lib/preflight";

/** `npm run preflight` — the same checks as /preflight, in the terminal. */
async function main() {
  const report = await preflight();
  const pad = Math.max(...report.checks.map((c) => c.name.length));
  for (const check of report.checks) {
    const mark = check.status === "ok" ? "ok  " : check.status === "warn" ? "warn" : "FAIL";
    console.log(`${mark}  ${check.name.padEnd(pad)}  ${check.detail}`);
    if (check.fix) console.log(`      ${" ".repeat(pad)}  → ${check.fix}`);
  }
  console.log("");
  console.log(report.ok ? "preflight: ready" : "preflight: NOT ready");
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("preflight failed:", err);
  process.exit(1);
});
