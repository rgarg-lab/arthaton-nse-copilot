import { z } from "zod";
import type { Tool } from "@/lib/agent/types";
import {
  findNeighbors,
  getMagnitude,
  getMetrics,
  getSignal,
  getSignals,
  toolUnavailable,
} from "@/lib/ml/client";

/**
 * The finance tools: thin typed clients over the ML service.
 *
 * "Thin" is the design. None of these computes anything — no probability, no accuracy, no
 * comparison, no round-trip cost. Python owns the maths and these three tools own the
 * plumbing, which is the split §5 asks for and the reason §4.2 can be guaranteed: there is
 * no arithmetic in TypeScript for a wrong number to come out of.
 *
 * There is no `explain_signal` tool, deliberately (§7.3). The explanation is the agent's
 * own answer, grounded by `get_signal` + `get_model_metrics` + `retrieval`. A tool that
 * returned prose would be a tool that generated a claim, and the whole point is that
 * claims come from artifacts.
 *
 * Each tool's `description` is written for the model: when to reach for it, and — more
 * importantly here — what it is forbidden to do with the result.
 */

// ── get_signal ──────────────────────────────────────────────────────────────────

const GetSignalInput = z.object({
  ticker: z
    .string()
    .min(1)
    .max(24)
    .optional()
    .describe(
      "An NSE ticker in the covered basket, e.g. RELIANCE.NS or INFY.NS. " +
        "Omit to get every name at once.",
    ),
});

export const getSignalTool: Tool<typeof GetSignalInput> = {
  name: "get_signal",
  description:
    "Get today's calibrated next-session direction call for one ticker, or for the whole " +
    "18-name basket if no ticker is given. Returns a calibrated probability, whether the " +
    "model is ABSTAINING, and a volatility-implied predicted range. " +
    "Call this before saying anything about what a stock might do next session. " +
    "If `abstain` is true there is no direction field and you must not supply one: say the " +
    "model is declining to call it today and give the reason in `abstain_reason`. Never " +
    "estimate a probability yourself and never describe the raw model output as a " +
    "confidence — only `probability_up` is calibrated.",
  inputSchema: GetSignalInput,

  async run(input) {
    if (input.ticker) {
      const result = await getSignal(input.ticker.toUpperCase());
      if (result.source === "unavailable") return toolUnavailable(result);
      const { signal, model, data } = result.data;
      return {
        ok: true,
        source: "service",
        signal,
        model,
        data,
        guidance: signal.abstain
          ? "The model is abstaining on this name. Report the abstention and the reason. " +
            "Do not infer a direction from the probability."
          : "Report the direction with its calibrated probability, and attach the disclaimer.",
      };
    }

    const result = await getSignals();
    if (result.source === "unavailable") return toolUnavailable(result);
    const payload = result.data;
    return {
      ok: true,
      source: "service",
      summary: payload.summary,
      model: payload.model,
      data: payload.data,
      universe_size: payload.universe_size,
      signals: payload.signals,
      guidance:
        `${payload.summary.abstained} of ${payload.signals.length} names are abstentions. ` +
        "Mention the abstention count — it is a feature of the product, not missing data.",
    };
  },
};

// ── get_model_metrics ───────────────────────────────────────────────────────────

const GetMetricsInput = z.object({
  section: z
    .enum([
      "direction",
      "regression",
      "calibration",
      "baselines",
      "breakdowns",
      "abstention",
      "paper_trading",
      "known_limitations",
      "provenance",
      "evaluation_design",
    ])
    .optional()
    .describe(
      "Which part of the measured record you need. Omit for everything, which is large — " +
        "prefer a section. Use `direction` for the headline accuracy and Brier score, " +
        "`baselines` to compare against always-up / momentum / logistic / buy-and-hold, " +
        "`breakdowns` for per-year and per-volatility-regime accuracy, `abstention` for the " +
        "coverage-vs-accuracy trade-off, `known_limitations` for what this model cannot do.",
    ),
});

export const getModelMetricsTool: Tool<typeof GetMetricsInput> = {
  name: "get_model_metrics",
  description:
    "Get this model's own measured track record, from the evaluation artifact. " +
    "Use it whenever the user asks how accurate you are, whether to trust a signal, how " +
    "you compare to a simple baseline, or when you are explaining why you abstained. " +
    "These are real out-of-sample numbers from a purged walk-forward evaluation with a " +
    "once-only final holdout — quote them exactly and never round them up. If the honest " +
    "answer is that accuracy is close to a coin flip, say so plainly: the measured number " +
    "is the product, not a weakness to manage.",
  inputSchema: GetMetricsInput,

  async run(input) {
    const result = await getMetrics(input.section);
    if (result.source === "unavailable") return toolUnavailable(result);

    // The service returns `{section, data}` for a section and the whole document otherwise.
    const payload = result.data as Record<string, unknown>;
    return {
      ok: true,
      source: "service",
      section: input.section ?? "all",
      metrics: input.section && "data" in payload ? payload.data : payload,
      guidance:
        "Every figure here was produced by ml/src/copilot/evaluate.py and is committed in " +
        "ml/artifacts/metrics.json. State them as measured values. Do not add a figure that " +
        "is not in this payload, and do not describe the model as 'highly accurate' — give " +
        "the number and let it speak.",
    };
  },
};

// ── find_similar_days ───────────────────────────────────────────────────────────

const FindSimilarInput = z.object({
  ticker: z.string().min(1).max(24).describe("An NSE ticker in the covered basket."),
  as_of: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("ISO date. Analogues are drawn strictly before it. Defaults to the latest session."),
  k: z
    .number()
    .int()
    .min(3)
    .max(100)
    .default(25)
    .describe("How many historical analogues to return."),
  same_ticker_only: z
    .boolean()
    .default(false)
    .describe(
      "Restrict analogues to this ticker's own history. Default false — the features are " +
        "scale-free, so pooling across the basket gives a far larger candidate pool.",
    ),
});

export const findSimilarDaysTool: Tool<typeof FindSimilarInput> = {
  name: "find_similar_days",
  description:
    "Find the historical sessions whose market state most resembles today's, and what " +
    "actually happened the session after each one. Use it to turn a prediction into " +
    "evidence the user can check, and especially when explaining an abstention — " +
    "'the 25 closest historical analogues split 13/12' is a concrete reason for low " +
    "conviction. Cite the actual dates. The empirical up-rate among k analogues is " +
    "evidence, not a probability: quote it alongside the calibrated probability from " +
    "`get_signal`, never instead of it.",
  inputSchema: FindSimilarInput,

  async run(input) {
    const result = await findNeighbors({
      ticker: input.ticker.toUpperCase(),
      as_of: input.as_of,
      k: input.k,
      same_ticker_only: input.same_ticker_only,
    });
    if (result.source === "unavailable") return toolUnavailable(result);

    const payload = result.data;
    if (payload.error) {
      return {
        ok: false,
        source: "service",
        error: payload.error,
        instruction:
          "There were not enough prior sessions to build the evidence set. Say so rather " +
          "than reasoning from a smaller sample than was asked for.",
      };
    }

    return {
      ok: true,
      source: "service",
      query: payload.query,
      empirical_up_rate: payload.empirical_up_rate,
      up_count: payload.up_count,
      down_count: payload.down_count,
      mean_next_return: payload.mean_next_return,
      median_next_return: payload.median_next_return,
      return_spread: payload.return_spread,
      candidate_pool: payload.candidate_pool,
      distinct_tickers: payload.distinct_tickers,
      // Trimmed: the model does not need 100 rows to make the point, and a long list
      // crowds out the rest of the context.
      neighbours: (payload.neighbours ?? []).slice(0, 12),
      neighbours_returned: payload.neighbours_found,
      feature_comparison: payload.feature_comparison,
      caveat: payload.caveat,
      guidance:
        "Name two or three of these dates explicitly. The point of this tool is that the " +
        "user can go and look the sessions up.",
    };
  },
};


// ── get_move_size ───────────────────────────────────────────────────────────────

const GetMoveSizeInput = z.object({
  ticker: z
    .string()
    .min(1)
    .max(24)
    .optional()
    .describe(
      "An NSE ticker in the covered basket, e.g. RELIANCE.NS. Omit for the whole basket.",
    ),
});

/**
 * The magnitude head, as a tool.
 *
 * Added because the assistant could discuss direction and had no way to mention the one
 * prediction this project makes that clears 60% — a user asking "is today a day to act"
 * was being answered entirely from a head that is close to a coin flip.
 *
 * The description carries the *comparison* deliberately — a model given two heads reaches
 * for whichever its prompt describes most confidently, and the honest ordering is that this
 * head is the better measured on this horizon. It carries no *figures*, and sends the model
 * to the `measured` block of the payload instead: a number written here cannot know what
 * the current artifact says, and the same drift argument is why `idea.config.ts` forbids
 * model statistics outright. (For a reader: as of writing, `magnitude_metrics.json` has a
 * median of 60.20% on called sessions against the direction model's 51.37% in
 * `metrics.json` — check both rather than trusting this sentence.)
 *
 * It must also not be allowed to blur the two — "likely to be a big move" is not a
 * direction, and a model that conflates them would be inventing a call neither head made.
 */
export const getMoveSizeTool: Tool<typeof GetMoveSizeInput> = {
  name: "get_move_size",
  description:
    "Get the magnitude call: is tomorrow likely to be a BIGGER or QUIETER move than usual " +
    "for this name? This is a separate and better-measured prediction than direction, and " +
    "it has a call on a far larger share of sessions. Its own accuracy figures come back in " +
    "the `measured` block of the response — quote those; do not state a figure from this " +
    "description, which cannot know what the current artifact says. " +
    "Reach for this whenever the user asks whether today is a day to act or wait, whether " +
    "anything is likely to happen, or about volatility — it answers those far better than " +
    "`get_signal` does, and it often has a call on a name where direction abstains. " +
    "It is NOT a direction: 'bigger than usual' says nothing about up or down, and you must " +
    "never present it as, or combine it into, a directional call. If `abstain` is true this " +
    "head has no call either and `expectation` is null. Use `get_signal` for direction and " +
    "report the two separately.",
  inputSchema: GetMoveSizeInput,

  async run(input) {
    const result = await getMagnitude(input.ticker?.toUpperCase());
    if (result.source === "unavailable") return toolUnavailable(result);
    const payload = result.data;
    return {
      ok: true,
      source: "service",
      threshold: payload.threshold,
      target: payload.target,
      measured: payload.measured,
      holdout_note: payload.holdout_note,
      signals: payload.signals,
      guidance:
        "Report `expectation` as a statement about move SIZE only, never direction. When " +
        "`abstain` is true say this head is also declining. The accuracy figures in " +
        "`measured` are a median and a range across four windows — quote the range, not " +
        "just the best window, and say it covers about 45% of sessions.",
    };
  },
};
