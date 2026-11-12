import { z } from "zod";
import { generate } from "@/lib/llm/router";
import type { Tool } from "@/lib/agent/types";

/**
 * The second pass: does this claim actually follow from that source?
 *
 * A separate, strict call rather than asking the extractor to self-assess — a model that
 * just produced an answer is a poor judge of it. The verdict carries a 0–1 confidence,
 * and the UI only renders a value as a fact when it clears
 * `idea.config.agent.confidenceThreshold`; below that it is shown as unverified.
 *
 * This is the pattern that separates "the demo said something plausible" from "the demo
 * showed it checked".
 */

const Input = z.object({
  claim: z.string().min(1).max(5_000).describe("The specific statement to check."),
  source: z
    .string()
    .min(1)
    .max(50_000)
    .describe("The text the claim is supposed to come from. The claim is judged only against this."),
  strictness: z
    .enum(["exact", "semantic"])
    .default("semantic")
    .describe(
      "`exact` requires the value to appear in the source verbatim; `semantic` allows a faithful paraphrase.",
    ),
});

const Verdict = z.object({
  verdict: z.enum(["supported", "partially_supported", "unsupported", "contradicted"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  /** The span the judgement rests on, so the UI can show its working. */
  evidence: z.string(),
});

export type VerifyResult = z.infer<typeof Verdict> & {
  passesThreshold: boolean;
  threshold: number;
  model: string;
};

export const verifyTool: Tool<typeof Input> = {
  name: "verify",
  description:
    "Check a claim against its source and return a verdict with a 0–1 confidence. Call this " +
    "before asserting anything you extracted, retrieved or inferred. A low confidence is a " +
    "useful answer — say you are unsure rather than guessing.",
  inputSchema: Input,

  async run(input, ctx) {
    const result = await generate({
      sessionId: ctx.sessionId,
      system:
        "You are a strict verifier. Judge ONLY whether the claim follows from the source provided. " +
        "Do not use outside knowledge. Do not be generous: a claim that is close but wrong in a " +
        "detail is partially_supported, and one the source contradicts is contradicted. " +
        "Quote the exact span you relied on as `evidence`, or an empty string if there is none. " +
        "Return JSON only.",
      messages: [
        {
          role: "user",
          content:
            `Strictness: ${input.strictness}\n\n` +
            `Claim:\n"""\n${input.claim}\n"""\n\n` +
            `Source:\n"""\n${input.source}\n"""`,
        },
      ],
      schema: Verdict,
      cacheKey: `verify:${input.strictness}:${input.claim}:${input.source.slice(0, 2000)}`,
      maxTokens: 1024,
    });

    const threshold = ctx.config.agent.confidenceThreshold;
    const passes = result.data.verdict === "supported" && result.data.confidence >= threshold;

    // The confidence is what the trace panel badges, so it is emitted as its own event
    // rather than buried in the tool result.
    await ctx.emit({
      type: "verify",
      label: passes ? "verified" : `not verified (${result.data.verdict})`,
      confidence: result.data.confidence,
      model: result.model,
      data: { claim: input.claim.slice(0, 200), reason: result.data.reason },
    });

    return {
      ...result.data,
      passesThreshold: passes,
      threshold,
      model: result.model,
    } satisfies VerifyResult;
  },
};
