import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MetricsPayloadSchema } from "@/schemas/finance";

/**
 * The regime note's job is to compare today's regime accuracy against the overall rate, in
 * words. The risk in a component like that is that it only ever phrases good news — so these
 * tests check the comparison against the real artifact and assert that the unflattering case
 * is reachable from the committed data, not merely handled in principle.
 *
 * The wording itself is asserted end-to-end in the Playwright smoke test; what is checked
 * here is the arithmetic behind it, which is the part that could silently invert.
 */

const ROOT = join(__dirname, "..");

function metrics() {
  const raw = readFileSync(join(ROOT, "ml", "artifacts", "metrics.json"), "utf8");
  return MetricsPayloadSchema.parse(JSON.parse(raw));
}

describe("the regime comparison is read from the artifact", () => {
  it("parses the typed breakdown rows without casts", () => {
    const rows = metrics().breakdowns?.per_vix_regime ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      // The schema change this test exists to protect: these were `unknown` and every
      // consumer cast them, so a null accuracy would have reached a formatter as NaN.
      expect(typeof row.n).toBe("number");
      if (row.accuracy !== null && row.accuracy !== undefined) {
        expect(typeof row.accuracy).toBe("number");
      }
    }
  });

  it("has at least one regime where the model is WORSE than its overall rate", () => {
    const m = metrics();
    const overall = m.direction?.accuracy;
    expect(overall).toBeTypeOf("number");
    const rows = (m.breakdowns?.per_vix_regime ?? []).filter(
      (r) => r.regime !== "unknown" && typeof r.accuracy === "number",
    );

    const worse = rows.filter((r) => (r.accuracy as number) < (overall as number));
    expect(
      worse.length,
      "if no regime is below the overall rate, the note's 'worse than' branch is unreachable " +
        "and the component has become incapable of delivering bad news",
    ).toBeGreaterThan(0);
  });

  it("has at least one regime below a coin flip, which the copy claims", () => {
    const rows = metrics().breakdowns?.per_vix_regime ?? [];
    const belowCoinFlip = rows.filter(
      (r) => typeof r.accuracy === "number" && (r.accuracy as number) < 0.5,
    );
    expect(
      belowCoinFlip.length,
      "RegimeNote's caption says one tercile is below a coin flip; that must stay true",
    ).toBeGreaterThan(0);
  });

  it("every regime row carries the VIX range the note quotes", () => {
    const rows = (metrics().breakdowns?.per_vix_regime ?? []).filter(
      (r) => r.regime !== "unknown",
    );
    for (const row of rows) {
      expect(row.vix_range, `${row.regime} has no vix_range`).toBeTruthy();
    }
  });
});
