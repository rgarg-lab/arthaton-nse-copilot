import { agentSessions, messages as messagesTable, type Db } from "@/db";
import { config as loadConfig, type IdeaConfig } from "@/lib/config";
import { BudgetExceededError, chargeToolStep } from "@/lib/llm/budget";
import { generate, llmMode } from "@/lib/llm/router";
import type { Message, ToolCall } from "@/lib/llm/types";
import { runRules, type FiredRule } from "@/lib/rules";
import { assertToolsExist, enabledTools, toToolSpecs, toolByName } from "@/lib/tools";
import { createTrace, summarise, type TraceEvent } from "./trace";
import type { ToolContext, ToolResult } from "./types";

/**
 * The agent loop: ask the model, run what it asked for, feed the results back, repeat
 * until it answers or runs out of steps.
 *
 * Three things make it more than a while-loop around an API call:
 *
 *  1. Rules run before every tool call and before the final answer, and can override the
 *     model (src/lib/rules).
 *  2. Every step emits a trace event, persisted and streamed, so the reasoning is visible
 *     rather than asserted.
 *  3. If the loop itself fails — a provider outage, a budget ceiling, a thrown tool — it
 *     degrades to a single plain call and labels that in the trace, rather than showing a
 *     stack trace to a judge.
 */

export type AgentRunOptions = {
  question: string;
  sessionId?: string;
  userId?: string | null;
  db: Db | null;
  config?: IdeaConfig;
  /** Called for each trace event as it happens; the SSE route streams these. */
  onEvent?: (event: TraceEvent) => void;
};

export type AgentRunResult = {
  sessionId: string;
  answer: string;
  events: TraceEvent[];
  toolResults: ToolResult[];
  model: string;
  steps: number;
  usedFallback: boolean;
  firedRules: FiredRule[];
};

/** Keep the model's context a summary, not a dump: context engineering, not transcript. */
function compactResult(result: ToolResult): string {
  if (!result.ok) return JSON.stringify({ error: result.error });
  const text = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
  if (text.length <= 4_000) return text;
  return `${text.slice(0, 4_000)}\n…[truncated; ${text.length} chars total]`;
}

async function ensureSession(db: Db | null, sessionId: string | undefined, userId: string | null) {
  if (!db) return sessionId ?? crypto.randomUUID();
  if (sessionId) return sessionId;
  const [row] = await db
    .insert(agentSessions)
    .values({ userId, llmMode: llmMode() })
    .returning({ id: agentSessions.id });
  return row.id;
}

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const config = options.config ?? loadConfig();
  assertToolsExist(config.agent.enabledTools);

  const userId = options.userId ?? null;
  const sessionId = await ensureSession(options.db, options.sessionId, userId);
  const { emit, events } = createTrace({ db: options.db, sessionId, onEvent: options.onEvent });

  const tools = enabledTools(config.agent.enabledTools);
  const specs = toToolSpecs(tools);
  const mock = llmMode() === "mock";

  const ctx: ToolContext = { sessionId, userId, db: options.db, config, emit, mock };

  const conversation: Message[] = [{ role: "user", content: options.question }];
  const toolResults: ToolResult[] = [];
  const firedRules: FiredRule[] = [];
  let model = "none";
  let steps = 0;
  let usedFallback = false;

  if (options.db) {
    await options.db
      .insert(messagesTable)
      .values({ sessionId, role: "user", content: { text: options.question } })
      .catch((err) => console.warn("message persist failed:", err));
  }

  try {
    for (steps = 0; steps < config.agent.maxSteps; steps += 1) {
      const result = await generate({
        sessionId,
        system: config.agent.systemPrompt,
        messages: conversation,
        tools: specs,
        maxTokens: 2048,
      });
      model = result.model;

      if (result.text.trim()) {
        await emit({
          type: "thought",
          label: result.text.slice(0, 160),
          model: result.model,
          durationMs: result.latencyMs,
          data: { text: result.text },
        });
      }

      // ── no tool calls: this is the answer ────────────────────────────────────
      if (result.toolCalls.length === 0) {
        const check = runRules({
          stage: "before_final",
          config,
          finalText: result.text,
          results: toolResults.map((r) => ({ name: r.name, output: r.output })),
          stepIndex: steps,
        });
        let answer = result.text;
        for (const fired of check.fired) {
          firedRules.push(fired);
          await emit({ type: "rule", label: fired.id, data: { outcome: fired.outcome } });
        }
        if (check.outcome.action === "annotate") {
          answer = `${answer}\n\n---\n\n⚠︎ ${check.outcome.message}`;
        }

        await emit({ type: "final", label: "answer", model: result.model, data: { text: answer } });
        if (options.db) {
          await options.db
            .insert(messagesTable)
            .values({ sessionId, role: "assistant", content: { text: answer } })
            .catch((err) => console.warn("message persist failed:", err));
        }
        return { sessionId, answer, events, toolResults, model, steps: steps + 1, usedFallback, firedRules };
      }

      // ── tool calls ───────────────────────────────────────────────────────────
      conversation.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });

      for (const call of result.toolCalls) {
        const outcome = await executeToolCall(call, ctx, {
          steps,
          toolResults,
          firedRules,
          config,
        });
        conversation.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: outcome,
        });
      }
    }

    // Ran out of steps with no answer: ask once for a conclusion from what it has.
    await emit({
      type: "fallback",
      label: `step limit (${config.agent.maxSteps}) reached`,
      data: { reason: "max_steps" },
    });
    usedFallback = true;
    const wrapUp = await generate({
      sessionId,
      system: config.agent.systemPrompt,
      messages: [
        ...conversation,
        {
          role: "user",
          content:
            "You have run out of tool steps. Answer now with what you have, and say plainly " +
            "what you could not finish.",
        },
      ],
      maxTokens: 1024,
    });
    await emit({ type: "final", label: "answer (step limit)", model: wrapUp.model, data: { text: wrapUp.text } });
    return {
      sessionId,
      answer: wrapUp.text,
      events,
      toolResults,
      model: wrapUp.model,
      steps,
      usedFallback: true,
      firedRules,
    };
  } catch (err) {
    // ── the loop broke: single-call fallback ──────────────────────────────────
    // A judge should see an answer, not a stack trace — but the trace records that the
    // fallback path was taken, so the demo is not dishonest about what happened.
    const reason = err instanceof BudgetExceededError ? `budget: ${err.message}` : (err as Error).message;
    await emit({ type: "fallback", label: "agent loop failed", data: { reason } });
    usedFallback = true;
    try {
      const plain = await generate({
        system: config.agent.systemPrompt,
        messages: [{ role: "user", content: options.question }],
        maxTokens: 1024,
      });
      await emit({ type: "final", label: "answer (fallback path)", model: plain.model, data: { text: plain.text } });
      return {
        sessionId,
        answer: plain.text,
        events,
        toolResults,
        model: plain.model,
        steps,
        usedFallback,
        firedRules,
      };
    } catch (innerErr) {
      await emit({ type: "error", label: "fallback also failed", data: { reason: (innerErr as Error).message } });
      return {
        sessionId,
        answer:
          "I could not complete that — both the agent loop and the direct fallback failed. " +
          "Check /preflight for which provider is unavailable.",
        events,
        toolResults,
        model,
        steps,
        usedFallback,
        firedRules,
      };
    }
  }
}

/** One tool call: rules, then validate, then run, then trace. Returns what the model sees. */
async function executeToolCall(
  call: ToolCall,
  ctx: ToolContext,
  state: {
    steps: number;
    toolResults: ToolResult[];
    firedRules: FiredRule[];
    config: IdeaConfig;
  },
): Promise<string> {
  const check = runRules({
    stage: "before_tool",
    config: state.config,
    toolCall: call,
    results: state.toolResults.map((r) => ({ name: r.name, output: r.output })),
    stepIndex: state.steps,
  });
  for (const fired of check.fired) {
    state.firedRules.push(fired);
    await ctx.emit({ type: "rule", label: fired.id, data: { outcome: fired.outcome, tool: call.name } });
  }
  if (check.outcome.action === "block") {
    return JSON.stringify({ blocked: true, reason: check.outcome.message });
  }
  const effective = check.outcome.action === "rewrite" ? check.outcome.toolCall : call;

  const tool = toolByName(effective.name);
  if (!tool) {
    // The model asked for something that does not exist; tell it so it can recover.
    const message = `No such tool "${effective.name}".`;
    await ctx.emit({ type: "error", label: message, data: { requested: effective.name } });
    return JSON.stringify({ error: message });
  }
  if (!state.config.agent.enabledTools.includes(effective.name)) {
    const message = `Tool "${effective.name}" is not enabled for this idea.`;
    await ctx.emit({ type: "error", label: message, data: { requested: effective.name } });
    return JSON.stringify({ error: message });
  }

  // The step budget is charged here, not per model call: a loop that calls tools is the
  // one that runs away.
  chargeToolStep(ctx.sessionId);

  const parsed = tool.inputSchema.safeParse(effective.input);
  if (!parsed.success) {
    const message = `Invalid arguments for ${tool.name}`;
    await ctx.emit({ type: "error", label: message, data: { issues: parsed.error.issues } });
    return JSON.stringify({ error: message, issues: parsed.error.issues });
  }

  await ctx.emit({ type: "tool_call", label: tool.name, data: { args: parsed.data } });

  const started = Date.now();
  try {
    const output = await tool.run(parsed.data, ctx);
    const durationMs = Date.now() - started;
    const result: ToolResult = { name: tool.name, ok: true, output, durationMs };
    state.toolResults.push(result);
    await ctx.emit({
      type: "tool_result",
      label: tool.name,
      durationMs,
      data: { summary: summarise(output) },
    });
    return compactResult(result);
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = (err as Error).message;
    const result: ToolResult = { name: tool.name, ok: false, output: null, durationMs, error: message };
    state.toolResults.push(result);
    await ctx.emit({
      type: "tool_result",
      label: `${tool.name} failed`,
      durationMs,
      data: { error: message },
    });
    // The model gets the error and can try something else: a failing tool should not end
    // the run.
    return compactResult(result);
  }
}
