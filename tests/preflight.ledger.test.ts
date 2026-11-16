import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The preflight checks added for this project's own claims.
 *
 * The ledger check is the important one: "the final holdout was read exactly once" is the
 * strongest statement this submission makes, and until it was added nothing in the
 * *running* system verified it. These assertions are on the source rather than on a live
 * service because the point is that the check exists, is a `fail` rather than a `warn`,
 * and tells the reader not to submit the number.
 */

const SOURCE = readFileSync(join(__dirname, "..", "src", "lib", "preflight.ts"), "utf8");

describe("preflight guards the project's own claims", () => {
  it("checks the holdout was read exactly once", () => {
    expect(SOURCE).toContain("holdout read once");
    expect(SOURCE).toContain("authoritative_reads === 1");
  });

  it("treats a consumed holdout as a failure, not a warning", () => {
    // A warn would let a reviewer record a demo whose headline is no longer out-of-sample.
    const block = SOURCE.slice(SOURCE.indexOf("holdout read once"));
    const statusLine = block.slice(0, block.indexOf("detail:"));
    expect(statusLine).toContain('"fail"');
  });

  it("tells the reader not to submit a consumed holdout", () => {
    expect(SOURCE).toMatch(/Do not submit this number/i);
  });

  it("never advises the command that would consume the holdout", () => {
    /**
     * The regression this locks down. Preflight used to tell a user with stale prices to
     * run `tasks.py refresh`, which retrains and appends a second authoritative read —
     * the worst advice in the app, given for the most ordinary reason.
     */
    expect(SOURCE).not.toContain("tasks.py refresh");
    expect(SOURCE).toContain("tasks.py catchup");
  });

  it("reports whether the two later heads are loaded", () => {
    expect(SOURCE).toContain("magnitude head");
    expect(SOURCE).toContain("confidence tiers");
  });

  it("reports whether anything keeps the data fresh unattended", () => {
    expect(SOURCE).toContain("daily catch-up");
    expect(SOURCE).toContain("schedule-catchup.ps1");
  });

  it("degrades rather than throwing when the schedule cannot be queried", () => {
    // A readiness check that breaks on someone else's machine is worse than one that
    // admits it cannot tell, so the query is wrapped and platform-gated.
    const block = SOURCE.slice(SOURCE.indexOf("daily catch-up") - 1200);
    expect(block).toContain('process.platform === "win32"');
    expect(block).toContain("catch");
  });
});
