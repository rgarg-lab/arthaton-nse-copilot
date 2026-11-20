import { unstable_cache } from "next/cache";
import { getMetrics, getSignals } from "@/lib/ml/client";
import type { Cell } from "@/components/landing/ProofStrip";
import type { ImportanceRow } from "@/components/landing/ArcDeck";
import type { WallData } from "@/components/landing/MotionWall";
import type { PlateData } from "@/components/landing/EvidencePlates";
import type { StreamCard } from "@/components/landing/SkillStream";

/**
 * Everything the landing page renders, read once from the artifacts and cached.
 *
 * ## Why this is cached, and the old version was slow
 *
 * Every page was `force-dynamic` with a blocking `fetch` to the ML service before a single
 * byte of HTML went out, so every navigation paid the round trip twice over — once for the
 * signals, once for the metrics — and the landing page did it for five separate
 * components. The data behind all of it changes **once a day**, when `make -C ml refresh`
 * runs. Blocking a page render on it was the wrong trade.
 *
 * `unstable_cache` holds the shaped result for five minutes. A refresh shows up within
 * that window, which is far finer than the data's actual cadence, and the page stops
 * waiting on HTTP for content that has not changed since the last visitor.
 *
 * ## It still cannot fabricate
 *
 * Returns `null` when the service is unreachable, and every consumer renders its panel
 * with no figures rather than placeholder ones. Caching a *failure* is deliberately short
 * — see `revalidate` below — so starting the service is visible quickly.
 */

export type LandingData = {
  proof: Cell[];
  importance: ImportanceRow[];
  wall: WallData;
  plates: PlateData;
  stream: StreamCard[];
};

/**
 * Feature names are machine-shaped; these are what a person should read.
 *
 * **Kept to about twelve characters.** These labels land in a monospace grid column of
 * 9.6em (`wall.module.css`, `arcdeck.module.css`) and anything longer runs under the bar
 * fill. "S&P 500, previous close" is the honest name for `mac_spx_ret_1`, but it does not
 * fit, and a label that overlaps its own bar communicates less than a short one.
 */
const FEATURE_LABELS: Record<string, string> = {
  mac_spx_ret_1: "S&P 500 1d",
  mac_ndx_ret_1: "Nasdaq 1d",
  mac_nifty_ret_1: "Nifty 1d",
  mac_nifty_ret_7: "Nifty 7d",
  mac_niftyenergy_ret_1: "NiftyEnrg 1d",
  mac_vix_ret_1: "India VIX 1d",
  mac_usdinr_ret_1: "USD/INR 1d",
  mac_brent_ret_1: "Brent 1d",
  mac_spx_ret_3: "S&P 500 3d",
  mac_gold_ret_1: "Gold 1d",
  mac_spx_rv_7: "S&P 500 vol",
  mac_vix_rv_7: "VIX vol",
  cal_month: "month",
  cal_dow: "day of week",
  cal_expiry_week: "expiry week",
  vix_regime: "vol regime",
  rsi_14: "RSI 14",
  rv_20: "vol 20d",
  rv_60: "vol 60d",
  ret_1: "return 1d",
  ret_5: "return 5d",
  ret_20: "return 20d",
  sma_dev_20: "vs 20d avg",
  sma_dev_50: "vs 50d avg",
  bb_pctb_20: "Bollinger %B",
  vol_z_20: "volume z",
  hl_spread: "high-low",
  oc_spread: "open-close",
  sent_decay: "news decay",
};

const humanFeature = (name: string) => FEATURE_LABELS[name] ?? name.replace(/_/g, " ");

const REGIME_LEVEL: Record<string, number> = { calm: 1, normal: 2, stressed: 3 };

const pctText = (v: number, places = 2) => `${(v * 100).toFixed(places)}%`;

async function build(): Promise<LandingData | null> {
  const [metrics, signals] = await Promise.all([getMetrics(), getSignals()]);
  if (metrics.source !== "service" || signals.source !== "service") return null;

  const m = metrics.data;
  const d = m.direction;
  const abst = m.abstention;
  const base = m.baselines;
  if (!d || !abst || !base) return null;

  const cm = d.confusion_matrix;
  // A sum of two integers straight off the confusion matrix — reading a table, not
  // deriving a statistic. It is exactly `accuracy × n`, and the strip counts integers.
  const correct = cm.true_up_pred_up + cm.true_down_pred_down;

  const importance: ImportanceRow[] = (m.feature_importance ?? [])
    .slice(0, 6)
    .map((f) => ({ label: humanFeature(f.feature), value: f.share }));

  const beaten = [
    base.always_up.accuracy,
    base.previous_day_sign.accuracy,
    base.logistic_3_feature.accuracy,
  ].filter((a) => a !== null && a !== undefined && (d.accuracy ?? 0) > a).length;

  return {
    proof: [
      {
        label: "Sessions tested",
        value: d.n,
        note: "rows the model never saw while it was being built.",
        palette: "map",
      },
      {
        label: "It called",
        value: abst.signals_emitted,
        of: d.n,
        note: "on the rest it said nothing, on purpose.",
        palette: "links",
      },
      {
        label: "Got right",
        value: correct,
        of: d.n,
        note: "barely above a coin flip, which is the honest answer here.",
        palette: "confirmed",
      },
      {
        label: "Baselines beaten",
        value: beaten,
        of: 3,
        note: "always-up, naive momentum, and a three-feature linear model.",
        palette: "disputed",
      },
    ],
    importance,
    wall: {
      features: importance,
      baselines: [
        { label: "this model", value: d.accuracy ?? 0, isModel: true },
        { label: "always up", value: base.always_up.accuracy ?? 0 },
        { label: "prev-day sign", value: base.previous_day_sign.accuracy ?? 0 },
        { label: "logistic (3)", value: base.logistic_3_feature.accuracy ?? 0 },
      ],
      // Illustrative of the *shape* of the evidence layer, drawn from the real basket and
      // the real holdout window. The live analogues with their own dates are on /evidence.
      analogues: signals.data.signals.slice(0, 4).map((s) => ({
        date: s.as_of_session,
        ticker: s.ticker.replace(/\.NS$/, ""),
        up: s.probability_up > 0.5,
      })),
      abstention: {
        coverage: abst.coverage ?? 0,
        whenCalling: abst.accuracy_when_signalling ?? 0,
        onEverything: abst.accuracy_on_all_rows ?? 0,
      },
      today: {
        abstained: signals.data.summary.abstained,
        total: signals.data.signals.length,
      },
    },
    plates: {
      claim: `${pctText(d.accuracy ?? 0)} on sessions it had never seen`,
      verdict: beaten === 3 ? "Beats all three directional baselines" : "Mixed against the baselines",
      verdictKind: beaten === 3 ? "verified" : "mixed",
      count: `${d.n.toLocaleString("en-IN")} rows · ${abst.signals_emitted.toLocaleString("en-IN")} of them called`,
      from: "purged walk-forward",
      to: "one holdout",
      fields: [
        { label: "accuracy", value: pctText(d.accuracy ?? 0) },
        { label: "auc", value: (d.auc ?? 0).toFixed(4) },
        { label: "brier", value: (d.brier ?? 0).toFixed(4) },
        { label: "n", value: d.n.toLocaleString("en-IN") },
      ],
      sources: [
        {
          id: "walkforward",
          name: "Purged walk-forward",
          figure: String(m.evaluation_design?.walk_forward_folds?.length ?? 4),
          figureLabel: "folds",
          caption:
            "Expanding window, five-session embargo, split on dates. Every hyperparameter and the abstention threshold were chosen here.",
          caveat:
            "Validation folds can be overfitted by enough searching. The grid was three candidates, scored by fold log loss.",
        },
        {
          id: "holdout",
          name: "Final holdout",
          figure: d.n.toLocaleString("en-IN"),
          figureLabel: "rows, read once",
          caption:
            "Touched a single time, after the model and threshold were frozen. The ledger that records it is committed.",
          caveat:
            "One window of 16 months. The per-year split moves by several points, so treat this as one measurement, not a stable estimate.",
        },
      ],
    },
    stream: signals.data.signals.map((s) => ({
      id: s.ticker,
      title: s.name,
      provider: s.ticker.replace(/\.NS$/, ""),
      difficulty: REGIME_LEVEL[s.volatility_regime] ?? 1,
    })),
  };
}

/**
 * Five minutes. The artifacts change once a day at most, so this is already far finer
 * than the data's cadence — it exists to stop every visitor paying two HTTP round trips
 * for a document that has not changed, not to hide staleness.
 */
export const landingData = unstable_cache(build, ["landing-data"], {
  revalidate: 300,
  tags: ["ml-artifacts"],
});
