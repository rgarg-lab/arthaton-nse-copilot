import { getMetrics } from "@/lib/ml/client";
import { percent, probability } from "@/components/finance/format";

/**
 * The self-aware chat context (§8's third cheap add).
 *
 * The assistant is given its own measured track record **before** the first model call,
 * not just the ability to fetch it. That distinction is the whole feature:
 *
 * - With only the `get_model_metrics` tool, the agent has to *decide* to check its own
 *   accuracy. Asked "is Reliance going up tomorrow?" it will usually not bother, and will
 *   answer in the confident register a language model defaults to.
 * - With the numbers already in the system prompt, the honest framing is the cheapest
 *   path. "My measured accuracy on this is 51.4%" is right there; inventing a confident
 *   answer takes more work than giving the real one.
 *
 * It is a small, fixed block — a dozen numbers, not the whole artifact. The tool still
 * exists for the detail (per-year, per-regime, baselines, limitations), and the prompt
 * tells the model to use it.
 *
 * ## It must never fabricate
 *
 * If the ML service is unreachable, this returns a block that says so and *instructs the
 * model to say it cannot give a signal*. It does not fall back to remembered numbers, and
 * it does not quietly omit the section — an omitted section is how the model ends up back
 * in its default confident register with nothing to anchor it.
 */

export type MetricsContext = {
  available: boolean;
  /** Pre-rendered for the system prompt. Never empty. */
  block: string;
};

const UNAVAILABLE_BLOCK = [
  "MEASURED TRACK RECORD: UNAVAILABLE",
  "The model service is not reachable from this process, so you have no measured numbers",
  "and no access to a signal this turn.",
  "- Tell the user plainly that the model service is down and that you therefore cannot",
  "  give a direction, a probability or an accuracy figure.",
  "- Do NOT estimate any of those from memory. You do not know them. An invented number",
  "  here would be indistinguishable from a real one to the user, which is the single",
  "  failure this product exists to avoid.",
  "- You can still answer general questions about markets, about how the model works, and",
  "  about what it does not cover.",
].join("\n");

/**
 * Build the block. Called once per turn, before the loop starts.
 *
 * Cheap: the ML service caches `/metrics` keyed on the section, so this is one local HTTP
 * round trip against an in-memory dictionary.
 */
export async function metricsContext(): Promise<MetricsContext> {
  const result = await getMetrics();
  if (result.source === "unavailable") {
    return { available: false, block: UNAVAILABLE_BLOCK };
  }

  const m = result.data;
  const d = m.direction;
  const abst = m.abstention;
  const base = m.baselines;
  const reg = m.regression;
  const cal = m.calibration;
  const design = m.evaluation_design;

  if (!d || !abst) {
    return { available: false, block: UNAVAILABLE_BLOCK };
  }

  const lines: string[] = [
    "YOUR OWN MEASURED TRACK RECORD",
    "These figures come from ml/artifacts/metrics.json, produced by a purged walk-forward",
    "evaluation with a final holdout read exactly once. Quote them exactly. They are the",
    "answer to 'how accurate are you' — do not soften them and do not round them up.",
    "",
    `- Directional accuracy on the holdout: ${percent(d.accuracy, 2)} over ${d.n.toLocaleString("en-IN")} sessions.`,
    `- Balanced accuracy: ${percent(d.balanced_accuracy, 2)}. AUC: ${d.auc?.toFixed(4) ?? "n/a"}.`,
    `- Brier score: ${d.brier?.toFixed(4) ?? "n/a"} (0.25 is a coin flip; lower is better).`,
  ];

  if (base) {
    lines.push(
      `- Always-predict-up baseline: ${percent(base.always_up.accuracy, 2)}. ` +
        `Previous-day-sign: ${percent(base.previous_day_sign.accuracy, 2)}. ` +
        `Three-feature logistic regression: ${percent(base.logistic_3_feature.accuracy, 2)}.`,
      "  Your edge over these is small. Say so when it is relevant.",
    );
  }

  lines.push(
    `- Abstention threshold: ${probability(abst.threshold)} conviction, frozen before the holdout was read.`,
    `- You call about ${percent(abst.coverage, 0)} of sessions. On those you are ${percent(abst.accuracy_when_signalling, 2)} accurate,` +
      ` against ${percent(abst.accuracy_on_all_rows, 2)} if you called everything.`,
    "  That gap is the entire value of abstaining. Use it to explain a refusal.",
  );

  if (reg?.r2 !== null && reg?.r2 !== undefined) {
    lines.push(
      `- Return-magnitude R²: ${reg.r2.toFixed(4)} — approximately zero. You cannot predict the size`,
      "  of a move. Any range you report is volatility-implied, not a confidence interval.",
    );
  }

  if (cal?.expected_calibration_error !== null && cal?.expected_calibration_error !== undefined) {
    lines.push(
      `- Expected calibration error: ${percent(cal.expected_calibration_error, 2)}. Your probabilities are`,
      "  calibrated, which is why you may state one as a probability at all.",
    );
  }

  const perRegime = m.breakdowns?.per_vix_regime ?? [];
  if (perRegime.length > 0) {
    const parts = perRegime
      .filter((r) => r.regime !== "unknown")
      .map((r) => `${r.regime} ${percent(r.accuracy as number, 1)} (n=${r.n})`);
    if (parts.length > 0) {
      lines.push(
        `- Accuracy by volatility regime: ${parts.join(", ")}.`,
        "  Cite the regime figure for today when you explain an abstention.",
      );
    }
  }

  if (design?.holdout_range) {
    lines.push(
      `- Holdout window: ${design.holdout_range[0]} to ${design.holdout_range[1]}, never used for tuning.`,
    );
  }

  if (m.headline_authoritative === false) {
    lines.push(
      "",
      "WARNING: this metrics file is marked as a non-authoritative smoke run. Say so if you",
      "quote it.",
    );
  }

  lines.push(
    "",
    "Call get_model_metrics for anything beyond the above — per-year accuracy, the",
    "confusion matrix, the paper-trading figures, or the known limitations list.",
  );

  return { available: true, block: lines.join("\n") };
}

/**
 * The user's stated preferences, as an instruction block.
 *
 * The risk profile is a *display* setting — it cannot change what the model predicts (see
 * `effectiveThreshold`). But the horizon field would be a dead control if the assistant
 * never acted on it, and the form tells the user it is "recorded so the assistant can tell
 * you it is outside what has been measured". That sentence has to be true, so this is what
 * makes it true.
 */
export function riskProfileBlock(profile: {
  horizonSessions: number;
  riskTolerance: string;
  minProbability: number;
}): string {
  const lines = [
    "THIS USER'S STATED PREFERENCES",
    `- Risk tolerance: ${profile.riskTolerance}.`,
    `- They only want to see calls at or above ${percent(profile.minProbability, 0)} conviction.`,
  ];

  if (profile.horizonSessions > 1) {
    lines.push(
      `- They have set a horizon of ${profile.horizonSessions} sessions. **You predict one`,
      "  session ahead and nothing else.** If they ask about that longer horizon, say plainly",
      "  that it is outside what this model has been measured on — do not extrapolate the",
      "  one-session probability across several sessions, and do not answer as though the",
      "  measurement covered it. Nothing in metrics.json speaks to a multi-session horizon.",
    );
  } else {
    lines.push("- Horizon: 1 session, which is exactly what you predict.");
  }

  lines.push(
    "",
    "These are display preferences. They do not change the model's output, and you must not",
    "describe them as if they did.",
  );
  return lines.join("\n");
}

/**
 * The system prompt for a turn: the configured prompt, the measured record, and the user's
 * preferences when the caller knows them.
 *
 * Appended rather than prepended, so the behavioural rules in `idea.config.ts` stay at the
 * top where they are least likely to be lost in a long context.
 *
 * `profile` is optional, and that is deliberate: `runAgent` is called directly by the eval
 * runner and the unit tests, which have no user and no database. Making it required would
 * mean either a fake profile in every test or a second code path through the loop.
 */
export async function systemPromptWithMetrics(
  basePrompt: string,
  profile?: { horizonSessions: number; riskTolerance: string; minProbability: number },
): Promise<string> {
  const ctx = await metricsContext();
  const rule = "─".repeat(60);
  const parts = [basePrompt, rule, ctx.block];
  if (profile) parts.push(rule, riskProfileBlock(profile));
  return parts.join("\n\n");
}
