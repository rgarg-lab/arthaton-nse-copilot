import { z } from "zod";
import { currentUser } from "@/auth";
import { db } from "@/db";
import { runAgent } from "@/lib/agent/loop";
import { config } from "@/lib/config";
import { jsonError, parseBody } from "@/lib/api";
import { llmMode } from "@/lib/llm/router";
import { agentLimit } from "@/lib/rateLimit";
import { SSE_HEADERS, sseStream } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The loop can take a while in live mode; the default 15s would cut a real run short. */
export const maxDuration = 120;

const Body = z.object({
  question: z.string().min(1).max(10_000),
  sessionId: z.string().uuid().optional(),
});

/**
 * POST /api/agent — run the agent, streaming the trace as server-sent events.
 *
 * Events on the wire: `trace` for each step, then `done` with the answer, or `error`.
 * The stream is the point — the trace panel fills while the agent works, which is what
 * makes the reasoning legible rather than retrospective.
 *
 * Open to anonymous visitors on purpose: a hackathon demo should not open with a login
 * wall. Sign-in only decides whether memory is scoped to an account or to the session.
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, Body);
  if (!parsed.ok) return parsed.response;

  const user = await currentUser();
  const limitKey = user?.id ?? request.headers.get("x-forwarded-for") ?? "anonymous";
  const allowed = agentLimit.take(limitKey);
  if (!allowed.ok) {
    return jsonError(429, "Too many requests in a row — wait a moment.", {
      retryAfterSeconds: allowed.retryAfterSeconds,
    });
  }

  const { stream, send, close } = sseStream();

  // Not awaited: the response has to start flowing before the run finishes, or there is
  // no streaming. Every failure path inside ends with close().
  void (async () => {
    try {
      send("meta", { mode: llmMode(), idea: config().name, maxSteps: config().agent.maxSteps });

      let handle = null;
      try {
        handle = await db();
      } catch (err) {
        // No database is survivable: the run just cannot persist or search memory.
        send("warning", { message: "database unavailable; running without persistence" });
        console.warn("agent route: database unavailable:", err);
      }

      const result = await runAgent({
        question: parsed.data.question,
        sessionId: parsed.data.sessionId,
        userId: user?.id ?? null,
        db: handle,
        onEvent: (event) => send("trace", event),
      });

      send("done", {
        sessionId: result.sessionId,
        answer: result.answer,
        model: result.model,
        steps: result.steps,
        usedFallback: result.usedFallback,
        toolCalls: result.toolResults.length,
        firedRules: result.firedRules.map((r) => r.id),
      });
    } catch (err) {
      console.error("agent route failed:", err);
      send("error", { message: (err as Error).message });
    } finally {
      close();
    }
  })();

  return new Response(stream, { headers: SSE_HEADERS });
}
