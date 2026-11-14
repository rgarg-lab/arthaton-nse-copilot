import type { MetricsPayload, SignalsPayload } from "@/schemas/finance";
import { percent, REGIME_COPY } from "@/components/finance/format";

/**
 * Today's volatility regime, in plain language, with the model's measured accuracy in that
 * regime against its overall accuracy.
 *
 * ## Why this is worth a component
 *
 * Every figure it needs already existed — `volatility_regime` on each signal, and the
 * `per_vix_regime` breakdown in `metrics.json` — and nothing joined them. A user reading
 * "51.37% overall" has no way to know whether today is a session where that average holds,
 * and the breakdown moves by ten points across terciles, so the average is misleading on
 * most individual days.
 *
 * ## It must be able to say the unflattering version
 *
 * The regime table does not run the way intuition suggests: the model is *best* in stressed
 * sessions and *below a coin flip* in the middle tercile, where its AUC is also below 0.5.
 * So this component reads the comparison out of the artifact and words it from the sign of
 * the difference — it will say "worse than its average" on a normal-tercile day, and that
 * is the entire point. A version that could only deliver good news would be marketing.
 */

/**
 * Sentence-case phrasings of the regimes.
 *
 * The labels and hints themselves live in `REGIME_COPY` in `format.ts` and are reused — the
 * badge on every signal card already says "Stressed", and two spellings of the same regime
 * in one product is how copy drifts. What this adds is only the shape the sentence needs:
 * "today is ___" reads badly with a capitalised noun phrase.
 */
const REGIME_PHRASE: Record<string, string> = {
  calm: "a low-volatility session",
  normal: "a middling-volatility session",
  stressed: "a high-volatility session",
};

export function RegimeNote({
  signals,
  metrics,
}: {
  signals: SignalsPayload;
  metrics: MetricsPayload;
}) {
  const regimes = new Set(signals.signals.map((s) => s.volatility_regime));
  const breakdown = metrics.breakdowns?.per_vix_regime ?? [];
  const overall = metrics.direction?.accuracy;

  // The regime is VIX-derived and therefore market-wide, so every name in the basket
  // normally agrees. "Normally" is not "always" — a mixed set would mean the panel was
  // built across a session boundary, and inventing a single label for it would be a
  // guess. Say nothing rather than pick one.
  if (regimes.size !== 1 || overall === null || overall === undefined) return null;

  const today = [...regimes][0];
  const phrase = REGIME_PHRASE[today];
  const hint = REGIME_COPY[today]?.hint;
  const row = breakdown.find((r) => r.regime === today);
  if (!phrase || !hint || !row || row.accuracy === null || row.accuracy === undefined) {
    return null;
  }

  /**
   * Worded from the sign, not assumed — see the component docstring.
   *
   * The "about the same" case compares the *rendered* strings rather than the raw floats
   * against an epsilon. Two reasons. It removes a magic tolerance from a finance component,
   * which `tests/honesty.test.ts` rightly flags as a metric-shaped literal. And it is more
   * correct: if both numbers round to "51.4%", then "better than its overall rate" beside
   * two identical figures reads as a bug, whichever way the hidden decimals fall.
   */
  const shown = percent(row.accuracy);
  const shownOverall = percent(overall);
  const comparison =
    shown === shownOverall
      ? "the same as its overall rate"
      : row.accuracy > overall
        ? "better than its overall rate"
        : "worse than its overall rate";

  return (
    <section
      className="rounded-panel border border-glass-line bg-surface-2 p-4"
      aria-labelledby="regime-heading"
      data-testid="regime-note"
    >
      <h2 id="regime-heading" className="label-caps text-[11px] text-ink-4">
        Today&rsquo;s conditions
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-1">
        {/* Not lowercased: the hint opens with "India VIX", and folding case on a proper
            noun to make a sentence join read smoothly is the wrong trade. */}
        Today is <strong className="font-medium">{phrase}</strong> — {hint}
        {row.vix_range ? ` (${row.vix_range})` : ""}. On the{" "}
        {row.n.toLocaleString("en-IN")} holdout sessions like it, the model was right{" "}
        <strong className="font-medium">{shown}</strong> of the time, which is {comparison} of{" "}
        {shownOverall}.
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-4">
        Measured on the final holdout, split by volatility tercile. The terciles do not run the
        way intuition suggests — the full table is on the model card, including the one where
        the model is below a coin flip.
      </p>
    </section>
  );
}
