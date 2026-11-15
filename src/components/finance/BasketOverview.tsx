import type { MagnitudeSignal, SignalsPayload } from "@/schemas/finance";
import { AXIS_BANDS, bareTicker, probability } from "./format";

/**
 * The whole basket in one view: conviction against the gate, for all 17 names at once.
 *
 * ## Why this exists
 *
 * The board was seventeen cards of six numbers each — about a hundred figures down 4,800
 * pixels, with no way to compare two names without scrolling between them. The single most
 * important fact on the page ("everything is clustered just above a coin flip and nothing is
 * anywhere near the gate") was being communicated by three paragraphs of grey prose, which
 * is the thing nobody reads. One chart says it instantly.
 *
 * ## The axis is zoomed, and says so
 *
 * Conviction runs 50–65% here, not 0–100%. On a full axis all seventeen dots would overlap
 * into one smudge and the chart would be worse than the prose it replaces. A zoomed axis is
 * a real way to mislead, so the bounds are labelled at both ends and the gate is drawn in
 * the same units — the reader can see the dots sit far short of it.
 *
 * ## Both heads, side by side
 *
 * Direction and move size disagree about today — direction calls nothing, move size calls
 * nine of seventeen — and that contrast is the product's actual argument. Putting them in
 * adjacent columns makes it legible in a way two separate sections never did.
 *
 * Nothing is computed here beyond sorting and mapping a probability onto a pixel offset.
 * Every figure arrives from the artifacts.
 */

/** The window the conviction dots are drawn in. Named in format.ts, labelled on the axis. */
const { from: AXIS_MIN, to: AXIS_MAX } = AXIS_BANDS.conviction;

function offset(p: number): number {
  const clamped = Math.max(AXIS_MIN, Math.min(AXIS_MAX, p));
  return ((clamped - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100;
}

export function BasketOverview({
  payload,
  perTicker,
  magnitude,
}: {
  payload: SignalsPayload;
  perTicker?: Record<string, { accuracy?: number | null; n?: number }>;
  magnitude?: Record<string, MagnitudeSignal>;
}) {
  const threshold = payload.model.threshold;
  // Sorted by conviction so the eye reads a ranking rather than ticker alphabetical order,
  // which carries no information.
  const rows = [...payload.signals].sort((a, b) => b.conviction - a.conviction);
  const magnitudeCalls = Object.values(magnitude ?? {}).filter((m) => !m.abstain).length;

  return (
    <section
      className="flex flex-col gap-3 rounded-panel border border-line bg-surface-2 p-4"
      aria-labelledby="basket-overview-heading"
      data-testid="basket-overview"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="basket-overview-heading" className="text-[15px] font-medium text-ink-1">
          The whole basket, at a glance
        </h2>
        <p className="text-[11.5px] text-ink-3">
          Direction called <strong className="font-medium text-ink-1">{payload.summary.signals_emitted}</strong> of{" "}
          {rows.length}
          {magnitude && (
            <>
              {" · "}move size called{" "}
              <strong className="font-medium text-ink-1">{magnitudeCalls}</strong> of {rows.length}
            </>
          )}
        </p>
      </header>

      {/* Axis header: the zoom is declared before any dot is read. */}
      <div className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-x-3 text-[10px] text-ink-4 sm:grid-cols-[6.5rem_1fr_4rem_5.5rem_6rem]">
        <span className="label-caps">Name</span>
        <span className="relative block h-3">
          <span className="absolute left-0">{probability(AXIS_MIN)} conviction</span>
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap text-ink-2"
            style={{ left: `${offset(threshold)}%` }}
          >
            gate {probability(threshold)}
          </span>
          <span className="absolute right-0">{probability(AXIS_MAX)}</span>
        </span>
        <span className="label-caps text-right">Conv.</span>
        <span className="label-caps hidden text-right sm:block">Move size</span>
        <span className="label-caps hidden text-right sm:block">Its record</span>
      </div>

      <ol className="flex list-none flex-col gap-1">
        {rows.map((signal) => {
          const record = perTicker?.[signal.ticker];
          const mag = magnitude?.[signal.ticker];
          const belowCoinFlip =
            record?.accuracy !== null && record?.accuracy !== undefined && record.accuracy < 0.5;
          return (
            <li
              key={signal.ticker}
              className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-x-3 rounded-card px-1 py-1 text-[11.5px] odd:bg-glass sm:grid-cols-[6.5rem_1fr_4rem_5.5rem_6rem]"
            >
              <a
                href={`/workspace?ticker=${encodeURIComponent(signal.ticker)}`}
                className="truncate font-medium text-ink-1 hover:underline"
                title={signal.name}
              >
                {bareTicker(signal.ticker)}
              </a>

              {/* The track: abstention band shaded, gate marked, this name's dot placed. */}
              <span className="relative block h-3.5" aria-hidden>
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
                <span
                  className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-line-strong"
                  style={{ left: `${offset(threshold)}%` }}
                />
                <span
                  className={
                    signal.abstain
                      ? "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink-4 bg-surface-2"
                      : "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-1"
                  }
                  style={{ left: `${offset(signal.conviction)}%` }}
                />
              </span>
              <span className="text-right font-mono text-ink-2">
                {probability(signal.conviction, 1)}
              </span>

              <span className="hidden text-right sm:block">
                {mag ? (
                  mag.abstain ? (
                    <span className="text-ink-5">no call</span>
                  ) : (
                    <span className="text-ink-1">
                      {mag.expectation === "bigger than usual" ? "bigger" : "quieter"}
                    </span>
                  )
                ) : (
                  <span className="text-ink-5">—</span>
                )}
              </span>

              <span
                className={
                  belowCoinFlip
                    ? "hidden text-right font-mono text-coral sm:block"
                    : "hidden text-right font-mono text-ink-3 sm:block"
                }
                title={record?.n ? `measured over ${record.n} holdout sessions` : undefined}
              >
                {record?.accuracy !== null && record?.accuracy !== undefined
                  ? probability(record.accuracy, 1)
                  : "—"}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="text-[11px] leading-relaxed text-ink-4">
        Conviction is distance from a coin flip, so the axis is zoomed to{" "}
        {probability(AXIS_MIN)}–{probability(AXIS_MAX)} — on a full 0–100% axis every dot
        would overlap. A filled dot is a call, a hollow one an abstention. &ldquo;Its
        record&rdquo; is that name&rsquo;s own accuracy on the holdout; the ones in red are
        below a coin flip. Click a name to open it in the workspace.
      </p>
    </section>
  );
}
