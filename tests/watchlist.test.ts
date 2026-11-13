import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UNIVERSE, inUniverse } from "@/lib/universe";
// From `@/lib/riskProfile`, not `@/lib/watchlist`: the latter imports `@/auth`, which
// pulls next-auth and the database into a test that needs neither. That split is the
// reason the clamp lives in its own module.
import { DEFAULT_RISK_PROFILE, effectiveThreshold } from "@/lib/riskProfile";
import { RiskProfileSchema } from "@/schemas/finance";

const ROOT = join(__dirname, "..");

/**
 * The watchlist and the risk profile are the only state this product owns that a user can
 * change. So the thing worth testing is not that they store a value — it is that they
 * **cannot reach back into the model**.
 *
 * §6.5 freezes the abstention threshold specifically so it cannot become a dial for making
 * the coverage-accuracy curve look better. A user-editable minimum that could go *below*
 * it would reopen that dial from the UI: someone drags a slider to 50% and the board
 * starts showing calls the model declined to make, with no record that anything changed.
 */

describe("the risk profile can only ever hide signals", () => {
  const MODEL = 0.6;

  it("clamps a user minimum up to the model's frozen threshold", () => {
    expect(effectiveThreshold(MODEL, 0.5)).toBe(MODEL);
    expect(effectiveThreshold(MODEL, 0.55)).toBe(MODEL);
    expect(effectiveThreshold(MODEL, 0)).toBe(MODEL);
    expect(effectiveThreshold(MODEL, -1)).toBe(MODEL);
  });

  it("lets a user be stricter than the model", () => {
    expect(effectiveThreshold(MODEL, 0.75)).toBe(0.75);
    expect(effectiveThreshold(MODEL, 0.95)).toBe(0.95);
  });

  it("is never below the model's threshold, for any input in the schema's range", () => {
    // The property, not three examples: whatever the schema admits, the result is a gate
    // at least as strict as the model's.
    for (let v = 0.5; v <= 0.95; v += 0.01) {
      expect(effectiveThreshold(MODEL, Number(v.toFixed(2)))).toBeGreaterThanOrEqual(MODEL);
    }
  });

  it("the schema itself refuses a minimum below a coin flip", () => {
    expect(RiskProfileSchema.safeParse({ minProbability: 0.49 }).success).toBe(false);
    expect(RiskProfileSchema.safeParse({ minProbability: 1.2 }).success).toBe(false);
    expect(RiskProfileSchema.safeParse({ minProbability: 0.5 }).success).toBe(true);
  });

  it("defaults to the least restrictive setting, so the model's own gate is what applies", () => {
    expect(DEFAULT_RISK_PROFILE.minProbability).toBe(0.5);
    expect(DEFAULT_RISK_PROFILE.horizonSessions).toBe(1);
    expect(DEFAULT_RISK_PROFILE.riskTolerance).toBe("balanced");
  });

  it("rejects a horizon the model cannot predict being passed off as one it can", () => {
    // 1 session is what the model predicts. Longer horizons are *recordable* — the
    // assistant uses them to say the question is outside what was measured — but the
    // schema bounds them so nothing can store a horizon of 500 and have a surface imply
    // it is covered.
    expect(RiskProfileSchema.safeParse({ horizonSessions: 1 }).success).toBe(true);
    expect(RiskProfileSchema.safeParse({ horizonSessions: 20 }).success).toBe(true);
    expect(RiskProfileSchema.safeParse({ horizonSessions: 21 }).success).toBe(false);
    expect(RiskProfileSchema.safeParse({ horizonSessions: 0 }).success).toBe(false);
  });

  it("the save path clamps server-side, not just in the form control", () => {
    /**
     * The slider carries `min={modelThreshold}`, which a browser can ignore and a crafted
     * POST never sees. `saveRiskProfile` has to clamp again. Asserted on the source
     * because the function needs a database to run, and the property worth protecting is
     * that the clamp is *there* — a future edit that trusts the form is the regression.
     */
    const source = readFileSync(join(ROOT, "src", "lib", "watchlist.ts"), "utf8");
    expect(source).toMatch(/minProbability:\s*effectiveThreshold\(/);
  });

  it("refuses to save at all when the frozen threshold cannot be read", () => {
    // With the ML service down there is no model threshold to clamp against, so writing
    // the user's raw value would store an unclamped gate.
    const source = readFileSync(join(ROOT, "src", "lib", "actions", "watchlist.ts"), "utf8");
    expect(source).toMatch(/source === "unavailable"/);
    expect(source).toMatch(/could not be checked against it/i);
  });
});

describe("the watchlist only accepts names the model has seen", () => {
  it("accepts every ticker in the universe, in either case", () => {
    for (const t of UNIVERSE) {
      expect(inUniverse(t)).toBe(true);
      expect(inUniverse(t.toLowerCase())).toBe(true);
    }
  });

  it("rejects a plausible NSE name that is not in the basket", () => {
    // A watchlist row outside the universe could never show a signal: it would render a
    // permanent "no data" that reads as a bug rather than as a rejected input.
    for (const t of ["WIPRO.NS", "TITAN.NS", "ADANIENT.NS", "AAPL", "", "RELIANCE"]) {
      expect(inUniverse(t), `${t} must not be addable`).toBe(false);
    }
  });

  it("the add path validates against the universe, not just the dropdown", () => {
    const source = readFileSync(join(ROOT, "src", "lib", "watchlist.ts"), "utf8");
    expect(source).toMatch(/inUniverse\(ticker\)/);
    expect(source).toMatch(/could never show a signal/);
  });

  it("adding the same name twice is a no-op, not a duplicate row", () => {
    const source = readFileSync(join(ROOT, "src", "lib", "watchlist.ts"), "utf8");
    expect(source).toMatch(/onConflictDoNothing/);
  });
});

describe("the horizon setting is not a dead control", () => {
  /**
   * The risk-profile form tells the user their horizon is "recorded so the assistant can
   * tell you it is outside what has been measured". That sentence has to be true.
   *
   * A setting that is stored and never acted on is a dead control, and one whose label
   * claims a behaviour it does not have is worse — it is the same class of defect as a
   * fabricated number, just in prose.
   */
  it("tells the model to refuse a horizon it was not measured on", async () => {
    const { riskProfileBlock } = await import("@/lib/chatContext");
    const block = riskProfileBlock({
      horizonSessions: 20,
      riskTolerance: "balanced",
      minProbability: 0.6,
    });
    expect(block).toMatch(/outside what this model has been measured on/i);
    expect(block).toMatch(/do not extrapolate/i);
    expect(block).toMatch(/20 sessions/);
  });

  it("says nothing special when the horizon is the one it predicts", async () => {
    const { riskProfileBlock } = await import("@/lib/chatContext");
    const block = riskProfileBlock({
      horizonSessions: 1,
      riskTolerance: "balanced",
      minProbability: 0.6,
    });
    expect(block).toMatch(/exactly what you predict/i);
    expect(block).not.toMatch(/do not extrapolate/i);
  });

  it("always tells the model the preferences cannot change its output", async () => {
    const { riskProfileBlock } = await import("@/lib/chatContext");
    for (const horizon of [1, 5, 20]) {
      const block = riskProfileBlock({
        horizonSessions: horizon,
        riskTolerance: "aggressive",
        minProbability: 0.7,
      });
      expect(block).toMatch(/do not change the model's output/i);
    }
  });

  it("is actually wired into both agent routes, not just available", () => {
    for (const route of ["agent", "chat"]) {
      const source = readFileSync(join(ROOT, "app", "api", route, "route.ts"), "utf8");
      expect(source, `${route} route must pass the risk profile`).toMatch(
        /riskProfile:\s*await getRiskProfile\(/,
      );
    }
  });
});

describe("the watchlist surface cannot fabricate", () => {
  const board = readFileSync(
    join(ROOT, "src", "components", "finance", "WatchlistBoard.tsx"),
    "utf8",
  );

  it("renders an explicit error, not empty cards, when the service is down", () => {
    expect(board).toMatch(/result\.source === "unavailable"/);
    expect(board).toMatch(/model service is not answering/i);
  });

  it("carries the disclaimer in every branch it can return", () => {
    // Three returns: empty list, service down, and the real board. §4.5 applies to all of
    // them, because all three are surfaces a user reads about signals.
    const returns = board.match(/return \(/g) ?? [];
    const disclaimers = board.match(/<Disclaimer/g) ?? [];
    expect(returns.length).toBeGreaterThanOrEqual(3);
    expect(disclaimers.length).toBeGreaterThanOrEqual(3);
  });

  it("greys a filtered call rather than hiding it", () => {
    /**
     * The distinction this product exists to draw: "the model declined" and "you asked not
     * to see calls this weak" are different claims. Hiding the second would make it
     * indistinguishable from the first.
     */
    expect(board).toMatch(/Below your minimum/);
    expect(board).toMatch(/opacity-55/);
    expect(board).toMatch(/would blur the one distinction/);
  });
});
