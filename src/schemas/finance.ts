import { z } from "zod";

/**
 * The contract between the Python service and the app.
 *
 * These schemas are deliberately **permissive about extra fields and strict about the
 * ones the UI renders**. The ML service owns the shape of its own payloads and will grow
 * fields (`metrics.json` gained a paper-trading block mid-build); a schema that rejected
 * unknown keys would turn every additive change on the Python side into a TypeScript
 * failure, and the pressure that creates is to loosen the typing everywhere rather than
 * fix it in one place.
 *
 * What they *do* guarantee is that a field the UI puts on screen either arrived with the
 * right type or is absent — and absent renders an `EmptyState`, never a zero. A `0.0`
 * where a probability should be is the most dangerous possible default in this product.
 */

// ── signals ─────────────────────────────────────────────────────────────────────

export const RawModelOutputSchema = z.object({
  value: z.number(),
  note: z.string(),
});

export const PredictedRangeSchema = z.object({
  centre: z.number(),
  low: z.number(),
  high: z.number(),
  /** Says in the payload that this is volatility-implied, not a confidence interval. */
  basis: z.string(),
});

export const SignalSchema = z.object({
  ticker: z.string(),
  name: z.string(),
  as_of_session: z.string(),
  predicts_session_after: z.string(),
  abstain: z.boolean(),
  probability_up: z.number().min(0).max(1),
  conviction: z.number(),
  threshold: z.number(),
  raw_model_output: RawModelOutputSchema.optional(),
  volatility_regime: z.string(),
  predicted_range: PredictedRangeSchema.optional(),
  latest_close: z.number().optional(),
  disclaimer: z.string(),
  /**
   * Present only when `abstain` is false. The service omits it entirely on an
   * abstention rather than sending a direction with a flag beside it — a client
   * cannot render a call it was never given, which is a stronger guarantee than
   * trusting every call site to check the flag first.
   */
  direction: z.enum(["up", "down"]).optional(),
  /** Present only when `abstain` is true. */
  abstain_reason: z.string().optional(),
});

export const SignalsPayloadSchema = z.object({
  generated_at: z.string(),
  generated_by: z.string(),
  disclaimer: z.string(),
  model: z.object({
    trained_at: z.string(),
    train_end: z.string(),
    train_rows: z.number(),
    threshold: z.number(),
    horizon_sessions: z.number(),
    calibration: z.string(),
  }),
  data: z.object({
    last_session: z.string(),
    as_of: z.string(),
    calendar_days_behind: z.number(),
    sessions_behind: z.number(),
  }),
  universe_size: z.number(),
  summary: z.object({
    signals_emitted: z.number(),
    abstained: z.number(),
    up_calls: z.number(),
    down_calls: z.number(),
    mean_probability_up: z.number(),
  }),
  signals: z.array(SignalSchema),
});

export const SingleSignalPayloadSchema = z.object({
  signal: SignalSchema,
  model: SignalsPayloadSchema.shape.model,
  data: SignalsPayloadSchema.shape.data,
  disclaimer: z.string(),
});

// ── metrics ─────────────────────────────────────────────────────────────────────

export const DirectionMetricsSchema = z.object({
  n: z.number(),
  accuracy: z.number().nullable(),
  balanced_accuracy: z.number().nullable(),
  auc: z.number().nullable(),
  brier: z.number().nullable(),
  log_loss: z.number().nullable(),
  base_rate_up: z.number().nullable(),
  predicted_up_share: z.number().nullable(),
  confusion_matrix: z.object({
    true_up_pred_up: z.number(),
    true_up_pred_down: z.number(),
    true_down_pred_up: z.number(),
    true_down_pred_down: z.number(),
  }),
  description: z.string().optional(),
});

export const BaselineSchema = DirectionMetricsSchema.partial().extend({
  description: z.string().optional(),
});

/**
 * One row of a per-slice breakdown: per year, per volatility regime, or per ticker.
 *
 * The three slices carry different label columns — `year`, `regime` + `vix_range`,
 * `ticker` — so each is optional and consumers read the one that applies to them. The
 * metrics, by contrast, are the same everywhere, and `accuracy`/`auc`/`brier` are nullable
 * because a slice can be too small to compute them.
 */
export const BreakdownRowSchema = z
  .object({
    n: z.number(),
    accuracy: z.number().nullable().optional(),
    auc: z.number().nullable().optional(),
    brier: z.number().nullable().optional(),
    year: z.union([z.number(), z.string()]).optional(),
    regime: z.string().optional(),
    regime_code: z.number().optional(),
    vix_range: z.string().optional(),
    ticker: z.string().optional(),
  })
  .loose();

export const CalibrationBinSchema = z.object({
  bin: z.number(),
  p_lower: z.number().nullable(),
  p_upper: z.number().nullable(),
  n: z.number(),
  mean_predicted: z.number().nullable(),
  observed_up_rate: z.number().nullable(),
});

export const CoveragePointSchema = z.object({
  threshold: z.number(),
  coverage: z.number(),
  signals: z.number(),
  accuracy: z.number().nullable(),
  up_share: z.number().nullable(),
});

export const MetricsPayloadSchema = z.object({
  generated_at: z.string(),
  generated_by: z.string(),
  headline_authoritative: z.boolean().optional(),
  headline_note: z.string().optional(),
  disclaimer: z.string(),
  provenance: z
    .object({
      note: z.string().optional(),
      panel_rows: z.number().optional(),
      universe: z.array(z.string()).optional(),
      universe_size: z.number().optional(),
      feature_count: z.number().optional(),
      selected_hyperparameters: z.record(z.string(), z.unknown()).optional(),
      model_trained_at: z.string().optional(),
      model_train_rows: z.number().optional(),
      model_train_end: z.string().optional(),
      horizon_sessions: z.number().optional(),
    })
    .optional(),
  evaluation_design: z
    .object({
      walk_forward_folds: z.array(z.record(z.string(), z.unknown())).optional(),
      holdout_start: z.string().optional(),
      holdout_rows: z.number().optional(),
      holdout_range: z.array(z.string()).optional(),
      holdout_ledger: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  direction: DirectionMetricsSchema.optional(),
  regression: z
    .object({
      n: z.number(),
      mae: z.number().nullable(),
      rmse: z.number().nullable(),
      r2: z.number().nullable(),
      mean_abs_actual_return: z.number().nullable(),
      interpretation: z.string().optional(),
    })
    .optional(),
  calibration: z
    .object({
      curve: z.array(CalibrationBinSchema),
      expected_calibration_error: z.number().nullable().optional(),
      max_calibration_error: z.number().nullable().optional(),
      populated_bins: z.number().optional(),
      method: z.string().optional(),
      validation_curve: z.array(CalibrationBinSchema).nullable().optional(),
    })
    .optional(),
  baselines: z
    .object({
      always_up: BaselineSchema,
      previous_day_sign: BaselineSchema,
      logistic_3_feature: BaselineSchema,
      buy_and_hold: z.record(z.string(), z.unknown()),
    })
    .optional(),
  /**
   * The per-slice breakdowns.
   *
   * Typed, rather than `z.record(z.string(), z.unknown())` as these were. The loose version
   * pushed the cost onto every consumer as an `as number` cast — three of them did it — and
   * `accuracy` is genuinely nullable in a slice with no rows, so those casts were asserting
   * something the data does not promise and would have put "NaN%" on the model card rather
   * than failing. `.loose()` keeps any extra columns the pipeline adds later.
   */
  breakdowns: z
    .object({
      per_year: z.array(BreakdownRowSchema),
      per_vix_regime: z.array(BreakdownRowSchema),
      per_ticker: z.array(BreakdownRowSchema),
    })
    .optional(),
  abstention: z
    .object({
      threshold: z.number(),
      note: z.string().optional(),
      coverage: z.number().nullable(),
      signals_emitted: z.number(),
      abstentions: z.number(),
      accuracy_when_signalling: z.number().nullable(),
      accuracy_on_all_rows: z.number().nullable(),
      accuracy_when_abstaining: z.number().nullable(),
      coverage_accuracy_curve: z.array(CoveragePointSchema),
    })
    .optional(),
  paper_trading: z
    .object({
      description: z.string(),
      sessions: z.number(),
      sessions_with_a_position: z.number(),
      mean_names_held: z.number().nullable(),
      scenarios: z.record(
        z.string(),
        z.object({
          round_trip_bps: z.number(),
          slippage_bps: z.number(),
          total_bps_per_round_trip: z.number(),
          total_return: z.number().nullable(),
          annualised_return: z.number().nullable(),
          sharpe: z.number().nullable(),
          max_drawdown: z.number().nullable(),
          win_rate: z.number().nullable(),
          is_default: z.boolean(),
        }),
      ),
      equity_curve: z.array(z.object({ date: z.string(), net_return: z.number().nullable() })),
    })
    .optional(),
  known_limitations: z.array(z.string()).optional(),
  /**
   * Merged in by the service from `feature_importance.json`. Gain-based importance off the
   * fitted booster — `share` is already normalised to sum to 1 by `train.py`, so nothing
   * downstream has to compute it.
   */
  feature_importance: z
    .array(z.object({ feature: z.string(), gain: z.number(), share: z.number() }))
    .optional(),
});

// ── neighbours ──────────────────────────────────────────────────────────────────

export const NeighborMatchSchema = z.object({
  date: z.string(),
  ticker: z.string(),
  distance: z.number(),
  next_session_return: z.number(),
  next_session_direction: z.enum(["up", "down"]),
});

export const NeighborsPayloadSchema = z.object({
  query: z
    .object({
      ticker: z.string(),
      name: z.string(),
      state_session: z.string(),
      as_of: z.string(),
    })
    .optional(),
  as_of: z.string().optional(),
  ticker: z.string().nullable().optional(),
  k_requested: z.number(),
  neighbours_found: z.number(),
  candidate_pool: z.number(),
  empirical_up_rate: z.number().optional(),
  up_count: z.number().optional(),
  down_count: z.number().optional(),
  mean_next_return: z.number().optional(),
  median_next_return: z.number().optional(),
  return_spread: z
    .object({ p10: z.number(), p90: z.number(), worst: z.number(), best: z.number() })
    .optional(),
  distinct_tickers: z.number().optional(),
  distance_space: z.array(z.string()).optional(),
  feature_comparison: z
    .array(
      z.object({
        feature: z.string(),
        label: z.string(),
        query_value: z.number(),
        neighbour_mean: z.number(),
        pool_mean: z.number(),
        z_distance: z.number(),
      }),
    )
    .optional(),
  neighbours: z.array(NeighborMatchSchema).optional(),
  caveat: z.string().optional(),
  error: z.string().optional(),
  disclaimer: z.string().optional(),
});

// ── app-owned records (Drizzle-backed, not from the ML service) ────────────────

export const WatchlistEntrySchema = z.object({
  ticker: z.string().min(1).max(24),
  note: z.string().max(500).optional(),
});

/**
 * The risk profile's bounds, in one place.
 *
 * Both the zod schema below and the slider in `WatchlistControls` read these, so the
 * validation range and the control's range cannot drift apart — a slider that offers a
 * value the schema then rejects is a form that fails on submit for no visible reason.
 *
 * `minProbabilityFloor` is a coin flip, not the model's threshold: the model's own frozen
 * gate is read at render time and clamps on top of this (see `effectiveThreshold`). This
 * is only the outer bound of what is *storable*.
 */
export const RISK_PROFILE_BOUNDS = {
  minProbabilityFloor: 0.5,
  minProbabilityCeiling: 0.95,
  /** Slider granularity. One percentage point; finer would imply precision the model has not got. */
  minProbabilityStep: 0.01,
  horizonFloor: 1,
  horizonCeiling: 20,
} as const;

export const RiskProfileSchema = z.object({
  /** How far ahead the user cares about. The model only predicts one session; a longer
   *  horizon is recorded so the assistant can say the model does not cover it. */
  horizonSessions: z
    .number()
    .int()
    .min(RISK_PROFILE_BOUNDS.horizonFloor)
    .max(RISK_PROFILE_BOUNDS.horizonCeiling)
    .default(1),
  riskTolerance: z.enum(["conservative", "balanced", "aggressive"]).default("balanced"),
  /**
   * A *display* threshold, at or above the model's own frozen one. It can make the user
   * see fewer signals; it can never make them see more. §6.5 freezes the model's
   * threshold, and a user-editable value that could lower it would reopen exactly the
   * dial that freeze exists to close.
   */
  minProbability: z
    .number()
    .min(RISK_PROFILE_BOUNDS.minProbabilityFloor)
    .max(RISK_PROFILE_BOUNDS.minProbabilityCeiling)
    .default(RISK_PROFILE_BOUNDS.minProbabilityFloor),
});

export type Signal = z.infer<typeof SignalSchema>;
export type SignalsPayload = z.infer<typeof SignalsPayloadSchema>;
export type SingleSignalPayload = z.infer<typeof SingleSignalPayloadSchema>;
export type MetricsPayload = z.infer<typeof MetricsPayloadSchema>;
export type NeighborsPayload = z.infer<typeof NeighborsPayloadSchema>;
export type NeighborMatch = z.infer<typeof NeighborMatchSchema>;
export type CalibrationBin = z.infer<typeof CalibrationBinSchema>;
export type CoveragePoint = z.infer<typeof CoveragePointSchema>;
export type PaperTrading = NonNullable<z.infer<typeof MetricsPayloadSchema>["paper_trading"]>;
export type CostScenario = PaperTrading["scenarios"][string];
export type RiskProfile = z.infer<typeof RiskProfileSchema>;
export type WatchlistEntry = z.infer<typeof WatchlistEntrySchema>;

/**
 * The magnitude head: will tomorrow be a big move?
 *
 * A second, independent prediction beside the direction call. Direction on this horizon is
 * close to a martingale — 51.37% on the holdout — while volatility clusters, so this head
 * reaches a median of 60.2% on the sessions it calls while covering ~45% of them.
 *
 * `expectation` is `null` exactly when `abstain` is true, mirroring how the direction
 * payload omits `direction` when it declines: a client cannot render a call it was never
 * given.
 */
export const MagnitudeSignalSchema = z.object({
  ticker: z.string(),
  as_of_session: z.string(),
  probability_big_move: z.number(),
  expectation: z.string().nullable(),
  abstain: z.boolean(),
  threshold: z.number(),
  typical_move_abs: z.number().optional(),
});

export const MagnitudePayloadSchema = z.object({
  generated_by: z.string().optional(),
  target: z.string().optional(),
  threshold: z.number(),
  measured: z
    .object({
      accuracy_when_calling_median: z.number(),
      accuracy_when_calling_min: z.number(),
      accuracy_when_calling_max: z.number(),
      windows_at_or_above_60pct: z.number(),
      windows_total: z.number(),
      coverage_min: z.number(),
      coverage_max: z.number(),
      full_coverage_accuracy_median: z.number(),
      base_rate: z.number(),
    })
    .optional(),
  holdout_note: z.string().optional(),
  signals: z.array(MagnitudeSignalSchema),
  disclaimer: z.string().optional(),
});

export type MagnitudeSignal = z.infer<typeof MagnitudeSignalSchema>;
export type MagnitudePayload = z.infer<typeof MagnitudePayloadSchema>;


/**
 * Accuracy by conviction tier, from the out-of-fold walk-forward predictions.
 *
 * `holdout_comparison` is not optional in spirit: the tiers are validation figures and run
 * several points above what the final holdout recorded at the same gate, so a surface that
 * renders a tier without that comparison is misreporting. The producer writes it into the
 * artifact so no consumer has to remember.
 */
export const ConfidenceBandSchema = z.object({
  from: z.number(),
  to: z.number().nullable(),
  label: z.string(),
  description: z.string(),
  calls: z.boolean(),
  coverage: z.number(),
  n: z.number(),
  accuracy: z.number().nullable(),
  note: z.string().nullable().optional(),
});

export const ConfidencePayloadSchema = z.object({
  basis: z.string().optional(),
  source: z.string().optional(),
  threshold: z.number(),
  gates: z.array(
    z.object({
      gate: z.number(),
      coverage: z.number(),
      n: z.number(),
      accuracy: z.number(),
      per_fold_min: z.number().nullable().optional(),
      per_fold_max: z.number().nullable().optional(),
    }),
  ),
  bands: z.array(ConfidenceBandSchema),
  holdout_comparison: z
    .object({
      note: z.string().optional(),
      gate: z.number(),
      validation_accuracy: z.number().nullable(),
      validation_coverage: z.number().nullable(),
      holdout_accuracy: z.number(),
      holdout_coverage: z.number(),
      gap: z.number().nullable(),
      full_coverage_holdout_accuracy: z.number().nullable(),
    })
    .optional(),
  disclaimer: z.string().optional(),
});

export type ConfidenceBand = z.infer<typeof ConfidenceBandSchema>;
export type ConfidencePayload = z.infer<typeof ConfidencePayloadSchema>;
