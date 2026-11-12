"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { CalibrationBin, CoveragePoint } from "@/schemas/finance";
import { EmptyState } from "@/components/common/EmptyState";

/**
 * The two charts on the model card.
 *
 * ## Colour
 *
 * `SERIES` reuses the shell's existing `--color-viz` violet (`#8f7cff`) for the first
 * series and adds one second hue. The second hue is **not** the shell's `--color-coral`
 * (`#ff6b6b`): that token is for error states, and at L 0.712 it sits outside the
 * dark-mode lightness band, so a chart using it would read as louder than the data.
 * `#d9534c` is the same hue stepped down to L 0.56. The pair was validated rather than
 * eyeballed:
 *
 *     node scripts/validate_palette.js "#8f7cff,#d9534c" --mode dark --surface "#131316"
 *     [PASS] Lightness band      all 2 inside L 0.48-0.67
 *     [PASS] Chroma floor        all 2 >= 0.1
 *     [PASS] CVD separation      worst adjacent dE 26.4 (protan) · 27.1 (tritan)
 *     [PASS] Normal-vision floor worst adjacent dE 27.7
 *     [PASS] Contrast vs surface all 2 >= 3:1
 *
 * Both charts also carry direct labels and a table view, so identity never rests on
 * colour alone.
 *
 * ## One axis, always
 *
 * Both charts plot quantities that are already on the same 0–1 scale — probabilities,
 * accuracies, coverage fractions — so a single y-axis is correct. The coverage chart in
 * particular is the obvious place someone would reach for a second y-axis, and it does not
 * need one: coverage and accuracy are both fractions.
 */

const SERIES = {
  primary: "#8f7cff", // the shell's --color-viz
  secondary: "#d9534c", // validated second hue; see the docstring
};

const AXIS_TICK = { fill: "rgb(255 255 255 / 46%)", fontSize: 11 };
const GRID = "rgb(255 255 255 / 8%)";
const RECESSIVE = "rgb(255 255 255 / 22%)";

const TOOLTIP_STYLE = {
  background: "#131316",
  border: "1px solid rgb(255 255 255 / 11%)",
  borderRadius: 12,
  fontSize: 12,
  color: "#f5f5f7",
  padding: "8px 10px",
};

function pct(v: number | null | undefined, places = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(places)}%`;
}

/**
 * Recharts types its formatter values as `ValueType`/`NameType` — a union wide enough to
 * include string and array payloads — so a `(value: number, name: string)` callback is not
 * assignable to it. These two helpers narrow at the boundary instead of casting the
 * callback, which would silence the checker on something it is right about.
 */
function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function tooltipFormatter(value: unknown, name: unknown): [string, string] {
  const label = typeof name === "string" ? name : String(name ?? "");
  const n = asNumber(value);
  // `n` is the bin count, not a fraction — formatting it as a percent would read as
  // "4,800%" on the biggest calibration bin.
  if (label === "n") return [n === null ? "—" : n.toLocaleString("en-IN"), "sessions"];
  return [pct(n, 1), label];
}

function Frame({
  title,
  lede,
  children,
  table,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
  table: React.ReactNode;
}) {
  return (
    <figure className="m-0 flex flex-col gap-2 rounded-panel border border-line bg-surface-1 p-4">
      <figcaption className="flex flex-col gap-1">
        <h3 className="text-[13.5px] font-medium text-ink-1">{title}</h3>
        <p className="max-w-[72ch] text-[11.5px] leading-relaxed text-ink-4">{lede}</p>
      </figcaption>
      <div className="h-64 w-full">{children}</div>
      <details className="mt-1">
        <summary className="cursor-pointer text-[11.5px] text-ink-3">
          View as a table
        </summary>
        {/* The table view is not a fallback — it is how a screen-reader user, a
            colourblind reader and anyone printing this page reads the same figures. */}
        <div className="mt-2 overflow-x-auto">{table}</div>
      </details>
    </figure>
  );
}

const CELL = "px-2 py-1 text-right font-mono text-[11.5px] text-ink-2";
const HEAD = "px-2 py-1 text-left text-[11px] font-medium text-ink-3";

// ── calibration ────────────────────────────────────────────────────────────────

/**
 * Predicted probability against realised up-rate, one point per decile.
 *
 * A scatter against a y=x reference, not two line series. The diagonal is not data — it is
 * the ideal — so it is drawn as a recessive dashed reference and named in the lede rather
 * than given a legend entry beside the real measurements. One data series means no legend
 * box at all; the title says what the dots are.
 *
 * Point *size* carries the bin count, which matters a lot here: the end bins typically
 * hold a few dozen rows against several thousand in the middle, and a tiny bin sitting
 * far off the diagonal is noise rather than miscalibration. Showing every bin as an
 * identical dot would make that indistinguishable.
 */
export function CalibrationPlot({ curve }: { curve: CalibrationBin[] }) {
  const points = curve
    .filter((b) => b.n > 0 && b.mean_predicted !== null && b.observed_up_rate !== null)
    .map((b) => ({
      predicted: b.mean_predicted as number,
      observed: b.observed_up_rate as number,
      n: b.n,
      bin: `${pct(b.p_lower)}–${pct(b.p_upper)}`,
    }));

  if (points.length === 0) {
    return (
      <EmptyState
        title="No calibration curve yet"
        description="Run `make -C ml eval` to produce it."
      />
    );
  }

  const lo = Math.min(...points.map((p) => Math.min(p.predicted, p.observed)), 0.4);
  const hi = Math.max(...points.map((p) => Math.max(p.predicted, p.observed)), 0.6);
  const pad = 0.04;
  const domain: [number, number] = [
    Math.max(0, Math.floor((lo - pad) * 20) / 20),
    Math.min(1, Math.ceil((hi + pad) * 20) / 20),
  ];

  return (
    <Frame
      title="Calibration: predicted vs realised"
      lede="Each dot is a decile of predicted probability; its size is how many sessions fell in that decile. The dashed line is perfect calibration — a dot above it means the model under-promised, below it means it over-promised. Small dots far from the line are thin bins, not miscalibration."
      table={
        <table className="w-full min-w-[26rem] border-collapse">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={HEAD}>
                Predicted band
              </th>
              <th scope="col" className={HEAD}>
                Sessions
              </th>
              <th scope="col" className={HEAD}>
                Mean predicted
              </th>
              <th scope="col" className={HEAD}>
                Realised up-rate
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.bin} className="border-b border-line last:border-0">
                <td className="px-2 py-1 text-left text-[11.5px] text-ink-2">{p.bin}</td>
                <td className={CELL}>{p.n.toLocaleString("en-IN")}</td>
                <td className={CELL}>{pct(p.predicted, 1)}</td>
                <td className={CELL}>{pct(p.observed, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 16, bottom: 20, left: -8 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis
            type="number"
            dataKey="predicted"
            domain={domain}
            tick={AXIS_TICK}
            tickFormatter={(v: number) => pct(v)}
            stroke="rgb(255 255 255 / 11%)"
            label={{
              value: "predicted probability of an up move",
              position: "insideBottom",
              offset: -12,
              fill: "rgb(255 255 255 / 40%)",
              fontSize: 11,
            }}
          />
          <YAxis
            type="number"
            dataKey="observed"
            domain={domain}
            tick={AXIS_TICK}
            tickFormatter={(v: number) => pct(v)}
            stroke="rgb(255 255 255 / 11%)"
          />
          {/* Markers are >= 8px; the biggest bins get a larger dot. */}
          <ZAxis type="number" dataKey="n" range={[70, 460]} />
          <ReferenceLine
            segment={[
              { x: domain[0], y: domain[0] },
              { x: domain[1], y: domain[1] },
            ]}
            stroke={RECESSIVE}
            strokeDasharray="4 4"
            ifOverflow="extendDomain"
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: "rgb(255 255 255 / 18%)" }}
            formatter={tooltipFormatter}
            labelFormatter={() => "Calibration bin"}
          />
          <Scatter
            name="realised up-rate"
            data={points}
            fill={SERIES.primary}
            fillOpacity={0.85}
            // A 2px surface ring, so overlapping dots stay countable.
            stroke="#0c0c0e"
            strokeWidth={2}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </Frame>
  );
}

// ── coverage vs accuracy ───────────────────────────────────────────────────────

/**
 * The abstention trade-off: as the threshold rises, fewer signals, better ones.
 *
 * Two series on one axis — both are fractions. The frozen threshold is marked, which is
 * the whole point of the chart: it shows that the chosen point was not the one that
 * maximises accuracy (that would be the far right, at near-zero coverage) but the best
 * accuracy still clearing a usable coverage floor.
 */
export function CoveragePlot({
  curve,
  threshold,
}: {
  curve: CoveragePoint[];
  threshold: number;
}) {
  const points = curve
    .filter((p) => p.accuracy !== null && p.signals > 0)
    .map((p) => ({
      threshold: p.threshold,
      accuracy: p.accuracy as number,
      coverage: p.coverage,
      signals: p.signals,
    }));

  if (points.length === 0) {
    return (
      <EmptyState
        title="No coverage curve yet"
        description="Run `make -C ml eval` to produce it."
      />
    );
  }

  return (
    <Frame
      title="Coverage against accuracy, by threshold"
      lede="Raising the conviction gate makes the model call fewer sessions and get more of them right. The marked line is the frozen threshold: chosen on validation as the best accuracy that still emits a signal often enough to be useful, then never moved."
      table={
        <table className="w-full min-w-[28rem] border-collapse">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={HEAD}>
                Threshold
              </th>
              <th scope="col" className={HEAD}>
                Coverage
              </th>
              <th scope="col" className={HEAD}>
                Signals
              </th>
              <th scope="col" className={HEAD}>
                Accuracy
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr
                key={p.threshold}
                className={
                  p.threshold === threshold
                    ? "border-b border-line bg-glass last:border-0"
                    : "border-b border-line last:border-0"
                }
              >
                <td className="px-2 py-1 text-left text-[11.5px] text-ink-2">
                  {pct(p.threshold, 1)}
                  {p.threshold === threshold && " ← frozen"}
                </td>
                <td className={CELL}>{pct(p.coverage, 1)}</td>
                <td className={CELL}>{p.signals.toLocaleString("en-IN")}</td>
                <td className={CELL}>{pct(p.accuracy, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 20, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="threshold"
            tick={AXIS_TICK}
            tickFormatter={(v: number) => pct(v, 1)}
            stroke="rgb(255 255 255 / 11%)"
            /**
             * Every third tick. The threshold grid is 21 points half a percentage point
             * apart, and labelling all of them produced a solid band of text along the
             * bottom that was slower to read than no labels at all. Four or five anchors
             * is what an axis is for; the exact value of any point is in the tooltip and
             * in the table view.
             */
            interval={2}
            minTickGap={16}
            label={{
              value: "conviction threshold",
              position: "insideBottom",
              offset: -12,
              fill: "rgb(255 255 255 / 40%)",
              fontSize: 11,
            }}
          />
          <YAxis
            tick={AXIS_TICK}
            tickFormatter={(v: number) => pct(v)}
            stroke="rgb(255 255 255 / 11%)"
            domain={[0, 1]}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: "rgb(255 255 255 / 18%)" }}
            formatter={tooltipFormatter}
            labelFormatter={(label) => `Threshold ${pct(asNumber(label), 1)}`}
          />
          <ReferenceLine
            x={threshold}
            stroke={RECESSIVE}
            strokeDasharray="4 4"
            label={{
              value: "frozen",
              position: "top",
              fill: "rgb(255 255 255 / 46%)",
              fontSize: 10,
            }}
          />
          <Line
            type="monotone"
            dataKey="accuracy"
            name="accuracy when signalling"
            stroke={SERIES.primary}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#0c0c0e" }}
          />
          <Line
            type="monotone"
            dataKey="coverage"
            name="share of sessions called"
            stroke={SERIES.secondary}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#0c0c0e" }}
          />
        </LineChart>
      </ResponsiveContainer>
      {/* A legend is always present for two or more series. Hand-built rather than
          Recharts' own, so the labels wear ink tokens and not the series colour. */}
      <ul className="m-0 flex list-none flex-wrap gap-4 p-0">
        {[
          { colour: SERIES.primary, label: "accuracy when signalling", dash: false },
          { colour: SERIES.secondary, label: "share of sessions called", dash: true },
        ].map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <span
              aria-hidden
              className="inline-block h-0.5 w-5 rounded-pill"
              style={
                s.dash
                  ? {
                      backgroundImage: `repeating-linear-gradient(to right, ${s.colour} 0 5px, transparent 5px 8px)`,
                    }
                  : { background: s.colour }
              }
            />
            {s.label}
          </li>
        ))}
      </ul>
    </Frame>
  );
}
