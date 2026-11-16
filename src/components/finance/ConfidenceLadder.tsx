import type { ConfidencePayload } from "@/schemas/finance";
import { count, percent, probability } from "./format";

/**
 * Accuracy by conviction, and the reality check that has to travel with it.
 *
 * ## The number this exists to make sayable
 *
 * 51.37% is what the model scores if forced to call every session. It is not the number a
 * user meets, because the product abstains — when it speaks, it speaks from the confident
 * tail, and the tail is measurably better. On the walk-forward folds, everything above the
 * frozen gate comes in around 63%.
 *
 * ## And the reason that number is dangerous on its own
 *
 * It is a **validation** figure. The final holdout, at the identical gate, recorded 55.50%.
 * That ~7.5-point gap is the validation-optimism tax this project has measured over and
 * over (`ml/experiments/RESULTS.md` puts it at 2.6–4.6 points for a searched configuration),
 * and a component that rendered 63% without it would be the most misleading thing in the
 * app — worse than the invented metrics page this whole project is a reaction to, because
 * it would be *technically* sourced from a real artifact.
 *
 * So the holdout comparison is not an optional prop and not a footnote. It renders directly
 * under the headline, in the same type size, and the producer writes it into the artifact
 * so no caller has to remember it. If `holdout_comparison` is ever missing, this renders
 * the ladder without a headline at all rather than show a tier figure bare.
 */
export function ConfidenceLadder({ data }: { data: ConfidencePayload }) {
  const h = data.holdout_comparison;
  const atGate = data.gates.find((g) => Math.abs(g.gate - data.threshold) < 1e-9);

  return (
    <section
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface-2 p-4"
      aria-labelledby="confidence-ladder-heading"
      data-testid="confidence-ladder"
    >
      <div>
        <h2 id="confidence-ladder-heading" className="text-[15px] font-medium text-ink-1">
          Accuracy by confidence
        </h2>
        <p className="mt-1 max-w-[78ch] text-[12.5px] leading-relaxed text-ink-2">
          The headline accuracy is what the model scores if it is forced to call every
          session. It abstains instead, so the figure that matters is how it does on the
          sessions it actually speaks about.
        </p>
      </div>

      {/* The headline and its reality check, same size, adjacent. See the docstring. */}
      {h && atGate ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-card border border-line-strong bg-glass p-3">
            <p className="label-caps text-[10px] text-ink-4">
              Above the gate · walk-forward validation
            </p>
            <p className="mt-1 font-mono text-[22px] text-ink-1">
              {percent(h.validation_accuracy, 2)}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-3">
              on {percent(h.validation_coverage, 1)} of sessions · {count(atGate.n)} calls
            </p>
          </div>
          <div className="rounded-card border border-evidence-review-line bg-evidence-review-soft p-3">
            <p className="label-caps text-[10px] text-ink-4">
              Same gate · final holdout, read once
            </p>
            <p className="mt-1 font-mono text-[22px] text-ink-1">
              {percent(h.holdout_accuracy, 2)}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-3">
              on {percent(h.holdout_coverage, 1)} of sessions
            </p>
          </div>
        </div>
      ) : null}

      {h?.gap !== null && h?.gap !== undefined && (
        <p className="max-w-[78ch] text-[12px] leading-relaxed text-ink-2">
          <strong className="font-medium text-ink-1">
            The validation figure runs {percent(h.gap, 2)} above the holdout at the same
            gate.
          </strong>{" "}
          That gap is the cost of measuring on folds a model was selected against, and it is
          why the headline elsewhere in this app stays the full-coverage holdout number
          {h.full_coverage_holdout_accuracy !== null &&
          h.full_coverage_holdout_accuracy !== undefined
            ? ` (${percent(h.full_coverage_holdout_accuracy, 2)})`
            : ""}
          . Quote the validation tiers only with the holdout beside them.
        </p>
      )}

      {/* The per-prediction bands: what tier a single call falls into. */}
      <div className="flex flex-col gap-1">
        <div className="hidden grid-cols-[7rem_1fr_5rem_5rem] items-center gap-x-3 text-[10px] text-ink-4 sm:grid">
          <span className="label-caps">Conviction</span>
          <span className="label-caps">What it means</span>
          <span className="label-caps text-right">Coverage</span>
          <span className="label-caps text-right">Accuracy</span>
        </div>
        {data.bands.map((band) => (
          <div
            key={`${band.from}-${band.to ?? "max"}`}
            className={
              band.calls
                ? "grid grid-cols-[1fr_4.5rem] items-baseline gap-x-3 gap-y-0.5 rounded-card bg-glass px-2 py-1.5 text-[12px] sm:grid-cols-[7rem_1fr_5rem_5rem]"
                : "grid grid-cols-[1fr_4.5rem] items-baseline gap-x-3 gap-y-0.5 px-2 py-1.5 text-[12px] sm:grid-cols-[7rem_1fr_5rem_5rem]"
            }
          >
            <span className="font-mono text-ink-2">
              {probability(band.from)}
              {band.to === null ? "+" : `–${probability(band.to)}`}
            </span>
            <span className={band.calls ? "text-ink-1" : "text-ink-4"}>
              <strong className="font-medium capitalize">{band.label}</strong>
              <span className="text-ink-4"> — {band.description}</span>
            </span>
            <span className="hidden text-right font-mono text-ink-3 sm:block">
              {percent(band.coverage, 1)}
            </span>
            <span
              className={
                band.calls ? "text-right font-mono text-ink-1" : "text-right font-mono text-ink-4"
              }
              title={band.note ?? undefined}
            >
              {band.accuracy !== null ? percent(band.accuracy, 1) : "—"}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-ink-4">
        Bands are what a single prediction falls into, not cumulative. The two below the gate
        are shown because they are most of the sessions and the model declines them — their
        accuracy is what you would get by overriding the gate, which is the thing the gate
        exists to stop. All band figures are walk-forward validation; see the holdout
        comparison above.
      </p>
    </section>
  );
}
