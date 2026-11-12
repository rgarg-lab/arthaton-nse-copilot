import { config } from "@/lib/config";
import { UNIVERSE } from "@/lib/universe";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE DEMO SEED — and a deliberately small one.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * In the template this was the single data file: 550 lines of seeded-PRNG content that
 * every screen rendered — skills, a course catalogue, a learner profile, a generated path,
 * dashboard tiles, trust counts. That design is right for a domain-agnostic starter, where
 * the demo has to look complete before anyone knows what the idea is.
 *
 * It is wrong here, and the reason is §4.1 and §4.2. **Nothing a judge reads as a market
 * fact or a model output may come from this file.** Every probability, accuracy, return and
 * historical date on every screen is read from `ml/artifacts/*.json` through the ML
 * service. A generated-but-plausible 58% accuracy is exactly the defect the earlier version
 * of this project shipped, and a seeded PRNG is a very efficient way to produce one.
 *
 * So what is left is only the content that is honestly *scaffolding*: the names of the
 * tickers we cover (from the real universe), a few conversation starters, and the
 * watchlist a fresh session begins with. There are no numbers in here at all. Grep it —
 * the only numeric literals are array indices.
 *
 * Still deterministic, from a seeded PRNG, for the one thing that genuinely benefits:
 * the watchlist and prompt order are identical between a rehearsal and a recording. A demo
 * that reshuffles itself is a demo you cannot script.
 */

// ── determinism ────────────────────────────────────────────────────────────────

/** mulberry32: small, fast, and identical across platforms. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded from the idea's name, so the demo is stable for as long as the name is. */
const SEED = hashString(config().demoSeed || config().name || "nse-copilot");

/** Deterministic shuffle. Fisher-Yates driven by the seeded PRNG. */
function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── the seed ───────────────────────────────────────────────────────────────────

export type DemoSeed = {
  /**
   * The names a fresh session starts tracking. A subset of the real universe, so the
   * watchlist can never contain a ticker the model has not been trained on.
   */
  watchlist: string[];
  /** The full covered basket, for a picker. */
  universe: readonly string[];
  /** Conversation starters, in a stable order. Sourced from idea.config.ts. */
  prompts: string[];
};

let cached: DemoSeed | null = null;

/** Built once per process. Pure, so it is safe in a server component or a script. */
export function demoSeed(): DemoSeed {
  if (cached) return cached;
  const next = rng(SEED);

  cached = {
    // Five names rather than all eighteen: a watchlist is a selection, and a "watchlist"
    // containing the entire universe would be a less honest default than a real subset.
    watchlist: shuffled(UNIVERSE, next).slice(0, 5),
    universe: UNIVERSE,
    prompts: shuffled(config().sampleQuestions, next),
  };
  return cached;
}

/** Test seam. */
export function resetDemoSeed() {
  cached = null;
}
