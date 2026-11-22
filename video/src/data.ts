/**
 * The only path from a committed artifact to a frame.
 *
 * **Every figure on screen is read from `ml/artifacts/*.json` through this file.
 * No statistic is typed into a scene.** This is the app's own rule
 * (`tests/honesty.test.ts`, BUILD_SPEC §4.2) extended to the video, and the video
 * is where it usually breaks, because people say "60% accurate" on camera.
 *
 * `src/honesty.test.ts` fails if a metric-shaped literal appears in `src/scenes/`
 * or `src/three/`. Changing a number in `metrics.json` changes the rendered frame.
 *
 * The imports are resolved when Remotion bundles, which happens once per render,
 * so a re-render always reflects the artifacts on disk.
 */
import workedExampleJson from "../analysis/worked_example.json";
import confidenceTiers from "../../ml/artifacts/confidence_tiers.json";
import latestSignals from "../../ml/artifacts/latest_signals.json";
import magnitude from "../../ml/artifacts/magnitude_metrics.json";
import metrics from "../../ml/artifacts/metrics.json";
import confirmation from "../../ml/experiments/results/confirmation.json";
import stage1 from "../../ml/experiments/results/stage1.json";
import stage2 from "../../ml/experiments/results/stage2.json";
import stage3 from "../../ml/experiments/results/stage3.json";
import stage4 from "../../ml/experiments/results/stage4.json";
import stage5 from "../../ml/experiments/results/stage5.json";

const pct = (x: number, dp = 2) => `${(x * 100).toFixed(dp)}%`;
const int = (n: number) => n.toLocaleString("en-IN");

/**
 * The two headline figures, and the labels that keep them apart.
 *
 * These must never be conflated (§6 of the brief). The move-size head has
 * **never read the final holdout** — `magnitude_metrics.json` carries a
 * `holdout_note` saying so, and MODEL_CARD §9.5 repeats it. Nothing here may
 * put it under a label implying otherwise, so the qualifier is part of the
 * datum rather than something a scene chooses.
 */
export const headline = {
  direction: {
    value: metrics.direction.accuracy,
    display: pct(metrics.direction.accuracy),
    /** Non-negotiable on-screen qualifier. */
    qualifier: "HOLDOUT · READ ONCE",
    basis: "final holdout",
    n: metrics.direction.n,
    nDisplay: int(metrics.direction.n),
    baseline: {
      label: "always-up, same split",
      value: metrics.baselines.always_up.accuracy,
      display: pct(metrics.baselines.always_up.accuracy),
    },
    window: metrics.evaluation_design.holdout_range as [string, string],
  },
  moveSize: {
    value: magnitude.summary.accuracy_when_calling_median,
    display: pct(magnitude.summary.accuracy_when_calling_median),
    /** Non-negotiable on-screen qualifier. Never "out of sample". */
    qualifier: "VALIDATION · ON THE SESSIONS IT CALLS",
    basis: "four walk-forward validation windows",
    baseline: {
      label: "base rate",
      value: magnitude.base_rate,
      display: pct(magnitude.base_rate),
    },
    rangeDisplay: `${pct(magnitude.summary.accuracy_when_calling_min)} – ${pct(
      magnitude.summary.accuracy_when_calling_max,
    )}`,
    coverageDisplay: `${pct(magnitude.summary.coverage_min, 0)} – ${pct(
      magnitude.summary.coverage_max,
      0,
    )}`,
    windowsAtOrAbove60: magnitude.summary.windows_at_or_above_60pct,
    windowsTotal: magnitude.summary.windows_total,
    neverReadHoldout: magnitude.holdout_note,
  },
} as const;

/** Abstention — the product. Threshold frozen before the holdout was read. */
export const abstention = {
  threshold: metrics.abstention.threshold,
  thresholdDisplay: pct(metrics.abstention.threshold, 0),
  coverage: metrics.abstention.coverage,
  coverageDisplay: pct(metrics.abstention.coverage, 1),
  declinedShareDisplay: pct(1 - metrics.abstention.coverage, 1),
  signals: metrics.abstention.signals_emitted,
  abstentions: metrics.abstention.abstentions,
  accuracyWhenSignalling: metrics.abstention.accuracy_when_signalling,
  accuracyWhenSignallingDisplay: pct(metrics.abstention.accuracy_when_signalling),
  accuracyOnAllRowsDisplay: pct(metrics.abstention.accuracy_on_all_rows),
  note: metrics.abstention.note,
  curve: metrics.abstention.coverage_accuracy_curve,
} as const;

/** The four baselines, on the identical split. Sorted worst to best. */
export const baselines = [
  {
    key: "previous_day_sign",
    label: "Previous-day sign",
    accuracy: metrics.baselines.previous_day_sign.accuracy,
    display: pct(metrics.baselines.previous_day_sign.accuracy),
  },
  {
    key: "logistic_3_feature",
    label: "Logistic, 3 features",
    accuracy: metrics.baselines.logistic_3_feature.accuracy,
    display: pct(metrics.baselines.logistic_3_feature.accuracy),
  },
  {
    key: "always_up",
    label: "Always predict up",
    accuracy: metrics.baselines.always_up.accuracy,
    display: pct(metrics.baselines.always_up.accuracy),
  },
  {
    key: "model",
    label: "This model",
    accuracy: metrics.direction.accuracy,
    display: pct(metrics.direction.accuracy),
    isModel: true,
  },
].sort((a, b) => a.accuracy - b.accuracy);

/**
 * Walk-forward geometry for the 3D timeline. Expanding train blocks, a five
 * session embargo, four validation folds, then the sealed holdout.
 */
export const walkForward = {
  folds: metrics.evaluation_design.walk_forward_folds.map((f, i) => ({
    index: i,
    key: f.fold,
    label: f.fold.replace(/^fold\d_val/, "val "),
    trainRows: f.train_rows,
    trainRowsDisplay: int(f.train_rows),
    valRows: f.val_rows,
    valRowsDisplay: int(f.val_rows),
    trainEnd: f.train_end,
    valStart: f.val_start,
    valEnd: f.val_end,
    embargo: f.embargoed_sessions,
    /** Train block length as a share of the largest, for 3D scaling. */
    trainShare:
      f.train_rows /
      Math.max(...metrics.evaluation_design.walk_forward_folds.map((x) => x.train_rows)),
  })),
  embargoSessions: metrics.evaluation_design.walk_forward_folds[0].embargoed_sessions,
  holdout: {
    start: metrics.evaluation_design.holdout_start,
    rows: metrics.evaluation_design.holdout_rows,
    rowsDisplay: int(metrics.evaluation_design.holdout_rows),
    range: metrics.evaluation_design.holdout_range as [string, string],
  },
  ledger: {
    totalReads: metrics.evaluation_design.holdout_ledger.total_reads,
    authoritativeReads: metrics.evaluation_design.holdout_ledger.authoritative_reads,
    smokeReads: metrics.evaluation_design.holdout_ledger.smoke_reads,
    contentHash: metrics.evaluation_design.holdout_ledger.this_read.holdout_content_hash,
    modelFingerprint: metrics.evaluation_design.holdout_ledger.this_read.model_fingerprint,
    readAt: metrics.evaluation_design.holdout_ledger.this_read.read_at,
  },
} as const;

/** Calibration ribbon geometry — populated bins only. */
export const calibration = {
  points: metrics.calibration.curve
    .filter(
      (b): b is typeof b & { mean_predicted: number; observed_up_rate: number } =>
        b.n > 0 && b.mean_predicted !== null && b.observed_up_rate !== null,
    )
    .map((b) => ({
      bin: b.bin,
      n: b.n,
      predicted: b.mean_predicted,
      observed: b.observed_up_rate,
    })),
  ece: metrics.calibration.expected_calibration_error,
  eceDisplay: pct(metrics.calibration.expected_calibration_error),
  maxCeDisplay: pct(metrics.calibration.max_calibration_error),
  populatedBins: metrics.calibration.populated_bins,
  method: metrics.calibration.method,
} as const;

/**
 * Confidence ladder — accuracy by conviction tier, with the reality check that
 * must travel with it. `confidence_tiers.json` states its own basis as
 * *validation*, and carries the holdout comparison precisely so the
 * validation-optimism tax is displayed wherever a tier figure is displayed.
 */
export const confidence = {
  basis: confidenceTiers.basis,
  source: confidenceTiers.source,
  gates: confidenceTiers.gates.map((g) => ({
    gate: g.gate,
    gateDisplay: pct(g.gate, 0),
    coverage: g.coverage,
    coverageDisplay: pct(g.coverage, 1),
    accuracy: g.accuracy,
    accuracyDisplay: pct(g.accuracy),
    n: g.n,
  })),
  realityCheck: {
    note: confidenceTiers.holdout_comparison.note,
    gate: confidenceTiers.holdout_comparison.gate,
    validationAccuracy: confidenceTiers.holdout_comparison.validation_accuracy,
    validationDisplay: pct(confidenceTiers.holdout_comparison.validation_accuracy),
    holdoutAccuracy: confidenceTiers.holdout_comparison.holdout_accuracy,
    holdoutDisplay: pct(confidenceTiers.holdout_comparison.holdout_accuracy),
    gapDisplay: `${(confidenceTiers.holdout_comparison.gap * 100).toFixed(2)} points`,
  },
} as const;

/**
 * The universe, and the honest gap in it.
 *
 * The spec fixes 18 tickers; the committed panel contains 17. `TATAMOTORS.NS`
 * stopped resolving on Yahoo after the demerger. The 3D universe grid renders
 * the missing node as missing rather than quietly drawing 17 and calling it 18.
 */
export const universe = {
  configured: latestSignals.universe_configured,
  present: latestSignals.universe_size,
  missing: latestSignals.universe_missing as string[],
  tickers: metrics.provenance.universe as string[],
  featureCount: metrics.provenance.feature_count,
  panelRows: metrics.provenance.panel_rows,
  panelRowsDisplay: int(metrics.provenance.panel_rows),
} as const;

/**
 * Today's board, from the frozen model.
 *
 * NOTE: `latest_signals.json` has **no move-size field**. The README's "move size
 * calls 9" is not sourceable from any committed artifact, so it is not on screen.
 * What is sourceable is the direction board below and the move-size head's
 * measured coverage band in `headline.moveSize.coverageDisplay`.
 */
export const board = {
  lastSession: latestSignals.data.last_session,
  asOf: latestSignals.data.as_of,
  sessionsBehind: latestSignals.data.sessions_behind,
  count: latestSignals.signals.length,
  signalsEmitted: latestSignals.summary.signals_emitted,
  abstained: latestSignals.summary.abstained,
  meanProbabilityUp: latestSignals.summary.mean_probability_up,
  threshold: latestSignals.model.threshold,
  signals: latestSignals.signals.map((s) => ({
    ticker: s.ticker,
    name: s.name,
    abstain: s.abstain,
    probabilityUp: s.probability_up,
    probabilityDisplay: s.probability_up.toFixed(3),
    conviction: s.conviction,
    regime: s.volatility_regime,
    reason: s.abstain_reason,
  })),
  /** One real abstention card, for the hero beat. */
  heroAbstention: (() => {
    const a = latestSignals.signals.find((s) => s.abstain);
    if (!a) throw new Error("no abstention in latest_signals.json");
    return {
      ticker: a.ticker,
      name: a.name,
      probabilityDisplay: a.probability_up.toFixed(3),
      thresholdDisplay: a.threshold.toFixed(2),
      reason: a.abstain_reason,
      session: a.as_of_session,
    };
  })(),
} as const;

/** Verbatim from the artifact, so the limitations travel with the numbers. */
export const limitations = metrics.known_limitations as string[];

export const disclaimer = latestSignals.disclaimer;

export const provenance = {
  generatedAt: metrics.generated_at,
  generatedBy: metrics.generated_by,
  headlineAuthoritative: metrics.headline_authoritative,
} as const;

/**
 * The published search for a higher number, and the thing it actually proved.
 *
 * The count is **computed** from the committed stage artifacts rather than typed:
 * MODEL_CARD §6 says "29 configurations", the committed files yield 28 distinct
 * names, and the file is the authority over the prose. The band shown on screen
 * is the measured spread, not a round number.
 *
 * The confirmation fold is the real evidence and it is what scene 6.2 renders:
 * the three configurations that looked best on the folds that selected them all
 * collapse into the same narrow band on a fold that did not — and ExtraTrees,
 * which beat the shipped model on validation, comes **last**. That rank reversal
 * is the difference between an effect and a search artefact.
 */
const searched = (() => {
  const seen = new Map<string, number>();
  for (const stage of [stage1, stage2, stage3, stage4, stage5]) {
    for (const r of stage as { name: string; accuracy: number }[]) {
      if (!seen.has(r.name)) seen.set(r.name, r.accuracy);
    }
  }
  return seen;
})();

export const experiments = {
  configurationsSearched: searched.size,
  selection: {
    minDisplay: pct(Math.min(...searched.values())),
    maxDisplay: pct(Math.max(...searched.values())),
    accuracies: [...searched.values()],
  },
  confirmation: (confirmation as { name: string; n: number; accuracy: number }[])
    .map((r) => ({
      name: r.name,
      short: r.name.replace(/\s*\(.*\)$/, ""),
      n: r.n,
      accuracy: r.accuracy,
      display: pct(r.accuracy),
    }))
    .sort((a, b) => b.accuracy - a.accuracy),
  confirmationBandDisplay: `${pct(
    Math.min(...(confirmation as { accuracy: number }[]).map((r) => r.accuracy)),
  )} – ${pct(
    Math.max(...(confirmation as { accuracy: number }[]).map((r) => r.accuracy)),
  )}`,
} as const;

/**
 * One real call, queried from the committed walk-forward predictions by
 * `scripts/build_example.py` — never authored.
 *
 * The film needed a concrete case and the honest way to get one is to search
 * the artifact rather than invent it. The script picks the largest correct move
 * among calls that cleared the frozen gate, and asserts all of that before
 * writing, so this cannot silently become a losing example.
 *
 * **It is validation data, not the holdout**, and `basisLabel` must be on
 * screen wherever the figures are.
 */
export const workedExample = {
  ...workedExampleJson,
  basisLabel: workedExampleJson.basis_label,
  dateDisplay: workedExampleJson.date_display,
  nextDateDisplay: workedExampleJson.next_date_display,
  convictionDisplay: workedExampleJson.conviction_display,
  gateDisplay: workedExampleJson.gate_display,
  closeBeforeDisplay: workedExampleJson.close_before_display,
  closeAfterDisplay: workedExampleJson.close_after_display,
  returnDisplay: workedExampleJson.actual_return_display,
  bin: workedExampleJson.calibration_bin,
} as const;

/** R-squared on return magnitude: approximately zero, and reported as such. */
export const magnitudeR2 = {
  value: metrics.regression.r2,
  display: metrics.regression.r2.toFixed(4),
  interpretation: metrics.regression.interpretation,
} as const;
