import Link from "next/link";
import type { MlResult } from "@/lib/ml/client";
import type { MetricsPayload } from "@/schemas/finance";
import { Disclaimer } from "./Disclaimer";
import { count, fixed, percent, probability } from "./format";

/**
 * The landing page's numbers strip — and the reason it exists is worth stating.
 *
 * The inherited template had three landing sections built around counts: a corpus size, a
 * confirmed-edges ratio, a learner population. All of them came from the demo seed's PRNG;
 * all of them were plausible; none of them measured anything. They were honest in the
 * template (it is a domain-agnostic starter and its own docs call them placeholders), and
 * they are exactly what §4.1 and §4.2 forbid in a finance submission: a polished page of
 * invented statistics is the single defect this project is a reaction to.
 *
 * So those three sections were deleted rather than re-dressed, and this replaced them. It
 * shows four figures and every one is read from `ml/artifacts/metrics.json`. If the ML
 * service is not running, the strip renders a short honest line and **no numbers** — a
 * landing page with a gap in it is a far better outcome than one with a comforting
 * fabrication in it.
 */

function Cell({
  value,
  label,
  note,
}: {
  value: string;
  label: string;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-l border-line pl-4">
      <span className="font-mono text-[26px] leading-none tracking-[-0.02em] text-ink-1">
        {value}
      </span>
      <span className="text-[12.5px] font-medium text-ink-2">{label}</span>
      <span className="max-w-[28ch] text-[11px] leading-snug text-ink-4">{note}</span>
    </div>
  );
}

export function MeasuredStrip({
  id,
  result,
}: {
  id?: string;
  result: MlResult<MetricsPayload>;
}) {
  const unavailable = result.source === "unavailable";
  const m = unavailable ? null : result.data;
  const d = m?.direction;
  const abst = m?.abstention;
  const base = m?.baselines;

  return (
    <section id={id} className="border-t border-line px-4 py-14">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-1.5">
          <span className="label-caps text-[10px] text-ink-4">Measured, not claimed</span>
          <h2 className="max-w-[46ch] text-[26px] leading-tight font-[420] tracking-[-0.03em] text-ink-1">
            Every number here was produced by the evaluation, not written into the page.
          </h2>
          <p className="max-w-[72ch] text-[13px] leading-relaxed text-ink-3">
            Purged walk-forward folds with a five-session embargo, a final holdout read once,
            and four baselines to compare against. The accuracy is in the low fifties, because
            that is what next-session direction on large-cap equities actually is.
          </p>
        </header>

        {unavailable || !d || !abst || !base ? (
          <div className="rounded-panel border border-dashed border-line bg-glass px-4 py-6">
            <p className="max-w-[72ch] text-[13px] leading-relaxed text-ink-2">
              The model service is not running, so there are no figures to show here. This page
              has none hardcoded — that is deliberate. Start it with{" "}
              <code className="font-mono text-[12px]">python ml/tasks.py serve</code> and reload,
              or read the committed numbers in{" "}
              <code className="font-mono text-[12px]">ml/artifacts/metrics.json</code>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Cell
              value={percent(d.accuracy, 1)}
              label="Holdout accuracy"
              note={`on ${count(d.n)} sessions never seen during training or tuning`}
            />
            <Cell
              value={percent(abst.accuracy_when_signalling, 1)}
              label="Accuracy when it calls"
              note={`on the ${percent(abst.coverage, 0)} of sessions clearing ${probability(abst.threshold)} conviction — it declines the rest`}
            />
            <Cell
              value={fixed(d.brier, 3)}
              label="Brier score"
              note="a calibrated probability, scored as one; 0.25 would be a coin flip"
            />
            <Cell
              value={percent(base.always_up.accuracy, 1)}
              label="Always-predict-up"
              note="the drift baseline the model has to beat before it has said anything"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-pill border border-line-strong bg-glass-strong px-4 py-2 text-[13px] font-medium text-ink-1 transition-colors hover:bg-glass focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-3"
          >
            Read the full model card
          </Link>
          <Link
            href="/signals"
            className="rounded-pill border border-line bg-glass px-4 py-2 text-[13px] text-ink-2 transition-colors hover:text-ink-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-3"
          >
            See today&rsquo;s signals
          </Link>
        </div>

        <Disclaimer />
      </div>
    </section>
  );
}
