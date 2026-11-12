import type { MlResult } from "@/lib/ml/client";
import type { NeighborsPayload } from "@/schemas/finance";
import { EmptyState, ErrorState } from "@/components/common/EmptyState";
import { Disclaimer } from "./Disclaimer";
import { bareTicker, count, fixed, percent, sessionDate, signedPercent } from "./format";

/**
 * The evidence layer: the historical sessions that most resemble today, and what actually
 * happened the session after each one.
 *
 * This is what turns the prediction into something a person can check. "68% chance up" is
 * a claim you either believe or you don't. "Of the 25 most similar market states since
 * 2015 — 11 Mar 2019, 4 Aug 2021, 19 Sep 2023, … — 17 went up" is evidence, and the user
 * can go and look those dates up.
 *
 * It also carries its own caveat prominently, because the obvious misreading is to treat
 * "17 of 25 went up" as a 68% probability. It is not: it is a small sample from a
 * non-stationary process, and it sits *beside* the calibrated probability rather than
 * instead of it. The caveat comes from the API payload, so the Python side and the UI
 * cannot drift on the point.
 */

function Outcome({ ret, direction }: { ret: number; direction: "up" | "down" }) {
  return (
    <span
      className={
        direction === "up"
          ? "font-mono text-[12.5px] text-status-acquired"
          : "font-mono text-[12.5px] text-coral"
      }
    >
      {signedPercent(ret)}
    </span>
  );
}

export function EvidenceTimeline({ result }: { result: MlResult<NeighborsPayload> }) {
  if (result.source === "unavailable") {
    return (
      <div className="flex flex-col gap-3">
        <ErrorState
          title="The model service is not answering"
          detail={`${result.reason}\n\n${result.endpoint}\n\n${result.hint}`}
        />
        <Disclaimer />
      </div>
    );
  }

  const p = result.data;

  if (p.error || !p.neighbours || p.neighbours.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          title="Not enough history for an evidence set"
          description={
            p.error ??
            "The service found no prior sessions close enough to compare. Nothing is shown rather than a smaller sample presented as the one requested."
          }
        />
        <Disclaimer />
      </div>
    );
  }

  const upRate = p.empirical_up_rate ?? null;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-[17px] font-medium text-ink-1">
          {p.query ? `Sessions most like ${bareTicker(p.query.ticker)} today` : "Similar sessions"}
        </h2>
        <p className="max-w-[76ch] text-[12.5px] leading-relaxed text-ink-3">
          The {count(p.neighbours_found)} closest historical market states, drawn from{" "}
          {count(p.candidate_pool)} candidate sessions strictly before{" "}
          {sessionDate(p.query?.as_of ?? p.as_of)}, across {count(p.distinct_tickers)} name
          {p.distinct_tickers === 1 ? "" : "s"}. Similarity is Euclidean distance over a
          standardised twelve-dimension market-state vector.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          {
            label: "Went up next session",
            value: percent(upRate, 1),
            hint: `${count(p.up_count)} up · ${count(p.down_count)} down`,
          },
          {
            label: "Median next move",
            value: signedPercent(p.median_next_return),
            hint: `mean ${signedPercent(p.mean_next_return)}`,
          },
          {
            label: "10th–90th percentile",
            value: `${signedPercent(p.return_spread?.p10)} / ${signedPercent(p.return_spread?.p90)}`,
            hint: "how wide the outcomes were",
          },
          {
            label: "Worst / best",
            value: `${signedPercent(p.return_spread?.worst)} / ${signedPercent(p.return_spread?.best)}`,
            hint: "the tails among these analogues",
          },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5 rounded-card border border-line bg-glass px-3 py-2">
            <span className="label-caps text-[10px] text-ink-4">{s.label}</span>
            <span className="font-mono text-[15px] text-ink-1">{s.value}</span>
            <span className="text-[10px] leading-snug text-ink-4">{s.hint}</span>
          </div>
        ))}
      </div>

      {p.caveat && (
        <p
          role="note"
          className="rounded-card border border-line bg-glass px-3 py-2 text-[12px] leading-relaxed text-ink-2"
        >
          {p.caveat}
        </p>
      )}

      {/* The timeline. Ordered by similarity, not by date: the closest analogue is the
          most informative one, and sorting by date would bury it. */}
      <ol className="flex list-none flex-col gap-0 p-0">
        {p.neighbours.map((n, i) => (
          <li
            key={`${n.ticker}-${n.date}`}
            className="flex items-center gap-3 border-b border-line py-2 last:border-0"
          >
            <span className="w-6 shrink-0 font-mono text-[11px] text-ink-4">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-ink-1">
                {sessionDate(n.date)}
                <span className="ml-2 text-[12px] text-ink-3">{bareTicker(n.ticker)}</span>
              </p>
              <p className="text-[10.5px] text-ink-4">distance {fixed(n.distance, 3)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-right">
              <span className="text-[11px] text-ink-4">next session</span>
              <Outcome ret={n.next_session_return} direction={n.next_session_direction} />
            </div>
          </li>
        ))}
      </ol>

      {p.feature_comparison && (
        <details className="rounded-card border border-line bg-glass px-3 py-2">
          <summary className="cursor-pointer text-[12.5px] text-ink-2">
            Which dimensions matched ({p.feature_comparison.length})
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="px-2 py-1 text-left font-medium text-ink-3">
                    Dimension
                  </th>
                  <th scope="col" className="px-2 py-1 text-left font-medium text-ink-3">
                    Today
                  </th>
                  <th scope="col" className="px-2 py-1 text-left font-medium text-ink-3">
                    Analogue mean
                  </th>
                  <th scope="col" className="px-2 py-1 text-left font-medium text-ink-3">
                    All history
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.feature_comparison.map((f) => (
                  <tr key={f.feature} className="border-b border-line last:border-0">
                    <td className="px-2 py-1 text-ink-2">{f.label}</td>
                    <td className="px-2 py-1 text-right font-mono text-ink-2">
                      {fixed(f.query_value, 4)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-ink-2">
                      {fixed(f.neighbour_mean, 4)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-ink-4">
                      {fixed(f.pool_mean, 4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <Disclaimer />
    </div>
  );
}
