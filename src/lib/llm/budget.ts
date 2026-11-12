import { envInt } from "@/lib/env";
/**
 * Per-session limits, in process memory.
 *
 * Two different failures to prevent: a tool loop that calls the model forever, and a
 * free tier exhausted twenty minutes before the demo. Both are bounded here rather than
 * trusted to the model's good judgement.
 *
 * In-process means per serverless instance, so this bounds rather than guarantees — but
 * the loop it is guarding against runs inside one request, which is exactly the case it
 * does catch.
 */

export type Budget = {
  maxCalls: number;
  maxToolSteps: number;
  maxTokens: number;
};

/**
 * Ceilings sized for a conversation, not a single question.
 *
 * The first values here (24 calls, 12 tool steps) were sized for one turn, and a session
 * is long-lived: a run that uses six tools exhausted the allowance on the second question
 * and every turn after that silently took the fallback path — no tool calls, no approval,
 * an answer that looked thin for no visible reason. A demo holds a conversation, so the
 * ceiling has to cover one.
 *
 * The purpose is unchanged: stop a runaway loop inside one request and bound a free tier.
 * Sixty tool steps still does both — `agent.maxSteps` in idea.config.ts is what limits any
 * single turn.
 */
export function budgetFromEnv(): Budget {
  return {
    maxCalls: envInt("LLM_MAX_CALLS_PER_SESSION", 120),
    maxToolSteps: envInt("LLM_MAX_TOOL_STEPS", 60),
    maxTokens: envInt("LLM_MAX_TOKENS_PER_SESSION", 500_000),
  };
}

type Spend = { calls: number; toolSteps: number; tokens: number };

const spend = new Map<string, Spend>();

function get(sessionId: string): Spend {
  let s = spend.get(sessionId);
  if (!s) {
    s = { calls: 0, toolSteps: 0, tokens: 0 };
    spend.set(sessionId, s);
    // A hackathon process never has many sessions, but an unbounded map is still a leak.
    if (spend.size > 5_000) {
      const oldest = spend.keys().next().value;
      if (oldest) spend.delete(oldest);
    }
  }
  return s;
}

export class BudgetExceededError extends Error {
  constructor(readonly limit: keyof Budget, readonly used: number, readonly cap: number) {
    super(`session budget exhausted: ${limit} ${used}/${cap}`);
    this.name = "BudgetExceededError";
  }
}

/** Throws rather than returning false: every caller's only correct response is to stop. */
export function chargeCall(sessionId: string, budget = budgetFromEnv()): void {
  const s = get(sessionId);
  if (s.calls >= budget.maxCalls) throw new BudgetExceededError("maxCalls", s.calls, budget.maxCalls);
  if (s.tokens >= budget.maxTokens) throw new BudgetExceededError("maxTokens", s.tokens, budget.maxTokens);
  s.calls += 1;
}

export function chargeToolStep(sessionId: string, budget = budgetFromEnv()): void {
  const s = get(sessionId);
  if (s.toolSteps >= budget.maxToolSteps) {
    throw new BudgetExceededError("maxToolSteps", s.toolSteps, budget.maxToolSteps);
  }
  s.toolSteps += 1;
}

export function recordTokens(sessionId: string, tokens: number): void {
  get(sessionId).tokens += tokens;
}

export function usage(sessionId: string): Spend {
  return { ...get(sessionId) };
}

/** Test seam, and what the "new session" button effectively does. */
export function resetBudget(sessionId?: string): void {
  if (sessionId) spend.delete(sessionId);
  else spend.clear();
}
