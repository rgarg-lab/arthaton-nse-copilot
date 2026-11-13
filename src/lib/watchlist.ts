import { and, desc, eq } from "drizzle-orm";
import { currentUserOrDemo } from "@/auth";
import { ANONYMOUS_SCOPE, db, riskProfile, watchlist } from "@/db";
import { inUniverse } from "@/lib/universe";
import { DEFAULT_RISK_PROFILE, effectiveThreshold } from "@/lib/riskProfile";
import { RiskProfileSchema, type RiskProfile } from "@/schemas/finance";

// Re-exported so callers have one import for "the risk profile", while the rules
// themselves stay in a module with no I/O and therefore testable on their own.
export { DEFAULT_RISK_PROFILE, effectiveThreshold };

/**
 * The watchlist and the risk profile — the two pieces of state this product owns itself.
 *
 * Everything else on screen is read from `ml/artifacts/*.json` through the ML service.
 * These two are genuinely the user's: which names they track, and how conservative they
 * want the board to be. They live in Postgres because they should survive a reload, and
 * nowhere near the model because they must not be able to change what it predicts.
 */

/**
 * Whose list this is.
 *
 * The signed-in user's id, or `anonymous` when auth is unconfigured — which is the
 * supported default (the app has no login wall), so the anonymous scope is a real,
 * first-class case rather than a fallback.
 *
 * Note this is *not* `persistableUserId()`. That guards foreign keys to `users`, and
 * `scope` is a plain text column with no FK precisely so the signed-out path works.
 */
export async function currentScope(): Promise<string> {
  const user = await currentUserOrDemo();
  return user?.id ?? ANONYMOUS_SCOPE;
}

export type WatchlistEntry = {
  id: string;
  ticker: string;
  note: string | null;
  createdAt: Date;
};

export async function listWatchlist(scope: string): Promise<WatchlistEntry[]> {
  try {
    const handle = await db();
    const rows = await handle
      .select({
        id: watchlist.id,
        ticker: watchlist.ticker,
        note: watchlist.note,
        createdAt: watchlist.createdAt,
      })
      .from(watchlist)
      .where(eq(watchlist.scope, scope))
      .orderBy(desc(watchlist.createdAt))
      .limit(50);
    return rows;
  } catch {
    // No database is survivable; the page renders an empty state.
    return [];
  }
}

export type MutationResult = { ok: true } | { ok: false; error: string };

/**
 * Add a ticker. Idempotent, and validated against the universe.
 *
 * The universe check is the important half: the model has only ever seen these names, so
 * a watchlist entry outside it could never show a signal — it would be a row that renders
 * a permanent "no data" and looks like a bug. Rejecting it at the edge is the honest
 * version.
 */
export async function addToWatchlist(scope: string, rawTicker: string): Promise<MutationResult> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) return { ok: false, error: "Pick a ticker." };
  if (!inUniverse(ticker)) {
    return {
      ok: false,
      error: `${ticker} is not one of the 18 names this model covers, so it could never show a signal.`,
    };
  }

  try {
    const handle = await db();
    await handle
      .insert(watchlist)
      .values({ scope, ticker })
      // Adding a name twice is a no-op, not a duplicate row and not an error.
      .onConflictDoNothing({ target: [watchlist.scope, watchlist.ticker] });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function removeFromWatchlist(scope: string, ticker: string): Promise<MutationResult> {
  try {
    const handle = await db();
    await handle
      .delete(watchlist)
      .where(and(eq(watchlist.scope, scope), eq(watchlist.ticker, ticker.toUpperCase())));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── risk profile ────────────────────────────────────────────────────────────────

export async function getRiskProfile(scope: string): Promise<RiskProfile> {
  try {
    const handle = await db();
    const [row] = await handle
      .select()
      .from(riskProfile)
      .where(eq(riskProfile.scope, scope))
      .limit(1);
    if (!row) return DEFAULT_RISK_PROFILE;
    // Parsed rather than cast: a row written before a schema change should degrade to the
    // default, not render a nonsense threshold on a page about calibrated probabilities.
    const parsed = RiskProfileSchema.safeParse({
      horizonSessions: row.horizonSessions,
      riskTolerance: row.riskTolerance,
      minProbability: row.minProbability,
    });
    return parsed.success ? parsed.data : DEFAULT_RISK_PROFILE;
  } catch {
    return DEFAULT_RISK_PROFILE;
  }
}

export async function saveRiskProfile(
  scope: string,
  input: unknown,
  modelThreshold: number,
): Promise<MutationResult> {
  const parsed = RiskProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those settings are not valid." };
  }

  const profile = {
    ...parsed.data,
    minProbability: effectiveThreshold(modelThreshold, parsed.data.minProbability),
  };

  try {
    const handle = await db();
    await handle
      .insert(riskProfile)
      .values({
        scope,
        horizonSessions: profile.horizonSessions,
        riskTolerance: profile.riskTolerance,
        minProbability: profile.minProbability,
      })
      .onConflictDoUpdate({
        target: riskProfile.scope,
        set: {
          horizonSessions: profile.horizonSessions,
          riskTolerance: profile.riskTolerance,
          minProbability: profile.minProbability,
          updatedAt: new Date(),
        },
      });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
