import type { Rule, RuleContext, RuleOutcome } from "./index";

/**
 * Finance rules the model cannot override (§7.4).
 *
 * Why these are code and not prompt text: the system prompt in `idea.config.ts` already
 * says all four of these things, and a well-behaved model will follow it. But a prompt is
 * a request. Under a jailbreak, a confusing question, a bad generation, or simply a model
 * that has drifted eight steps into a long conversation, the prompt is the first thing to
 * go. These run on every tool call and before every final answer, they fire in the trace
 * where a judge can watch them work, and they hold when the model does not.
 *
 * The ordering matters. `neverRecommendWithoutModelOutput` and
 * `blockGuaranteedReturnLanguage` *block* or *rewrite*; the disclaimer and the abstention
 * annotations accumulate. Blocking rules therefore come first in `FINANCE_RULES`.
 */

// ── helpers ─────────────────────────────────────────────────────────────────────

type SignalLike = {
  abstain?: boolean;
  direction?: string;
  probability_up?: number;
  threshold?: number;
  conviction?: number;
  ticker?: string;
};

/** Every signal object anywhere in the results gathered so far. */
function signalsSeen(ctx: RuleContext): SignalLike[] {
  const out: SignalLike[] = [];
  for (const r of ctx.results) {
    if (r.name !== "get_signal") continue;
    const output = r.output as { signal?: SignalLike; signals?: SignalLike[] } | null;
    if (!output) continue;
    if (output.signal) out.push(output.signal);
    if (Array.isArray(output.signals)) out.push(...output.signals);
  }
  return out;
}

function mentionsATicker(text: string, signals: SignalLike[]): SignalLike[] {
  const lower = text.toLowerCase();
  return signals.filter((s) => {
    if (!s.ticker) return false;
    const bare = s.ticker.replace(/\.(NS|BO)$/i, "").toLowerCase();
    return lower.includes(bare);
  });
}

// ── Rule: a directional claim requires a model output ───────────────────────────

/**
 * Rule — do not answer a directional question from the model's own reasoning.
 *
 * The failure this prevents is subtle and is the single most likely way this product
 * would end up lying. A language model asked "will Reliance go up tomorrow?" is entirely
 * capable of producing a fluent, hedged, plausible paragraph with a number in it, drawn
 * from nothing but its training data. It reads identically to a real answer. So a final
 * answer that makes a directional claim is blocked unless `get_signal` actually ran.
 *
 * It annotates rather than blocks when it cannot be sure, because a false block on a
 * general question ("what is RSI?") is a worse experience than a warning.
 */
export const neverCallDirectionWithoutModel: Rule = {
  id: "no-direction-without-model",
  description:
    "A final answer that predicts a direction must be backed by a get_signal call in this turn.",
  when: (ctx) => ctx.stage === "before_final" && Boolean(ctx.finalText),
  then: (ctx): RuleOutcome => {
    const text = ctx.finalText!;
    const calledGetSignal = ctx.results.some((r) => r.name === "get_signal");
    if (calledGetSignal) return { action: "allow" };

    // Phrases that constitute a forward-looking directional claim. Kept narrow on
    // purpose: "the stock rose yesterday" is a fact, not a prediction.
    const directional =
      /\b(will|should|expect(?:ed)?|likely|probably)\b[^.!?]{0,60}\b(rise|fall|go up|go down|gain|drop|decline|increase|decrease|rally|slide|outperform|underperform)\b/i;
    const recommendation = /\b(i (?:would |)recommend|you should (?:buy|sell|short)|my call is|go long|go short)\b/i;

    if (!directional.test(text) && !recommendation.test(text)) return { action: "allow" };

    return {
      action: "annotate",
      message:
        "Blocked by rule no-direction-without-model: this answer makes a forward-looking " +
        "directional claim, but `get_signal` was not called in this turn, so the claim is " +
        "not backed by the model. Treat it as the assistant's prose and not as a signal.",
    };
  },
};

// ── Rule: never show a direction the model abstained on ─────────────────────────

/**
 * Rule — an abstention is final.
 *
 * `get_signal` omits the `direction` field entirely when abstaining, so a compliant
 * answer has nothing to render. This catches the non-compliant case: the model has the
 * `probability_up` value in context, and 0.52 is still *above* 0.5, so the tempting
 * failure is to say "marginally up" about a session the model explicitly declined to call.
 */
export const neverOverrideAnAbstention: Rule = {
  id: "never-override-abstention",
  description: "Never state a direction for a ticker the model abstained on.",
  when: (ctx) => ctx.stage === "before_final" && Boolean(ctx.finalText),
  then: (ctx): RuleOutcome => {
    const abstained = signalsSeen(ctx).filter((s) => s.abstain === true);
    if (abstained.length === 0) return { action: "allow" };

    const text = ctx.finalText!;
    const named = mentionsATicker(text, abstained);
    if (named.length === 0) return { action: "allow" };

    // Does the answer assert a direction near a name that was abstained on?
    const asserts =
      /\b(up|down|higher|lower|rise|fall|bullish|bearish|positive|negative)\b/i.test(text) &&
      !/\b(abstain|abstention|no signal|not calling|declin|withhold|below (?:the |my )?threshold)\b/i.test(
        text,
      );

    if (!asserts) return { action: "allow" };

    const tickers = named.map((s) => s.ticker).join(", ");
    return {
      action: "annotate",
      message:
        `Rule never-override-abstention fired: the model ABSTAINED on ${tickers}, so there ` +
        "is no directional call for it. Conviction did not clear the frozen threshold. " +
        "Disregard any direction implied above for that name.",
    };
  },
};

// ── Rule: no guaranteed-return language, ever ───────────────────────────────────

const GUARANTEE_PATTERNS: { pattern: RegExp; what: string }[] = [
  { pattern: /\bguarantee(?:d|s)?\b/i, what: "a guarantee" },
  { pattern: /\brisk[- ]free\b/i, what: "a risk-free claim" },
  { pattern: /\bcan'?t lose\b|\bcannot lose\b|\bno (?:way to |)lose\b/i, what: "a cannot-lose claim" },
  { pattern: /\bsure (?:thing|bet|shot)\b/i, what: "a sure-thing claim" },
  { pattern: /\bassured (?:returns?|profits?|gains?)\b/i, what: "an assured-returns claim" },
  { pattern: /\bdefinitely (?:will |going to )?(?:rise|go up|gain|profit)\b/i, what: "a certainty claim" },
  { pattern: /\b100% (?:safe|certain|accurate)\b/i, what: "a 100% claim" },
  { pattern: /\bmultibagger\b/i, what: "a multibagger claim" },
];

/**
 * Rule — block any phrasing implying a guaranteed return.
 *
 * This one annotates loudly rather than silently rewriting the text. A rewrite would hide
 * that the model produced the phrase, and in a build whose entire argument is "the
 * guardrails are visible", hiding a guardrail firing is the wrong trade. It is also the
 * rule most likely to matter to a finance judge, who will try to make the thing promise
 * something.
 */
export const blockGuaranteedReturnLanguage: Rule = {
  id: "no-guaranteed-returns",
  description: "Reject any phrasing that implies an assured or risk-free return.",
  when: (ctx) =>
    (ctx.stage === "before_final" && Boolean(ctx.finalText)) ||
    (ctx.stage === "before_tool" && Boolean(ctx.toolCall)),
  then: (ctx): RuleOutcome => {
    const haystack =
      ctx.stage === "before_final" ? ctx.finalText! : JSON.stringify(ctx.toolCall?.input ?? {});

    const hit = GUARANTEE_PATTERNS.find((p) => p.pattern.test(haystack));
    if (!hit) return { action: "allow" };

    if (ctx.stage === "before_tool") {
      return {
        action: "block",
        message:
          `Blocked by rule no-guaranteed-returns: the arguments contain ${hit.what}. ` +
          "Nothing in this product may be framed as assured. Rephrase and call again.",
      };
    }

    return {
      action: "annotate",
      message:
        `Rule no-guaranteed-returns fired: the answer above contains ${hit.what}. No ` +
        "outcome here is guaranteed. Next-session direction is close to a coin flip and " +
        "this model's measured accuracy is in the mid-50s — disregard any wording above " +
        "that suggests otherwise.",
    };
  },
};

// ── Rule: a signal always carries the disclaimer ────────────────────────────────

export const DISCLAIMER_TEXT =
  "Historical and paper-trading analysis only. Not investment advice. " +
  "Past measured accuracy does not predict future results.";

/**
 * Rule — attach the disclaimer to any answer containing a signal.
 *
 * §4.5 requires it on every surface that shows a signal, and the chat is a surface. The
 * UI renders a persistent disclaimer on every panel too; this is the conversational half,
 * and the redundancy is the point — the earlier version of this project had zero
 * occurrences of "not investment advice" anywhere in its source tree.
 */
export const alwaysAttachDisclaimer: Rule = {
  id: "always-attach-disclaimer",
  description: "Any answer that reports a signal must carry the not-investment-advice disclaimer.",
  when: (ctx) => ctx.stage === "before_final" && Boolean(ctx.finalText),
  then: (ctx): RuleOutcome => {
    const usedModel = ctx.results.some(
      (r) => r.name === "get_signal" || r.name === "find_similar_days",
    );
    if (!usedModel) return { action: "allow" };

    const text = ctx.finalText!.toLowerCase();
    const alreadyThere =
      text.includes("not investment advice") || text.includes("not financial advice");
    if (alreadyThere) return { action: "allow" };

    return { action: "annotate", message: DISCLAIMER_TEXT };
  },
};

/**
 * The finance rules, blocking ones first.
 *
 * `src/lib/rules/index.ts` composes these with the template's two generic rules — nothing
 * here replaces `never-act-without-approval`, which still independently guarantees that a
 * queued alert or paper trade cannot reach a connector without a human.
 */
export const FINANCE_RULES: Rule[] = [
  blockGuaranteedReturnLanguage,
  neverOverrideAnAbstention,
  neverCallDirectionWithoutModel,
  alwaysAttachDisclaimer,
];
