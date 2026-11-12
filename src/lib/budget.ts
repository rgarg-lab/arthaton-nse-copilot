import type { Degradation } from "@/schemas";
import { anyProviderConfigured, llmMode } from "@/lib/llm/router";

/**
 * The gate the workspace consults before offering a conversation.
 *
 * The original enforced a shared daily token budget for public judging. The new LLM layer
 * owns budgets per session (`src/lib/llm/budget.ts`), so this reports the one thing the UI
 * needs: whether a turn can be attempted, and the sentence to show when it cannot.
 *
 * Mock mode is always `ok`: with no keys there is nothing to exhaust, and the demo banner
 * already says the answers are generated locally.
 */
export type BudgetKey = { userId: string; learnerId: string };
export type BudgetGateResult = { ok: true } | { ok: false; degradation: Degradation };

export const judgeGate = {
  /** Signature kept from the original so the call sites are unchanged. */
  async allow(_key: BudgetKey): Promise<BudgetGateResult> {
    if (llmMode() === "mock") return { ok: true };
    if (!anyProviderConfigured()) {
      return {
        ok: false,
        degradation: {
          degraded: true,
          reason: "unavailable",
          message: "No model provider is configured. Everything deterministic still works.",
        },
      };
    }
    return { ok: true };
  },
};
