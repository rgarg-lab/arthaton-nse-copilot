import type { ConfidencePayload, MagnitudePayload } from "@/schemas/finance";
import { percent } from "./format";

/**
 * The project's two measured figures that clear 60%, led with rather than buried.
 *
 * ## Why this exists
 *
 * The boards opened with 51.37% — the model's accuracy if it were forced to call every
 * session, which is the one thing it never does. That number is honest and it is also the
 * least representative figure the project has: the product abstains, so the accuracy a user
 * actually meets comes from the confident tail, and the magnitude head answers a different
 * question entirely and answers it better.
 *
 * Both figures below are measured, both are above 60%, and both carry what qualifies them.
 *
 * ## The green is reinforcement, never the signal
 *
 * The inherited shell is monochrome, so `--color-positive` was added for this. The palette
 * validator fails that green against the coral used elsewhere for below-coin-flip figures
 * at ΔE 4.1 under deuteranopia — a red/green reader cannot separate them. So every green
 * figure here is paired with text that says the same thing ("clears 60%"), and the caveat
 * sits in the same card rather than in a footnote. Remove the colour and nothing is lost.
 *
 * ## What each caveat is doing
 *
 * The magnitude figure is a median across four out-of-sample windows and names its spread,
 * because a median without a range is half a measurement. The direction figure is
 * validation and is shown beside its holdout counterpart, because at the same gate the
 * holdout is seven points lower and publishing the better one alone would be the most
 * misleading thing in the app.
 */
export function HeadlineAccuracy({
  magnitude,
  confidence,
}: {
  magnitude?: MagnitudePayload;
  confidence?: ConfidencePayload;
}) {
  const m = magnitude?.measured;
  const h = confidence?.holdout_comparison;
  if (!m && !h) return null;

  return (
    <section
      className="grid gap-2 sm:grid-cols-2"
      aria-label="Measured accuracy above 60%"
      data-testid="headline-accuracy"
    >
      {m && (
        <div className="rounded-panel border border-positive-line bg-positive-soft p-3.5">
          <p className="label-caps text-[10px] text-ink-3">
            Move size · median of 4 out-of-sample windows
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[26px] leading-none text-positive">
              {percent(m.accuracy_when_calling_median, 2)}
            </span>
            {/* The words carry the meaning; the colour only agrees with them. */}
            <span className="text-[11px] font-medium text-positive">clears 60%</span>
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">
            on the {percent(m.coverage_min, 0)}–{percent(m.coverage_max, 0)} of sessions it
            calls, in {m.windows_at_or_above_60pct} of {m.windows_total} windows. Range{" "}
            {percent(m.accuracy_when_calling_min, 1)}–{percent(m.accuracy_when_calling_max, 1)}.
          </p>
          <p className="mt-1 text-[11px] text-ink-4">
            Predicts whether tomorrow is bigger or quieter than usual — not direction.
          </p>
        </div>
      )}

      {h && (
        <div className="rounded-panel border border-positive-line bg-positive-soft p-3.5">
          <p className="label-caps text-[10px] text-ink-3">
            Direction above its gate · walk-forward validation
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[26px] leading-none text-positive">
              {percent(h.validation_accuracy, 2)}
            </span>
            <span className="text-[11px] font-medium text-positive">clears 60%</span>
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">
            on the {percent(h.validation_coverage, 1)} of sessions where conviction clears
            the frozen gate.
          </p>
          {/*
            The qualifier sits in the same card, not a footnote: at this gate the holdout is
            materially lower, and a reader who sees only the green figure has been misled.
          */}
          <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
            On the final holdout, same gate:{" "}
            <strong className="font-medium text-ink-1">{percent(h.holdout_accuracy, 2)}</strong>
            {h.gap !== null && h.gap !== undefined
              ? ` — ${percent(h.gap, 1)} lower. Validation flatters; quote both.`
              : "."}
          </p>
        </div>
      )}
    </section>
  );
}
