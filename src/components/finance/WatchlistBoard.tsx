import Link from "next/link";
import type { MlResult } from "@/lib/ml/client";
import type { RiskProfile, SignalsPayload } from "@/schemas/finance";
import type { WatchlistEntry } from "@/lib/watchlist";
import { EmptyState, ErrorState } from "@/components/common/EmptyState";
import { UNIVERSE } from "@/lib/universe";
import { removeTickerAction } from "@/lib/actions/watchlist";
import { Disclaimer } from "./Disclaimer";
import { SignalCard } from "./SignalCard";
import { bareTicker, count, probability } from "./format";

/**
 * The watchlist: the user's chosen names, each with its live signal.
 *
 * Two things make this more than a list of strings.
 *
 * **It applies the user's display threshold.** A name whose conviction clears the model's
 * frozen gate but not the user's higher one is shown as muted rather than hidden — with
 * the reason. Hiding it would be indistinguishable from the model abstaining, which is a
 * different claim: the model *did* call it, and this user asked not to see calls that
 * weak. Conflating the two would undo the whole point of the abstention.
 *
 * **It cannot fabricate.** When the ML service is down the page lists the tracked tickers
 * and says it cannot reach the model — it does not render a card with blanks in it.
 */

function RemoveButton({ ticker }: { ticker: string }) {
  return (
    <form action={removeTickerAction}>
      <input type="hidden" name="ticker" value={ticker} />
      <button
        type="submit"
        aria-label={`Remove ${bareTicker(ticker)} from the watchlist`}
        className="rounded-pill border border-line bg-glass px-2.5 py-1 text-[11.5px] text-ink-3 transition-colors hover:border-coral-line hover:text-coral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-1"
      >
        Remove
      </button>
    </form>
  );
}

export function WatchlistBoard({
  entries,
  result,
  profile,
}: {
  entries: WatchlistEntry[];
  result: MlResult<SignalsPayload>;
  profile: RiskProfile;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          title="No names tracked yet"
          description={`Add any of the ${UNIVERSE.length} names this model covers, using the picker above. The watchlist is stored locally in the embedded database and survives a reload.`}
        />
        <Disclaimer />
      </div>
    );
  }

  if (result.source === "unavailable") {
    return (
      <div className="flex flex-col gap-3">
        <ErrorState
          title="Tracking these names, but the model service is not answering"
          detail={`${result.reason}\n\n${result.endpoint}\n\n${result.hint}`}
        />
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-pill border border-line bg-glass px-3 py-1.5"
            >
              <span className="font-mono text-[12px] text-ink-2">{bareTicker(e.ticker)}</span>
              <RemoveButton ticker={e.ticker} />
            </li>
          ))}
        </ul>
        <p className="text-[12px] leading-relaxed text-ink-3">
          The list itself is intact — these are the names you track. No probabilities are
          shown because none could be read from the artifacts.
        </p>
        <Disclaimer />
      </div>
    );
  }

  const byTicker = new Map(result.data.signals.map((s) => [s.ticker, s]));
  const tracked = entries
    .map((e) => ({ entry: e, signal: byTicker.get(e.ticker) }))
    .filter((row) => row.signal !== undefined);

  const modelThreshold = result.data.model.threshold;
  const userGate = Math.max(modelThreshold, profile.minProbability);
  const userIsStricter = userGate > modelThreshold;

  /** Called by the model, but below this user's own minimum. */
  const belowUserGate = (conviction: number) => userIsStricter && conviction < userGate;

  const calls = tracked.filter((r) => !r.signal!.abstain && !belowUserGate(r.signal!.conviction));
  const filtered = tracked.filter((r) => !r.signal!.abstain && belowUserGate(r.signal!.conviction));
  const abstained = tracked.filter((r) => r.signal!.abstain);

  return (
    <div className="flex flex-col gap-4">
      <Disclaimer variant="banner" />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-ink-3">
        <span>
          <span className="font-mono text-ink-1">{count(tracked.length)}</span> tracked
        </span>
        <span>
          <span className="font-mono text-ink-1">{count(calls.length)}</span> called
        </span>
        <span>
          <span className="font-mono text-ink-1">{count(abstained.length)}</span> abstained
        </span>
        {userIsStricter && (
          <span>
            <span className="font-mono text-ink-1">{count(filtered.length)}</span> below your
            minimum
          </span>
        )}
      </div>

      {userIsStricter && (
        <p
          role="note"
          className="rounded-card border border-line bg-glass px-3 py-2 text-[12px] leading-relaxed text-ink-2"
        >
          Your risk profile asks for at least {probability(profile.minProbability)} conviction,
          above the model&rsquo;s own frozen {probability(modelThreshold)}. Calls between the two
          are shown below, greyed, rather than hidden — the model did make them, and treating
          that as if it had abstained would blur the one distinction this product exists to
          draw.
        </p>
      )}

      <ul className="grid list-none grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[...calls, ...abstained].map(({ entry, signal }) => (
          <li key={entry.id} className="flex flex-col gap-1.5">
            <SignalCard signal={signal!} />
            <div className="flex justify-end">
              <RemoveButton ticker={entry.ticker} />
            </div>
          </li>
        ))}
      </ul>

      {filtered.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-medium text-ink-2">
            Below your minimum ({count(filtered.length)})
          </h2>
          <ul className="grid list-none grid-cols-1 gap-3 opacity-55 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(({ entry, signal }) => (
              <li key={entry.id} className="flex flex-col gap-1.5">
                <SignalCard signal={signal!} />
                <div className="flex justify-end">
                  <RemoveButton ticker={entry.ticker} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-ink-4">
        Looking for what the assistant has remembered about you? That is on the{" "}
        <Link href="/memory" className="underline underline-offset-2 hover:text-ink-2">
          memory page
        </Link>
        .
      </p>
    </div>
  );
}
