import type { MlResult } from "@/lib/ml/client";
import type { MetricsPayload } from "@/schemas/finance";
import { ErrorState } from "@/components/common/EmptyState";
import { Disclaimer } from "./Disclaimer";
import { CalibrationPlot, CoveragePlot, EquityCurve } from "./Charts";
import {
  SCALE_REFERENCE,
  count,
  fixed,
  percent,
  probability,
  sessionDate,
  signedPercent,
} from "./format";

/**
 * The model card. Every figure on it is read from `ml/artifacts/metrics.json`.
 *
 * Grep this file for a decimal literal and you will find none — §4.2 forbids a statistic
 * written by hand in TSX, and the reason that rule exists is specific: the earlier version
 * of this project shipped a beautiful metrics page whose accuracy (58.15%), confusion
 * matrix, AUC and fifty epochs of training curves were all invented, for a tree model that
 * has no epochs. Every one of those numbers was a literal in the frontend.
 *
 * The card is also deliberately unflattering in places. The R² is near zero and shown as
 * such; the max calibration error is shown next to the expected one; the per-regime table
 * shows the regime where the model is worst. A model card that only contains the good
 * numbers is marketing.
 */

function MetricTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line bg-glass px-3 py-2.5">
      <span className="label-caps text-[10px] text-ink-4">{label}</span>
      <span
        className={
          tone === "good"
            ? "font-mono text-[18px] text-status-acquired"
            : tone === "warn"
              ? "font-mono text-[18px] text-coral"
              : "font-mono text-[18px] text-ink-1"
        }
      >
        {value}
      </span>
      {hint && <span className="text-[10px] leading-snug text-ink-4">{hint}</span>}
    </div>
  );
}

function Section({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[17px] font-medium text-ink-1">{title}</h2>
        {lede && <p className="mt-1 max-w-[76ch] text-[12.5px] leading-relaxed text-ink-3">{lede}</p>}
      </div>
      {children}
    </section>
  );
}

function Table({
  head,
  rows,
  caption,
}: {
  head: string[];
  rows: (string | number | null)[][];
  caption?: string;
}) {
  return (
    // Wide tables scroll inside their own container rather than widening the page.
    <div className="overflow-x-auto rounded-card border border-line">
      <table className="w-full min-w-[32rem] border-collapse text-[12.5px]">
        {caption && <caption className="px-3 py-2 text-left text-[11px] text-ink-4">{caption}</caption>}
        <thead>
          <tr className="border-b border-line bg-glass">
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 text-left font-medium text-ink-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={
                    j === 0
                      ? "px-3 py-1.5 text-ink-2"
                      : "px-3 py-1.5 text-right font-mono text-ink-2"
                  }
                >
                  {cell ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ModelCard({ result }: { result: MlResult<MetricsPayload> }) {
  if (result.source === "unavailable") {
    return (
      <div className="flex flex-col gap-3">
        <ErrorState
          title="The model service is not answering"
          detail={`${result.reason}\n\n${result.endpoint}\n\n${result.hint}`}
        />
        <p className="text-[12px] leading-relaxed text-ink-3">
          This page has no hardcoded figures to fall back on — every number on it is read from
          <code className="mx-1 font-mono">ml/artifacts/metrics.json</code> through the service.
          That is the point.
        </p>
        <Disclaimer />
      </div>
    );
  }

  const m = result.data;
  const d = m.direction;
  const base = m.baselines;
  const cal = m.calibration;
  const abst = m.abstention;
  const reg = m.regression;
  const design = m.evaluation_design;
  const prov = m.provenance;

  if (!d || !base || !cal || !abst) {
    return (
      <div className="flex flex-col gap-3">
        <ErrorState
          title="The metrics artifact is incomplete"
          detail="metrics.json loaded but is missing a required section. Regenerate it with `make -C ml eval`."
        />
        <Disclaimer />
      </div>
    );
  }

  const bh = base.buy_and_hold as Record<string, number | null | undefined>;
  const authoritative = m.headline_authoritative !== false;

  /**
   * The scenario the equity curve is drawn for, and the one the tiles quote.
   *
   * `is_default` is set in `ml/src/copilot/config.py`, so the choice of which cost
   * assumption leads is made once, in Python, next to the basis-point figures themselves —
   * not here, where it would be a UI decision about which number looks best.
   */
  const defaultScenario = m.paper_trading
    ? (Object.entries(m.paper_trading.scenarios).find(([, s]) => s.is_default) ??
      Object.entries(m.paper_trading.scenarios)[0])
    : undefined;

  return (
    <div className="flex flex-col gap-8">
      <Disclaimer variant="banner" />

      {!authoritative && (
        <div role="alert" className="rounded-card border border-coral-line bg-coral-soft px-3 py-2">
          <p className="text-[12.5px] leading-relaxed text-ink-1">
            <strong>Not an authoritative measurement.</strong> {m.headline_note}
          </p>
        </div>
      )}

      <Section
        title="Headline — final holdout"
        lede={
          `Measured on ${count(d.n)} rows the model never saw, from ` +
          `${sessionDate(design?.holdout_range?.[0])} to ${sessionDate(design?.holdout_range?.[1])}. ` +
          `Hyperparameters and the abstention threshold were chosen on purged walk-forward folds ` +
          `before this window was read. Next-session direction on large-cap equities is close to a ` +
          `coin flip; the numbers below are what honest looks like, not what good marketing looks like.`
        }
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          <MetricTile
            label="Accuracy"
            value={percent(d.accuracy, 2)}
            hint="directional, all rows"
          />
          <MetricTile
            label="Balanced accuracy"
            value={percent(d.balanced_accuracy, 2)}
            hint="corrects for the up/down mix"
          />
          <MetricTile
            label="AUC"
            value={fixed(d.auc, 4)}
            hint={`${SCALE_REFERENCE.aucNoSkill} would be no skill at all`}
          />
          <MetricTile
            label="Brier score"
            value={fixed(d.brier, 4)}
            hint={`lower is better; ${SCALE_REFERENCE.brierCoinFlip} is a coin flip`}
          />
          <MetricTile label="Log loss" value={fixed(d.log_loss, 4)} hint="penalises confident errors" />
        </div>
      </Section>

      <Section
        title="Against four baselines"
        lede="An accuracy figure on its own is unreadable. These are the things the model has to beat before it has said anything: the market's own drift, naive momentum, a three-feature linear model on the identical split, and simply holding the basket."
      >
        <Table
          head={["Baseline", "Accuracy", "AUC", "Brier"]}
          rows={[
            [
              "This model (calibrated LightGBM)",
              percent(d.accuracy, 2),
              fixed(d.auc, 4),
              fixed(d.brier, 4),
            ],
            [
              "Always predict up",
              percent(base.always_up.accuracy, 2),
              fixed(base.always_up.auc, 4),
              fixed(base.always_up.brier, 4),
            ],
            [
              "Previous-day sign (momentum)",
              percent(base.previous_day_sign.accuracy, 2),
              fixed(base.previous_day_sign.auc, 4),
              fixed(base.previous_day_sign.brier, 4),
            ],
            [
              "Logistic regression, 3 features",
              percent(base.logistic_3_feature.accuracy, 2),
              fixed(base.logistic_3_feature.auc, 4),
              fixed(base.logistic_3_feature.brier, 4),
            ],
          ]}
          caption="All four evaluated on the same purged holdout window as the model."
        />

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <MetricTile
            label="Buy & hold, total"
            value={signedPercent(bh.total_return)}
            hint="equal-weight basket, no trading, no costs"
          />
          <MetricTile
            label="Buy & hold, annualised"
            value={signedPercent(bh.annualised_return)}
            hint={`over ${count(bh.sessions)} sessions`}
          />
          <MetricTile label="Buy & hold Sharpe" value={fixed(bh.sharpe, 2)} />
          <MetricTile
            label="Buy & hold max drawdown"
            value={signedPercent(bh.max_drawdown)}
            tone="warn"
          />
        </div>
        <p className="max-w-[76ch] text-[11.5px] leading-relaxed text-ink-4">
          The economic baseline is stated in return terms because a directional edge that does
          not survive costs is not an investment case. The paper-trading section of
          <code className="mx-1 font-mono">metrics.json</code> charges 7, 13 and 25 basis points
          per round trip and reports all three.
        </p>
      </Section>

      <Section
        title="Calibration"
        lede="The claim that makes the probability usable: of the sessions where the model said 62%, about 62% went up. Isotonic regression fit on out-of-fold walk-forward predictions, then measured on the holdout. A diagonal is perfect."
      >
        <CalibrationPlot curve={cal.curve} />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <MetricTile
            label="Expected calibration error"
            value={percent(cal.expected_calibration_error, 2)}
            hint="weighted mean gap from the diagonal"
          />
          <MetricTile
            label="Max calibration error"
            value={percent(cal.max_calibration_error, 2)}
            hint="worst single bin, usually a sparse one"
          />
          <MetricTile
            label="Populated bins"
            value={`${cal.populated_bins ?? "—"} of ${cal.curve.length}`}
            hint="a well-behaved model concentrates near 0.5"
          />
        </div>
      </Section>

      <Section
        title="Abstention — the coverage / accuracy trade"
        lede={
          `The threshold is on conviction, the distance from 0.5, so it is symmetric: the model ` +
          `abstains when it is unsure in either direction. It was chosen on validation and frozen ` +
          `before the holdout was read, so the figures below are the out-of-sample consequences of ` +
          `that choice rather than a curve fitted to it.`
        }
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <MetricTile
            label="Frozen threshold"
            value={probability(abst.threshold)}
            hint="conviction required to emit"
          />
          <MetricTile
            label="Coverage"
            value={percent(abst.coverage, 1)}
            hint={`${count(abst.signals_emitted)} signals, ${count(abst.abstentions)} abstentions`}
          />
          <MetricTile
            label="Accuracy when it calls"
            value={percent(abst.accuracy_when_signalling, 2)}
            tone="good"
          />
          <MetricTile
            label="Accuracy on all rows"
            value={percent(abst.accuracy_on_all_rows, 2)}
            hint="what you would get without abstaining"
          />
        </div>
        <CoveragePlot curve={abst.coverage_accuracy_curve} threshold={abst.threshold} />
      </Section>

      {reg && (
        <Section
          title="Return magnitude — reported, not hidden"
          lede="The second head predicts the size of the move, and it is close to useless. That is the correct result for this horizon, and it is the reason the product acts on calibrated direction with abstention rather than on a return forecast. A project reporting a healthy R² here would be reporting a bug."
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <MetricTile
              label="R²"
              value={fixed(reg.r2, 4)}
              tone="warn"
              hint="approximately zero, as expected"
            />
            <MetricTile label="MAE" value={percent(reg.mae, 3)} hint="mean absolute error" />
            <MetricTile label="RMSE" value={percent(reg.rmse, 3)} />
            <MetricTile
              label="Mean actual move"
              value={percent(reg.mean_abs_actual_return, 3)}
              hint="the thing being predicted"
            />
          </div>
        </Section>
      )}

      {m.paper_trading && (
        <Section
          title="Paper trading — what the edge would have been worth"
          lede={
            `${m.paper_trading.description} Costs are charged on every position change under ` +
            `three scenarios, because a single optimistic cost figure is how a strategy gets ` +
            `to look profitable. Read all three, and read them against the survivorship ` +
            `caveat in the limitations below.`
          }
        >
          <Table
            head={[
              "Cost scenario",
              "Round trip",
              "Total return",
              "Annualised",
              "Sharpe",
              "Max drawdown",
            ]}
            rows={[
              ...Object.entries(m.paper_trading.scenarios).map(([name, s]) => [
                `${name}${s.is_default ? " (default)" : ""}`,
                `${s.total_bps_per_round_trip} bps`,
                signedPercent(s.total_return),
                signedPercent(s.annualised_return),
                fixed(s.sharpe, 2),
                signedPercent(s.max_drawdown),
              ]),
              // The economic baseline on the same axis, for the comparison that matters.
              [
                "buy & hold (no costs)",
                "—",
                signedPercent(bh.total_return),
                signedPercent(bh.annualised_return),
                fixed(bh.sharpe, 2),
                signedPercent(bh.max_drawdown),
              ],
            ]}
            caption="Holdout window only. Long/short the names clearing the frozen threshold, equal-weighted, flat otherwise."
          />

          {defaultScenario && (
            <EquityCurve
              curve={m.paper_trading.equity_curve}
              buyAndHoldTotal={bh.total_return}
              costLabel={defaultScenario[0]}
            />
          )}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <MetricTile
              label="Sessions in the window"
              value={count(m.paper_trading.sessions)}
            />
            <MetricTile
              label="Sessions holding a position"
              value={count(m.paper_trading.sessions_with_a_position)}
              hint="the rest are abstentions — the strategy sits in cash"
            />
            <MetricTile
              label="Mean names held"
              value={fixed(m.paper_trading.mean_names_held, 2)}
              hint="when it is in the market at all"
            />
            <MetricTile
              label="Positive sessions"
              value={percent(defaultScenario?.[1].win_rate, 1)}
              hint={
                `of all ${count(m.paper_trading.sessions)} sessions, not of the ` +
                `${count(m.paper_trading.sessions_with_a_position)} it traded — most are flat`
              }
            />
          </div>

          <p
            role="note"
            className="max-w-[80ch] rounded-card border border-coral-line bg-coral-soft px-3 py-2 text-[12px] leading-relaxed text-ink-1"
          >
            <strong>This is a historical simulation, not a track record.</strong> It assumes a
            fill at the close with a flat per-trade cost, and models no market impact, no
            partial fills, no borrow cost or availability for the short leg, and no circuit
            limits. The universe is today&rsquo;s large-caps, so survivorship bias pushes any
            backtest return upward. The measured claim this project makes is the directional
            edge above; this section is an illustration of what that edge would be worth under
            assumptions that are stated rather than hidden.
          </p>
        </Section>
      )}

      {m.breakdowns && (
        <Section
          title="Where it works and where it does not"
          lede="Split by year and by volatility regime. The regime table is what the assistant quotes when it declines to call a session: the refusal is backed by a measured number rather than by a cautious tone."
        >
          <Table
            head={["Year", "Rows", "Accuracy", "AUC", "Brier"]}
            rows={m.breakdowns.per_year.map((r) => [
              String(r.year),
              count(r.n as number),
              percent(r.accuracy as number, 2),
              fixed(r.auc as number, 4),
              fixed(r.brier as number, 4),
            ])}
          />
          <Table
            head={["Volatility regime", "India VIX", "Rows", "Accuracy", "Brier"]}
            rows={m.breakdowns.per_vix_regime.map((r) => [
              String(r.regime),
              r.vix_range ?? "—",
              count(r.n),
              percent(r.accuracy, 2),
              fixed(r.brier, 4),
            ])}
            caption="Terciles fit on training rows only."
          />
          <details className="rounded-card border border-line bg-glass px-3 py-2">
            <summary className="cursor-pointer text-[12.5px] text-ink-2">
              Per-ticker accuracy ({m.breakdowns.per_ticker.length} names)
            </summary>
            <div className="mt-3">
              <Table
                head={["Ticker", "Rows", "Accuracy", "Brier"]}
                rows={m.breakdowns.per_ticker.map((r) => [
                  String(r.ticker),
                  count(r.n as number),
                  percent(r.accuracy as number, 2),
                  fixed(r.brier as number, 4),
                ])}
                caption="Per-name figures on a few hundred rows each are noisy; the pooled number is the one to read."
              />
            </div>
          </details>
        </Section>
      )}

      <Section
        title="How it was evaluated"
        lede="The part that decides whether any of the above means anything."
      >
        {design?.walk_forward_folds && (
          <Table
            head={["Fold", "Train rows", "Train ends", "Validation", "Purged"]}
            rows={design.walk_forward_folds.map((f) => [
              String(f.fold),
              count(f.train_rows as number),
              sessionDate(f.train_end as string),
              `${sessionDate(f.val_start as string)} → ${sessionDate(f.val_end as string)}`,
              `${f.embargoed_sessions} sessions`,
            ])}
            caption="Expanding window. The last sessions before each validation window are purged, so the final training row's outcome cannot be the first validation session's move."
          />
        )}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
          {[
            ["Panel rows", count(prov?.panel_rows)],
            ["Universe", `${prov?.universe_size ?? "—"} NSE large-caps`],
            ["Features", `${prov?.feature_count ?? "—"} (ceiling 60)`],
            ["Horizon", `${prov?.horizon_sessions ?? "—"} session`],
            ["Trained to", sessionDate(prov?.model_train_end)],
            ["Training rows", count(prov?.model_train_rows)],
            ["Holdout starts", sessionDate(design?.holdout_start)],
            [
              "Authoritative holdout reads",
              String(
                (design?.holdout_ledger as Record<string, unknown> | undefined)
                  ?.authoritative_reads ?? "—",
              ),
            ],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line py-1">
              <dt className="text-ink-4">{k}</dt>
              <dd className="font-mono text-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {m.known_limitations && (
        <Section
          title="Known limitations"
          lede="Written into the evaluation artifact, not into a slide. Each of these is a reason to trust the numbers above less than you otherwise would."
        >
          <ul className="flex list-none flex-col gap-2">
            {m.known_limitations.map((limitation) => (
              <li
                key={limitation}
                className="rounded-card border border-line bg-glass px-3 py-2 text-[12.5px] leading-relaxed text-ink-2"
              >
                {limitation}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <footer className="flex flex-col gap-2">
        <p className="text-[11px] text-ink-4">
          Generated {m.generated_at} by{" "}
          <code className="font-mono">{m.generated_by}</code>
        </p>
        <Disclaimer />
      </footer>
    </div>
  );
}
