import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { headline } from "./data";
import { VO, voWordCount } from "./vo";

/**
 * The video's copy of the app's honesty rule.
 *
 * `tests/honesty.test.ts` in the app fails the build if a metric-shaped literal
 * appears in the UI. The video is where that rule usually breaks, because people
 * say "60% accurate" on camera and nobody diffs a video against an artifact.
 *
 * So: no statistic may be typed into a scene or a set piece. Everything comes
 * through `data.ts`, which reads `ml/artifacts/*.json`.
 */

const SRC = __dirname;
const SCANNED = ["scenes", "three"];

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
};

/**
 * CSS geometry is not a measurement. `left: "50%"` positions a box; it is not a
 * claim about a model. Those property values are stripped before the scan so the
 * rule stays strict about the thing it is actually guarding — a statistic typed
 * into a scene — instead of being loosened to tolerate layout.
 */
const LAYOUT_PROPS =
  "left|right|top|bottom|width|height|inset|margin|marginTop|marginLeft|padding|" +
  "flexBasis|translate|transform|backgroundSize|lineHeight|opacity|borderRadius";

const stripCommentsAndImports = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*import[\s\S]*?from\s+["'].*?["'];?$/gm, "")
    .replace(new RegExp(`\\b(${LAYOUT_PROPS})\\s*:\\s*\`[^\`]*\``, "g"), "$1: _")
    .replace(new RegExp(`\\b(${LAYOUT_PROPS})\\s*:\\s*["'][^"']*["']`, "g"), "$1: _");

describe("no statistic is typed into a scene", () => {
  const files = SCANNED.flatMap((d) => walk(join(SRC, d)));

  it("scans the scene and set-piece trees", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [f.replace(SRC, "src"), f] as const))(
    "%s contains no metric-shaped literal",
    (_label, file) => {
      const src = stripCommentsAndImports(readFileSync(file, "utf8"));

      // A percentage written as text: "51.37%", "60.2 %".
      const pctLiteral = src.match(/\b\d{1,3}\.\d+\s*%/g) ?? [];
      // A bare accuracy-shaped decimal: 0.5137, .6020 — four+ significant
      // decimals is a measurement, not a layout constant.
      const accLiteral = src.match(/\b0?\.\d{4,}\b/g) ?? [];
      // A percentage-shaped integer in the range a metric would live in.
      const pctInt = src.match(/\b(4[5-9]|5\d|6\d|7[0-5])\s*%/g) ?? [];

      expect(
        { pctLiteral, accLiteral, pctInt },
        `metric-shaped literal in ${file}. Every figure must come from data.ts.`,
      ).toEqual({ pctLiteral: [], accLiteral: [], pctInt: [] });
    },
  );

  it.each(files.map((f) => [f.replace(SRC, "src"), f] as const))(
    "%s contains no literal hex colour or font name",
    (_label, file) => {
      const src = stripCommentsAndImports(readFileSync(file, "utf8"));
      const hex = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      const fonts = src.match(/\b(Inter|Georgia|Helvetica|Arial|Consolas)\b/g) ?? [];
      expect({ hex, fonts }, `literal style in ${file}; use theme.ts`).toEqual({
        hex: [],
        fonts: [],
      });
    },
  );
});

/**
 * The two figures must never be conflated. The move-size head has never read the
 * final holdout, so it may not appear under a label implying it has.
 */
describe("the two headline figures carry their qualifier and baseline", () => {
  it("direction is labelled as holdout and ships its baseline", () => {
    expect(headline.direction.qualifier).toMatch(/HOLDOUT/);
    expect(headline.direction.baseline.display).toMatch(/%$/);
    expect(headline.direction.basis).toBe("final holdout");
  });

  it("move size is labelled validation, never out-of-sample", () => {
    expect(headline.moveSize.qualifier).toMatch(/VALIDATION/);
    expect(headline.moveSize.qualifier).not.toMatch(/HOLDOUT|OUT OF SAMPLE/i);
    expect(headline.moveSize.baseline.display).toMatch(/%$/);
  });

  it("the artifact still says the move-size head never read the holdout", () => {
    expect(headline.moveSize.neverReadHoldout).toMatch(/[Nn]ot evaluated on the final holdout/);
  });

  it("the two figures are different numbers, so conflating them would be visible", () => {
    expect(headline.direction.value).not.toBeCloseTo(headline.moveSize.value, 3);
  });
});

/** Changing an artifact must change the frame — i.e. nothing is hardcoded. */
describe("figures are bound to the artifacts", () => {
  it("direction accuracy matches metrics.json to the digit", () => {
    const metrics = JSON.parse(
      readFileSync(join(SRC, "../../ml/artifacts/metrics.json"), "utf8"),
    );
    expect(headline.direction.value).toBe(metrics.direction.accuracy);
    expect(headline.direction.n).toBe(metrics.direction.n);
  });

  it("move-size median matches magnitude_metrics.json to the digit", () => {
    const mag = JSON.parse(
      readFileSync(join(SRC, "../../ml/artifacts/magnitude_metrics.json"), "utf8"),
    );
    expect(headline.moveSize.value).toBe(mag.summary.accuracy_when_calling_median);
  });
});

/** The VO has to stay inside the cadence measured off the reference. */
describe("voice-over cadence", () => {
  const RUNTIME_S = 180;
  const REFERENCE_WPM = 119.3; // analysis/transcript.json, measured

  it("word count lands within 10% of the reference cadence", () => {
    const wpm = voWordCount / (RUNTIME_S / 60);
    expect(Math.abs(wpm - REFERENCE_WPM) / REFERENCE_WPM).toBeLessThanOrEqual(0.1);
  });

  it("no VO line runs past its beat", () => {
    for (const l of VO) expect(l.to).toBeGreaterThan(l.from);
  });

  it("VO lines do not overlap", () => {
    const sorted = [...VO].sort((a, b) => a.from - b.from);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].from).toBeGreaterThanOrEqual(sorted[i - 1].to);
    }
  });

  it("the abstention beat leaves a silent hold", () => {
    const abst = VO.find((l) => l.id === "4.5");
    const next = VO.find((l) => l.id === "4.6");
    expect(abst).toBeDefined();
    expect(next).toBeDefined();
    // The brief gives this beat the longest hold in the film.
    expect(next!.from - abst!.to).toBeGreaterThanOrEqual(3);
  });
});
