/**
 * Display formatting — the **only** place a fraction becomes a percent.
 *
 * `y_ret` and every probability are fractions throughout the Python pipeline and the API
 * (§6.3: one canonical unit). Percent exists at the display edge and nowhere else, which
 * is this file. My earlier project multiplied and divided by 100 across `models.py` and
 * `fusion.py`; it was self-consistent and completely unreadable, and unreadable unit
 * handling is how a sign error survives review.
 *
 * Nothing here computes a statistic. These are presentation functions over numbers that
 * arrived from `ml/artifacts/*.json` — if a function in this file ever needs to *derive* a
 * figure, that derivation belongs in Python.
 */

/** A fraction as a signed percent: 0.0123 -> "+1.23%". */
export function signedPercent(fraction: number | null | undefined, places = 2): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return "—";
  const pct = fraction * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "" : "";
  return `${sign}${pct.toFixed(places)}%`;
}

/** A fraction as an unsigned percent: 0.6306 -> "63.1%". */
export function percent(fraction: number | null | undefined, places = 1): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(places)}%`;
}

/**
 * A probability as a percentage: 0.6234 -> "62%", or "62.3%" at one place.
 *
 * ## Two arguments, and why the default is still whole percents
 *
 * **Against decimals:** "62.34%" implies the model resolves a third of a percentage point,
 * and it does not. The calibration curve has five populated bins across ~50,000 rows, so
 * the honest resolution is a couple of points at best, and extra digits are a precision
 * claim the evaluation does not support. That argument is why the default is 0.
 *
 * **For decimals, in one specific place:** the signals board shows seventeen names at once,
 * and the isotonic calibrator is a step function, so on a quiet day a dozen of them land on
 * the same step — 0.5183 and 0.5208 both render "52%". A board of twelve identical
 * percentages reads as hardcoded placeholder data, which is a worse failure than
 * over-precision on a project whose whole claim is that nothing is invented.
 *
 * So `places` is opt-in and used only where values must be *told apart*. The extra digit
 * there is doing a different job from implying resolution: it distinguishes two numbers the
 * model genuinely computed differently. The frozen threshold still reads "60%".
 */
export function probability(p: number | null | undefined, places = 0): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(places)}%`;
}

/** A plain number with thousands separators. */
export function count(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN").format(n);
}

/** A metric to a fixed number of places, or an em dash when absent. Never a zero. */
export function fixed(n: number | null | undefined, places = 3): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(places);
}

/** Rupees, Indian digit grouping. */
export function rupees(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)}`;
}

/** "2026-11-11" -> "11 Nov 2026". */
export function sessionDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** Ticker without its exchange suffix, for a headline: "RELIANCE.NS" -> "RELIANCE". */
export function bareTicker(ticker: string): string {
  return ticker.replace(/\.(NS|BO)$/i, "");
}

/**
 * Reference values for the metric scales — **not measurements**.
 *
 * `tests/honesty.test.ts` forbids a metric-shaped decimal literal anywhere in the finance
 * components, because that is how the earlier version of this project ended up shipping an
 * invented accuracy. But a model card does need to say "0.25 would be a coin flip" for a
 * Brier score to mean anything to a reader, and that figure is a property of the scoring
 * rule, not of this model.
 *
 * So the handful of genuine constants live here, named, with the distinction written down,
 * and the components interpolate them. One audited place, and the no-literals rule in the
 * components stays absolute.
 */
export const SCALE_REFERENCE = {
  /** A forecast that always predicts the base rate scores this. */
  brierCoinFlip: 0.25,
  /** No discrimination at all. */
  aucNoSkill: 0.5,
  /** Perfectly calibrated: predicted equals realised. */
  perfectCalibrationError: 0,
} as const;

export const REGIME_COPY: Record<string, { label: string; hint: string }> = {
  calm: { label: "Calm", hint: "India VIX in the lowest third of its training range" },
  normal: { label: "Normal", hint: "India VIX in the middle third of its training range" },
  stressed: { label: "Stressed", hint: "India VIX in the highest third of its training range" },
  unknown: { label: "Unknown", hint: "No India VIX reading for this session" },
};

/**
 * Per-ticker measured accuracy, keyed by ticker, from the holdout breakdown.
 *
 * Built here rather than in each page so the two surfaces that render the board — `/signals`
 * and the workspace's Signals tab — cannot disagree about what a name's track record is.
 * Returns an empty object when the metrics read failed, and the cards then omit the line
 * rather than showing a placeholder.
 */
export function perTickerAccuracy(
  breakdowns: { per_ticker?: { ticker?: string; accuracy?: number | null; n?: number }[] } | undefined,
): Record<string, { accuracy?: number | null; n?: number }> {
  const out: Record<string, { accuracy?: number | null; n?: number }> = {};
  for (const row of breakdowns?.per_ticker ?? []) {
    if (row.ticker) out[row.ticker] = { accuracy: row.accuracy, n: row.n };
  }
  return out;
}

/**
 * The magnitude head's signals keyed by ticker, so a board can look one up per card.
 *
 * Beside `perTickerAccuracy` and for the same reason: two surfaces render this board and
 * they must not disagree. Returns an empty object when that head is unavailable, and the
 * cards omit the row rather than showing a placeholder.
 */
export function magnitudeByTicker<T extends { ticker: string }>(
  signals: T[] | undefined,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const row of signals ?? []) out[row.ticker] = row;
  return out;
}
