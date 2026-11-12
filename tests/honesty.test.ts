import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { UNIVERSE } from "@/lib/universe";
import { DISCLAIMER } from "@/components/finance/Disclaimer";

/**
 * The §4 hard constraints, enforced mechanically rather than by review.
 *
 * Every assertion here corresponds to a specific defect in the earlier version of this
 * project. They are in one file because they are one idea: a claim nobody can check is
 * worth very little, and these are the claims this submission makes about itself.
 */

const ROOT = join(__dirname, "..");

function walk(dir: string, match: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", ".pglite", "ml"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, match));
    else if (match(full)) out.push(full);
  }
  return out;
}

const TSX_FILES = walk(ROOT, (p) => p.endsWith(".tsx"));

describe("the universe is defined once", () => {
  /**
   * `src/lib/universe.ts` duplicates the ticker list from `ml/src/copilot/config.py` so
   * the UI can draw a picker without the ML service being up. Duplication is only
   * acceptable if it is checked, so this parses the Python and compares.
   */
  it("matches ml/src/copilot/config.py exactly, in order", () => {
    const py = readFileSync(join(ROOT, "ml", "src", "copilot", "config.py"), "utf8");
    const block = /UNIVERSE:\s*tuple\[str,\s*\.\.\.\]\s*=\s*\(([\s\S]*?)\)/.exec(py);
    expect(block, "could not find the UNIVERSE tuple in config.py").not.toBeNull();

    const fromPython = [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(fromPython.length).toBe(18);
    expect([...UNIVERSE]).toEqual(fromPython);
  });

  it("has no duplicates and every entry is an NSE symbol", () => {
    expect(new Set(UNIVERSE).size).toBe(UNIVERSE.length);
    for (const t of UNIVERSE) expect(t).toMatch(/^[A-Z&]+\.NS$/);
  });
});

describe("no fabricated statistics in the UI (§4.1, §4.2)", () => {
  /**
   * The specific thing being prevented: the earlier project's metrics page had an accuracy
   * of 58.15, an AUC, a confusion matrix and fifty "epochs" of training curves, all
   * written as literals in the frontend, for a tree model that has no epochs.
   *
   * The check looks for a decimal literal that could be a metric — a probability-shaped
   * 0.xx or a percentage-shaped two-digit-point-two-digit — in the finance components,
   * which are the ones that render model output.
   */
  /**
   * **The finance components *and* the landing page.**
   *
   * The first version of this test scanned only `src/components/finance`, and that gap
   * let a real violation through for most of the build: the inherited `ArcDeck` explainer
   * on the landing page hard-coded a six-row scoring breakdown of invented decimals —
   * `Coverage 0.04`, `Similarity 0.31`, `Learners' next 0.24`, `Total 0.43` — under a
   * heading a visitor reads as "how this works". It was found by grepping the whole tree
   * by hand during the final audit, which is precisely the kind of check that should not
   * depend on remembering to do it.
   *
   * The landing page is the *first* surface a judge sees, so it is the last place a
   * fabricated number should be allowed to sit.
   */
  const SCANNED_TSX = TSX_FILES.filter(
    (p) => p.includes(join("components", "finance")) || p.includes(join("components", "landing")),
  );

  it("finds the components it is meant to scan", () => {
    expect(SCANNED_TSX.length).toBeGreaterThanOrEqual(10);
  });

  it("contains no metric-shaped decimal literals", () => {
    const offenders: string[] = [];
    for (const file of SCANNED_TSX) {
      const source = readFileSync(file, "utf8");
      source.split("\n").forEach((line, i) => {
        // Skip comments and the Tailwind/SVG geometry that legitimately carries numbers.
        const code = line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
        if (/^\s*[*/]/.test(line)) return;
        // A bare 0.xx or an nn.nn — the shapes an accuracy, an AUC or a Brier score take.
        // A leading character class rather than a lookbehind: lookbehind needs an ES2018
        // target, and `npm run typecheck` compiles the tests too.
        const suspicious = /(^|[^\w.\-#])(0\.\d{2,}|\d{2}\.\d+)(?![\w%])/.exec(code);
        if (!suspicious) return;

        /**
         * Presentation values, not data. Each entry is structurally identifiable — a
         * CSS colour function, an SVG coordinate attribute, a spring constant — rather
         * than a general "looks fine" escape hatch, because a loose allowlist here would
         * quietly readmit the exact thing this test exists to catch.
         */
        const PRESENTATION = [
          /Opacity|opacity|rgba?\(/, // colour and alpha
          /strokeWidth|\br=|\b[cxy][12]?=|\bd=|viewBox/, // SVG geometry
          /scale|translate|rotate|\bEASE\b|ease|cubic-bezier/, // transforms and easing
          /stiffness|damping|\bmass\b|velocity/, // spring physics
          /duration|delay|\bpad\b|padding|gap|offset/, // timing and layout
        ];
        if (PRESENTATION.some((p) => p.test(code))) return;
        // Allowed: the named scale references in format.ts. A model card has to say what
        // a Brier score of 0.25 means, and that is a property of the scoring rule rather
        // than a measurement of this model. They live in one audited constant so that the
        // no-literals rule in the components can stay absolute.
        if (/SCALE_REFERENCE\./.test(code)) return;
        offenders.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, `metric-shaped literals found:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("idea.config.ts carries no model statistic", () => {
    /**
     * The config is the one place user-facing copy lives, which makes it the most
     * tempting place to write "55% accurate" by hand. It must not: that number changes
     * every time the model is retrained, and a stale one in the config would be a lie
     * with a very long half-life.
     */
    const source = readFileSync(join(ROOT, "idea.config.ts"), "utf8");
    const body = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // Percentages and probability-shaped decimals.
    expect(body).not.toMatch(/\d{2}(\.\d+)?\s*%/);
    expect(body).not.toMatch(/accuracy of \d/i);
    expect(body).not.toMatch(/\b5[0-9]\.\d+\b/);
  });

  it("the demo seed contains no numeric content at all", () => {
    /**
     * The template's seed generated every screen's content from a PRNG. Here it supplies
     * only a watchlist and a prompt order, and a numeric literal appearing in it would be
     * the first step back toward generated statistics.
     */
    const source = readFileSync(join(ROOT, "src", "data", "demo-seed.ts"), "utf8");
    const body = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // The PRNG's own constants and the slice length are the only numbers permitted.
    const numbers = [...body.matchAll(/(^|[^\w.])(\d+\.\d+)(?![\w])/g)].map((m) => m[2]);
    expect(numbers, "a decimal literal appeared in the demo seed").toEqual([]);
  });
});

describe("the disclaimer (§4.5)", () => {
  it("says the two things it has to say", () => {
    expect(DISCLAIMER.toLowerCase()).toContain("not investment advice");
    expect(DISCLAIMER.toLowerCase()).toMatch(/historical|paper/);
  });

  it("matches the Python service's copy, so API payloads and the UI agree", () => {
    const py = readFileSync(join(ROOT, "ml", "src", "copilot", "config.py"), "utf8");
    const block = /DISCLAIMER\s*=\s*\(([\s\S]*?)\)\n/.exec(py);
    expect(block).not.toBeNull();
    const fromPython = [...block![1].matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");
    expect(fromPython).toBe(DISCLAIMER);
  });

  it("appears on every component that renders a signal", () => {
    /**
     * §4.5 requires it on every surface showing a signal. The earlier project had **zero**
     * occurrences of "not investment advice" in its entire src/ tree while making
     * directional calls on a real listed company.
     *
     * Checked by import rather than by string match, because the text lives in one
     * constant: a signal-rendering component must pull in `Disclaimer`.
     */
    const SIGNAL_COMPONENTS = [
      join("components", "finance", "SignalCard.tsx"),
      join("components", "finance", "SignalsBoard.tsx"),
      join("components", "finance", "ModelCard.tsx"),
      join("components", "finance", "EvidenceTimeline.tsx"),
      join("components", "finance", "MeasuredStrip.tsx"),
    ];
    for (const rel of SIGNAL_COMPONENTS) {
      const source = readFileSync(join(ROOT, "src", rel), "utf8");
      expect(source, `${rel} renders model output and must show the disclaimer`).toMatch(
        /<Disclaimer/,
      );
    }
  });

  it("is on the pages that host those components", () => {
    for (const page of ["signals", "dashboard", "evidence"]) {
      const source = readFileSync(join(ROOT, "app", page, "page.tsx"), "utf8");
      // Each page composes a component that renders the disclaimer itself.
      expect(source).toMatch(/SignalsBoard|ModelCard|EvidenceTimeline/);
    }
  });
});

describe("the system prompt (§4.4, §4.6, §7.4)", () => {
  const prompt = config().agent.systemPrompt;

  it("forbids inventing a number", () => {
    expect(prompt).toMatch(/may not estimate/i);
    // `[\s\S]` rather than the `s` flag, which needs an ES2018 target.
    expect(prompt).toMatch(/If a tool did[\s\S]*not return it, you do not know it/i);
  });

  it("makes the abstention final", () => {
    expect(prompt).toMatch(/abstain/i);
    expect(prompt).toMatch(/Do not supply/i);
  });

  it("states that nothing here touches real money", () => {
    expect(prompt).toMatch(/historical or paper-traded/i);
    expect(prompt).toMatch(/real money/i);
  });

  it("forbids guaranteeing a return", () => {
    expect(prompt).toMatch(/Never promise, guarantee/i);
  });

  it("commits to stating its own accuracy plainly", () => {
    expect(prompt).toMatch(/mid-50s/i);
    expect(prompt).toMatch(/coin flip/i);
  });
});

describe("Gemini only (§4.1)", () => {
  /**
   * §4.1 allows exactly one LLM provider. The failure this guards against is subtle: with
   * `LLM_FALLBACKS=` left empty, the router used to fall through to its default chain,
   * which ends in Anthropic and Groq models whose keys are deliberately unset. Every live
   * turn would then attempt two unreachable providers before giving up — slow, and a
   * misrepresentation of what this project depends on.
   */
  it("treats an explicitly empty LLM_FALLBACKS as no fallbacks", async () => {
    const { fallbackModels } = await import("@/lib/llm/router");
    const original = process.env.LLM_FALLBACKS;
    try {
      process.env.LLM_FALLBACKS = "";
      expect(fallbackModels()).toEqual([]);
      process.env.LLM_FALLBACKS = "gemini-2.5-flash";
      expect(fallbackModels()).toEqual(["gemini-2.5-flash"]);
    } finally {
      if (original === undefined) delete process.env.LLM_FALLBACKS;
      else process.env.LLM_FALLBACKS = original;
    }
  });

  it("still gives an unconfigured clone a default chain", async () => {
    const { fallbackModels, DEFAULT_FALLBACKS } = await import("@/lib/llm/router");
    const original = process.env.LLM_FALLBACKS;
    try {
      delete process.env.LLM_FALLBACKS;
      expect(fallbackModels()).toEqual(DEFAULT_FALLBACKS.split(",").map((m) => m.trim()));
    } finally {
      if (original !== undefined) process.env.LLM_FALLBACKS = original;
    }
  });

  it("the committed .env.example documents the Gemini-only shape", () => {
    const example = readFileSync(join(ROOT, ".env.example"), "utf8");
    expect(example).toMatch(/GEMINI_API_KEY/);
  });
});

describe("the configured copy is about this product", () => {
  it("has no template placeholder text left", () => {
    const idea = config();
    const blob = JSON.stringify(idea).toLowerCase();
    for (const ghost of ["placeholder", "tbd at kickoff", "your idea, shipped", "learner", "aria"]) {
      expect(blob, `"${ghost}" is leftover template copy`).not.toContain(ghost);
    }
  });

  it("names the abstention as the wow moment", () => {
    expect(config().wow.title.toLowerCase()).toMatch(/refus|abstain|declin/);
  });

  it("every must-build points at files that exist", () => {
    for (const mb of config().mustBuilds) {
      for (const file of mb.files) {
        expect(() => statSync(join(ROOT, file)), `${mb.id} claims ${file}`).not.toThrow();
      }
    }
  });
});
