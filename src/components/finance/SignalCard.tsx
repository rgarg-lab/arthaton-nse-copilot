import type { Signal } from "@/schemas/finance";
import { Disclaimer } from "./Disclaimer";
import {
  REGIME_COPY,
  bareTicker,
  fixed,
  probability,
  rupees,
  sessionDate,
  signedPercent,
} from "./format";

/**
 * One name's call — or its refusal.
 *
 * The two states are rendered by two different components on purpose, rather than by one
 * card with the direction greyed out. An abstention is not a signal in a degraded state;
 * it is a different claim about the world ("I do not know") and it gets its own visual
 * treatment, its own reason, and no direction anywhere in its markup. `get_signal` omits
 * the `direction` field entirely when abstaining, so `AbstentionCard` has nothing to
 * render even by accident.
 *
 * No number in either card is written here. Everything comes from the payload, which came
 * from `ml/artifacts/latest_signals.json` (§4.2).
 */

function ConvictionBar({ probability: p, threshold }: { probability: number; threshold: number }) {
  /**
   * The probability on a 0–1 axis with the threshold marked on both sides.
   *
   * Two markers, not one, because the threshold is on *conviction* — distance from 0.5 —
   * so it is symmetric. A single marker at 0.60 would silently imply the model only
   * abstains on down-calls, which would make it a long-only bias dressed as caution.
   */
  const pct = Math.max(0, Math.min(1, p)) * 100;
  const upGate = threshold * 100;
  const downGate = (1 - threshold) * 100;

  return (
    <div className="flex flex-col gap-1">
      <div
        className="relative h-1.5 w-full rounded-pill bg-surface-2"
        role="img"
        aria-label={`Calibrated probability of an up move: ${probability(p)}. Signal threshold at ${probability(threshold)} conviction either way.`}
      >
        {/* The abstention band: everything between the two gates. */}
        <div
          className="absolute inset-y-0 bg-glass"
          style={{ left: `${downGate}%`, width: `${upGate - downGate}%` }}
        />
        {[downGate, upGate].map((gate) => (
          <div
            key={gate}
            className="absolute inset-y-[-3px] w-px bg-line-strong"
            style={{ left: `${gate}%` }}
          />
        ))}
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-ink-1"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-ink-4">
        <span>down 0%</span>
        <span>abstain band</span>
        <span>up 100%</span>
      </div>
    </div>
  );
}

function CardFrame({
  signal,
  tone,
  children,
}: {
  signal: Signal;
  tone: "call" | "abstain";
  children: React.ReactNode;
}) {
  const regime = REGIME_COPY[signal.volatility_regime] ?? REGIME_COPY.unknown;
  return (
    <article
      data-testid={tone === "abstain" ? "abstention-card" : "signal-card"}
      data-ticker={signal.ticker}
      className={
        tone === "abstain"
          ? "flex flex-col gap-3 rounded-panel border border-dashed border-line bg-glass p-4"
          : "flex flex-col gap-3 rounded-panel border border-line-strong bg-surface-2 p-4"
      }
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium text-ink-1">{bareTicker(signal.ticker)}</h3>
          <p className="truncate text-[12px] text-ink-3">{signal.name}</p>
        </div>
        <div className="text-right">
          {signal.latest_close !== undefined && (
            <p className="font-mono text-[13px] text-ink-2">{rupees(signal.latest_close)}</p>
          )}
          <p className="text-[11px] text-ink-4" title={regime.hint}>
            {regime.label} volatility
          </p>
        </div>
      </header>

      {children}

      <footer className="flex flex-col gap-2">
        <p className="text-[11px] text-ink-4">
          State as of {sessionDate(signal.as_of_session)} close · predicts the next session
        </p>
        <Disclaimer variant="inline" />
      </footer>
    </article>
  );
}

/**
 * This name's own measured accuracy, from the holdout's per-ticker breakdown.
 *
 * ## Why every card needed this
 *
 * The board looked identical across all 17 names: the same conviction to the nearest whole
 * percent and the same "needed to call it", because the threshold is one global frozen
 * number and the calibrator's step function collapses a quiet day's probabilities onto a
 * couple of values. Nothing on a card was specific to the company it was about.
 *
 * This is, and it is already measured: `breakdowns.per_ticker` in `metrics.json` spans
 * 46.29% (TCS) to 55.19% (Bajaj Finance) over 337 holdout sessions each. **Four of the
 * seventeen are below a coin flip** — SBIN, ITC, Infosys and TCS — which is the most useful
 * thing the board can tell someone and was previously invisible. A called signal on a name
 * the model has never beaten a coin flip on deserves to be read differently from one on a
 * name where it has.
 *
 * Tone follows the measurement rather than being chosen: below 50% is marked as a caution,
 * because that is what it is.
 */
function TickerTrackRecord({ accuracy, n }: { accuracy?: number; n?: number }) {
  if (accuracy === undefined || accuracy === null || !Number.isFinite(accuracy)) return null;
  const belowCoinFlip = accuracy < 0.5;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-line pt-2 text-[11px]">
      <span className="text-ink-4">On this name, historically</span>
      <span
        className={
          belowCoinFlip ? "font-mono font-medium text-coral" : "font-mono font-medium text-ink-2"
        }
      >
        {probability(accuracy, 1)}
      </span>
      {n !== undefined && <span className="text-ink-5">over {n} sessions</span>}
      {belowCoinFlip && (
        <span className="text-coral">— worse than a coin flip on this one</span>
      )}
    </div>
  );
}

/** The abstention. The product's identity, not its failure mode. */
export function AbstentionCard({
  signal,
  tickerAccuracy,
  tickerSessions,
}: {
  signal: Signal;
  tickerAccuracy?: number;
  tickerSessions?: number;
}) {
  return (
    <CardFrame signal={signal} tone="abstain">
      <div className="flex flex-col gap-2">
        <p className="label-caps text-[11px] text-ink-2">No signal today</p>
        <p className="text-[13px] leading-relaxed text-ink-2">{signal.abstain_reason}</p>
      </div>

      <ConvictionBar probability={signal.probability_up} threshold={signal.threshold} />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
        {/* One decimal: see `probability` in format.ts — whole percents made a dozen
            genuinely different values all read "52%". */}
        <dt className="text-ink-4">Conviction</dt>
        <dd className="text-right font-mono text-ink-2">{probability(signal.conviction, 1)}</dd>
        <dt className="text-ink-4">Needed to call it</dt>
        <dd className="text-right font-mono text-ink-2">{probability(signal.threshold)}</dd>
        {/*
          The per-name model output, which the API has always sent "for transparency" and
          which nothing rendered.

          It matters because the calibrator is isotonic — a step function — so on a quiet day
          a dozen names with genuinely different model outputs come out the other side with
          the *identical* calibrated probability. A board of twelve cards all reading 51.8%
          looks exactly like hardcoded placeholder data, which is the worst possible
          impression for a project whose entire claim is that no figure is invented. This is
          the column that shows the twelve are distinct.

          Four decimals, not two: at two it rounds to the same value as its neighbours and
          defeats the purpose. Labelled "uncalibrated" and never as a confidence (§4.6) —
          it is a diagnostic, and the calibrated number above it is the one that means
          anything.
        */}
        {signal.raw_model_output !== undefined && (
          <>
            <dt className="text-ink-4">
              Uncalibrated output{" "}
              <span className="text-ink-5" title="Diagnostic only — not a confidence. The calibrated conviction above is the figure that is measured.">
                (diagnostic)
              </span>
            </dt>
            <dd className="text-right font-mono text-ink-4">
              {fixed(signal.raw_model_output.value, 4)}
            </dd>
          </>
        )}
      </dl>

      {/*
        Why the threshold sits where it does, in the one place a user meets it.
        The asymmetry is the whole argument for abstaining rather than lowering the gate: a
        wrong call costs real money plus the cost of the trade, while a skipped session costs
        an opportunity the user never had a measured edge on. The threshold is therefore set
        where conviction is high enough to pay for being wrong, not where it maximises the
        number of calls — and the model card shows that the accuracy-maximising point would
        be further right still, at near-zero coverage.
      */}
      <p className="text-[11px] leading-relaxed text-ink-4">
        The model&rsquo;s calibrated probability is deliberately not shown as a direction here.
        Conviction below the frozen threshold means its measured edge does not justify a call
        on this name today — and a wrong call costs more than a missed one, since acting on
        noise loses money and brokerage while waiting only forgoes an edge that was never
        measurable. That asymmetry is why the gate is set to be paid for, not to be busy.
      </p>

      <TickerTrackRecord accuracy={tickerAccuracy} n={tickerSessions} />
    </CardFrame>
  );
}

/** A real call: direction, calibrated probability, volatility-implied range. */
export function CallCard({
  signal,
  tickerAccuracy,
  tickerSessions,
}: {
  signal: Signal;
  tickerAccuracy?: number;
  tickerSessions?: number;
}) {
  const up = signal.direction === "up";
  return (
    <CardFrame signal={signal} tone="call">
      <div className="flex items-baseline justify-between gap-3">
        <p
          // The shell's existing status tokens, not new colours: `status-acquired` is its
          // positive green and `coral` its negative red.
          className={
            up
              ? "text-[20px] font-medium text-status-acquired"
              : "text-[20px] font-medium text-coral"
          }
          data-testid="signal-direction"
        >
          {up ? "Up" : "Down"}
        </p>
        <div className="text-right">
          <p className="font-mono text-[20px] text-ink-1" data-testid="signal-probability">
            {probability(signal.probability_up)}
          </p>
          <p className="text-[10px] text-ink-4">calibrated probability of an up move</p>
        </div>
      </div>

      <ConvictionBar probability={signal.probability_up} threshold={signal.threshold} />

      {signal.predicted_range && (
        <div className="flex flex-col gap-1 rounded-card border border-line bg-glass px-3 py-2">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="text-ink-4">Predicted range</span>
            <span className="font-mono text-ink-2">
              {signedPercent(signal.predicted_range.low)} to{" "}
              {signedPercent(signal.predicted_range.high)}
            </span>
          </div>
          <p className="text-[10px] leading-snug text-ink-4">
            Volatility-implied, not a confidence interval — the return model&rsquo;s R² on
            next-session returns is approximately zero. See the model card.
          </p>
        </div>
      )}

      <TickerTrackRecord accuracy={tickerAccuracy} n={tickerSessions} />
    </CardFrame>
  );
}

/**
 * Dispatches on the one field that matters, and passes this name's own track record to
 * whichever card renders. Optional throughout: with the metrics read unavailable there is
 * no per-ticker breakdown, and `TickerTrackRecord` renders nothing rather than a placeholder.
 */
export function SignalCard({
  signal,
  tickerAccuracy,
  tickerSessions,
}: {
  signal: Signal;
  tickerAccuracy?: number;
  tickerSessions?: number;
}) {
  const record = { tickerAccuracy, tickerSessions };
  return signal.abstain ? (
    <AbstentionCard signal={signal} {...record} />
  ) : (
    <CallCard signal={signal} {...record} />
  );
}
