import type { MlResult } from "@/lib/ml/client";
import type { MagnitudeSignal, SignalsPayload } from "@/schemas/finance";
import { EmptyState, ErrorState } from "@/components/common/EmptyState";
import { Disclaimer, PAPER_ONLY } from "./Disclaimer";
import { BasketOverview } from "./BasketOverview";
import { SignalCard } from "./SignalCard";
import { count, probability, sessionDate } from "./format";

/**
 * Today's board: every name in the basket, calls and abstentions together.
 *
 * Abstentions are **not** filtered out and they are not pushed to the bottom. They are
 * interleaved in ticker order with the calls, because the claim this product makes is
 * that "I don't know" is a first-class answer — and a layout that quarantines the
 * abstentions in a collapsed section at the end would be saying the opposite of what the
 * copy says.
 *
 * Every number on this page came from the ML service. When the service is down the whole
 * board becomes one `ErrorState` that says so; it does not render a partial board with
 * placeholder figures (§4.1).
 */

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-card border border-line bg-glass px-3 py-2">
      <span className="label-caps text-[10px] text-ink-4">{label}</span>
      <span className="font-mono text-[16px] text-ink-1">{value}</span>
      {hint && <span className="text-[10px] leading-snug text-ink-4">{hint}</span>}
    </div>
  );
}

function FreshnessNote({ data }: { data: SignalsPayload["data"] }) {
  /**
   * How current the data is, stated rather than implied.
   *
   * A stock dashboard that does not say when its data is from invites the reader to assume
   * "now". This panel is built from a committed parquet file that is refreshed by hand, so
   * the distance from today is a fact the user needs — and when it is stale the note says
   * so plainly instead of the page quietly pretending.
   */
  const stale = data.sessions_behind > 2;
  return (
    <p className={stale ? "text-[12px] text-coral" : "text-[12px] text-ink-3"}>
      Latest session in the dataset: {sessionDate(data.last_session)}
      {data.sessions_behind > 0 && ` · ${data.sessions_behind} session(s) behind ${sessionDate(data.as_of)}`}
      {stale && " — refresh with `make -C ml refresh` before relying on this."}
    </p>
  );
}

/**
 * @param perTicker this name's measured accuracy on the holdout, keyed by ticker. Optional:
 * it comes from the metrics read, which can be unavailable independently of the signals
 * read, and a card without it simply omits the line.
 */
export function SignalsBoard({
  result,
  perTicker,
  magnitude,
}: {
  result: MlResult<SignalsPayload>;
  perTicker?: Record<string, { accuracy?: number | null; n?: number }>;
  /** The magnitude head's call per ticker. Absent when that head is not loaded. */
  magnitude?: Record<string, MagnitudeSignal>;
}) {
  if (result.source === "unavailable") {
    return (
      <div className="flex flex-col gap-3">
        <ErrorState
          title="The model service is not answering"
          detail={`${result.reason}\n\n${result.endpoint}\n\n${result.hint}`}
        />
        <p className="text-[12px] leading-relaxed text-ink-3">
          No signals are shown rather than estimated ones. Every probability on this page comes
          from the evaluated model artifacts; there is no fallback that makes one up.
        </p>
        <Disclaimer />
      </div>
    );
  }

  const payload = result.data;
  const { summary, signals, model } = payload;

  // How many distinct calibrated probabilities the board is actually showing. Used only to
  // decide whether the isotonic-step explanation below is worth printing.
  const distinctProbabilities = new Set(signals.map((s) => s.probability_up)).size;

  if (signals.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          title="No signals in the artifact"
          description="The service answered but returned an empty basket. Regenerate with `make -C ml signals`."
        />
        <Disclaimer />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Disclaimer variant="banner" />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {/*
          Both heads in the first row. The board used to open with direction's "0", which
          reads as a broken page rather than as the product working — and it buried the
          head that *does* have calls today further down every card.
        */}
        <Stat
          label="Direction calls"
          value={count(summary.signals_emitted)}
          hint={`${summary.up_calls} up · ${summary.down_calls} down`}
        />
        {magnitude && (
          <Stat
            label="Move-size calls"
            value={count(Object.values(magnitude).filter((m) => !m.abstain).length)}
            hint="bigger or quieter than usual"
          />
        )}
        <Stat
          label="Abstentions"
          value={count(summary.abstained)}
          hint={`of ${signals.length} names in the basket`}
        />
        <Stat
          label="Threshold"
          value={probability(model.threshold)}
          hint="frozen conviction gate"
        />
        <Stat
          label="Horizon"
          value={`${model.horizon_sessions} session`}
          hint="next trading session only"
        />
      </div>

      <div className="flex flex-col gap-1">
        <FreshnessNote data={payload.data} />
        <p className="text-[11px] text-ink-4">
          {PAPER_ONLY} Model trained to {sessionDate(model.train_end)} on{" "}
          {count(model.train_rows)} rows · {model.calibration}.
        </p>
      </div>

      <BasketOverview payload={payload} perTicker={perTicker} magnitude={magnitude} />

      {summary.signals_emitted === 0 && (
        /**
         * Every name abstained. This is a real and frequent outcome — the frozen threshold
         * emits a signal on roughly a tenth of rows, so on a basket of 18 names a day with
         * no calls at all is ordinary — and the panel has to say so, because a board of
         * nothing but refusals is otherwise indistinguishable from a broken board.
         *
         * It is not a bug to be smoothed over by lowering the threshold. §6.5 freezes that
         * number precisely so it cannot be turned into a dial for making the dashboard
         * look busier, and this panel is what the honest version of that day looks like.
         */
        <div
          data-testid="all-abstained"
          className="flex flex-col gap-2 rounded-panel border border-dashed border-line-strong bg-glass p-4"
        >
          <p className="label-caps text-[11px] text-ink-2">No calls at all today</p>
          <p className="max-w-[78ch] text-[12.5px] leading-relaxed text-ink-2">
            Direction is below the gate on all {signals.length} names — ordinary, not a fault.
            The threshold was set on validation to call about a tenth of sessions and is
            frozen, so it cannot be lowered to make a quiet day look busier.
            {distinctProbabilities < signals.length && (
              <>
                {" "}
                The repeated percentages above are the calibrator, not a placeholder: isotonic
                regression is a step function, so different model outputs round onto the same
                one. Each card&rsquo;s uncalibrated output shows they are all different.
              </>
            )}
            {magnitude && (
              <>
                {" "}
                The move-size head is less reticent — see the{" "}
                <span className="text-ink-1">move size</span> column above.
              </>
            )}
          </p>
        </div>
      )}

      {/*
        The shared explanation, said once.
        It used to be repeated verbatim on all seventeen cards — the same three lines about
        why the threshold is what it is, a hundred-odd words times seventeen, which is how a
        page gets to 4,800 pixels without saying seventeen different things.
      */}
      <p className="max-w-[80ch] text-[12px] leading-relaxed text-ink-3">
        Each card below carries that name&rsquo;s own figures. A wrong call costs money and
        brokerage while a skipped session only forgoes an edge that was never measurable,
        which is why the gate is set to be paid for rather than to be busy — and why it is
        frozen and cannot be lowered to make a quiet day look busier.
      </p>

      <ul className="grid list-none grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {signals.map((signal) => (
          <li key={signal.ticker}>
            <SignalCard
              signal={signal}
              tickerAccuracy={perTicker?.[signal.ticker]?.accuracy ?? undefined}
              tickerSessions={perTicker?.[signal.ticker]?.n}
              magnitude={magnitude?.[signal.ticker]}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
