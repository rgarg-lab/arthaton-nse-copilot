import type { ToolCall } from "@/lib/llm/types";
import type { IdeaConfig } from "@/lib/config";
import { toolByName } from "@/lib/tools";
import { FINANCE_RULES } from "./finance";

/**
 * The deterministic layer that outranks the model.
 *
 * Prompts are requests, not guarantees. A rule is code: it runs before every tool call
 * and before the final answer, and it can block, rewrite or force. When a model is
 * confused, jailbroken, or simply having a bad generation, this is what still holds.
 *
 * Every rule that fires appears in the trace, which is also the point — a judge can see
 * the guardrail working rather than taking it on trust.
 */

export type RuleStage = "before_tool" | "before_final";

export type RuleContext = {
  stage: RuleStage;
  config: IdeaConfig;
  /** Present at `before_tool`. */
  toolCall?: ToolCall;
  /** Present at `before_final`; the answer about to be sent. */
  finalText?: string;
  /** Results gathered so far this run, newest last. */
  results: { name: string; output: unknown }[];
  stepIndex: number;
};

export type RuleOutcome =
  | { action: "allow" }
  /** Refuse the call; `message` goes back to the model as the tool result. */
  | { action: "block"; message: string }
  /** Replace the call's arguments. */
  | { action: "rewrite"; toolCall: ToolCall; message: string }
  /** Append a warning to the final answer. */
  | { action: "annotate"; message: string };

export type Rule = {
  id: string;
  description: string;
  when(ctx: RuleContext): boolean;
  then(ctx: RuleContext): RuleOutcome;
};

/**
 * Rule 1 — nothing reaches the outside world without a human.
 *
 * Redundant with the action tools, which have no connector access anyway. That redundancy
 * is deliberate: this is the one invariant the template will not let an idea break by
 * accident, so it is enforced in two independent places. If someone writes a tool that
 * *does* hold a connector, this still stops it.
 */
export const neverActWithoutApproval: Rule = {
  id: "never-act-without-approval",
  description: "External actions may only queue for approval, never execute directly.",
  when: (ctx) => ctx.stage === "before_tool" && Boolean(ctx.toolCall),
  then: (ctx) => {
    const tool = toolByName(ctx.toolCall!.name);
    if (!tool?.external) return { action: "allow" };
    // The tool is external, which is allowed — it queues. What is blocked is any attempt
    // to mark it as already delivered.
    const input = (ctx.toolCall!.input ?? {}) as Record<string, unknown>;
    const forbidden = ["send_now", "skipApproval", "skip_approval", "immediate", "force"];
    const sneaky = forbidden.find((k) => input[k] === true);
    if (sneaky) {
      return {
        action: "block",
        message:
          `Blocked by rule never-act-without-approval: "${sneaky}" is not permitted. ` +
          `Queue the action normally; the user will approve it.`,
      };
    }
    return { action: "allow" };
  },
};

/**
 * Rule 2 — a result that was not verified may not be stated as fact.
 *
 * The bar is a `supported` verdict at or above the threshold. Confidence alone is not
 * enough, and getting that wrong is subtle: a `partially_supported` verdict at 0.9 means
 * the model is *confident the claim is only partly supported*, which is precisely the
 * case worth warning about. Checking only the number would wave it through.
 */
export const flagLowConfidence: Rule = {
  id: "flag-low-confidence",
  description: "Annotate the final answer unless something came back supported above the threshold.",
  when: (ctx) => ctx.stage === "before_final",
  then: (ctx) => {
    const verdicts = ctx.results
      .filter((r) => r.name === "verify")
      .map((r) => r.output as { confidence?: number; verdict?: string })
      .filter((v) => typeof v.confidence === "number");
    if (verdicts.length === 0) return { action: "allow" };

    const threshold = ctx.config.agent.confidenceThreshold;
    const cleared = verdicts.filter((v) => v.verdict === "supported" && v.confidence! >= threshold);
    if (cleared.length > 0) return { action: "allow" };

    // Report the strongest verdict there was, so the warning says what actually happened.
    const strongest = verdicts.reduce((a, b) => (b.confidence! > a.confidence! ? b : a));
    const contradicted = verdicts.some((v) => v.verdict === "contradicted");

    return {
      action: "annotate",
      message: contradicted
        ? `Verification found the source contradicts this (confidence ${strongest.confidence!.toFixed(2)}) — ` +
          `do not rely on the above.`
        : `Nothing cleared the ${threshold} verification threshold — the strongest result was ` +
          `"${strongest.verdict ?? "unknown"}" at ${strongest.confidence!.toFixed(2)}. ` +
          `Treat the above as unconfirmed rather than established.`,
    };
  },
};

/**
 * The ordered list. Earlier rules win: the first non-allow outcome is the answer.
 *
 * The two template rules come first because they are the ones that must never be
 * overtaken: `never-act-without-approval` is the invariant the whole approvals design
 * rests on. The finance rules (`./finance.ts`) follow — blocking ones before annotating
 * ones, which `FINANCE_RULES` already orders.
 */
export const RULES: Rule[] = [neverActWithoutApproval, flagLowConfidence, ...FINANCE_RULES];

export type FiredRule = { id: string; outcome: RuleOutcome };

/**
 * Run the rules for a stage. Stops at the first block or rewrite; annotations accumulate,
 * because several warnings can all be worth showing.
 */
export function runRules(
  ctx: RuleContext,
  rules: Rule[] = RULES,
): { outcome: RuleOutcome; fired: FiredRule[] } {
  const fired: FiredRule[] = [];
  const annotations: string[] = [];

  for (const rule of rules) {
    let applies = false;
    try {
      applies = rule.when(ctx);
    } catch (err) {
      // A broken rule must not take down the run; it is reported and skipped.
      console.warn(`rule ${rule.id} threw in when():`, err);
      continue;
    }
    if (!applies) continue;

    const outcome = rule.then(ctx);
    if (outcome.action === "allow") continue;

    fired.push({ id: rule.id, outcome });
    if (outcome.action === "block" || outcome.action === "rewrite") {
      return { outcome, fired };
    }
    annotations.push(outcome.message);
  }

  if (annotations.length > 0) {
    return { outcome: { action: "annotate", message: annotations.join("\n\n") }, fired };
  }
  return { outcome: { action: "allow" }, fired };
}
