import { z } from "zod";
import { currentUserOrDemo, persistableUserId } from "@/auth";
import { eq } from "drizzle-orm";
import { agentSessions, db } from "@/db";
import { runAgent } from "@/lib/agent/loop";
import { novaStateFor, type ChatEvent } from "@/lib/agent/chatEvents";
import { config } from "@/lib/config";
import { jsonError, parseBody } from "@/lib/api";
import { llmMode } from "@/lib/llm/router";
import { agentLimit } from "@/lib/rateLimit";
import { currentScope, getRiskProfile } from "@/lib/watchlist";
import { SSE_HEADERS, sseStream } from "@/lib/sse";
import { isUuid } from "@/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  learnerId: z.string().min(1),
  message: z.string().min(1).max(10_000),
});

/**
 * POST /api/chat — the restored chat panel, driven by the new agent.
 *
 * This is the bridge the correction asked for. The panel is unchanged and still consumes
 * the `ChatEvent` union it was written against; what produces those events is now the
 * tool-using agent loop from phase 4, with its fallback chain, response cache, rules layer
 * and approvals queue behind it. So the same UI that used to talk to a bespoke chat
 * pipeline now shows real tool calls, and the TracePanel beside it reads the same stream.
 *
 * Mock mode needs no keys, so the conversation works on a fresh clone.
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, Body);
  if (!parsed.ok) return parsed.response;

  const user = await currentUserOrDemo();
  const limited = agentLimit.take(user?.id ?? "anonymous");
  if (!limited.ok) {
    return jsonError(429, "Too many messages in a row — give it a moment.", {
      retryAfterSeconds: limited.retryAfterSeconds,
    });
  }

  const { stream, send, close } = sseStream();
  const emit = (event: ChatEvent) => send("message", event);

  // Not awaited: the stream has to start flowing before the run finishes.
  void (async () => {
    try {
      let handle = null;
      let sessionId = parsed.data.learnerId;
      try {
        handle = await db();
        // The panel's `learnerId` is a session id once a real one exists. A seeded id has
        // no row behind it, so the first message creates one and the run is persisted.
        // Looked up by id, not by scanning an arbitrary row — an earlier version selected
        // one row and compared it, so a real session was only ever recognised by luck.
        const known = isUuid(sessionId)
          ? (await handle.select({ id: agentSessions.id }).from(agentSessions).where(eq(agentSessions.id, sessionId)).limit(1)).length > 0
          : false;
        if (!known) {
          const [created] = await handle
            .insert(agentSessions)
            .values({ title: parsed.data.message.slice(0, 60), llmMode: llmMode() })
            .returning({ id: agentSessions.id });
          sessionId = created.id;
        }
      } catch {
        // No database: the agent still answers, nothing is persisted.
      }

      emit({ type: "nova_state", state: "thinking" });

      const result = await runAgent({
        question: parsed.data.message,
        sessionId: handle ? sessionId : undefined,
        userId: persistableUserId(user?.id),
        db: handle,
        // See the agent route: lets the assistant honour the horizon set on /watchlist.
        riskProfile: await getRiskProfile(await currentScope()),
        onEvent: (event) => {
          // The panel's vocabulary first…
          if (event.type === "tool_call") {
            emit({ type: "tool_call", name: String(event.label ?? "tool"), status: "start" });
          } else if (event.type === "tool_result") {
            const name = String(event.label ?? "tool").replace(/ failed$/, "");
            emit({
              type: "tool_call",
              name,
              status: String(event.label ?? "").endsWith("failed") ? "error" : "done",
            });
          }
          const state = novaStateFor(event);
          if (state) emit({ type: "nova_state", state });
          // …then the raw trace, for the TracePanel.
          emit({ type: "trace", event });
        },
      });

      // The answer arrives in one piece; chunking it keeps the panel's typing feel.
      for (const chunk of result.answer.match(/[\s\S]{1,80}/g) ?? []) {
        emit({ type: "text", delta: chunk });
      }

      // The template emitted a `path_updated` event here, carrying a generated plan from
      // the demo seed so the panel and the path view stayed in step. There is no generated
      // plan in this project — the path surface became the evidence timeline, which reads
      // the ML service — so the event is gone rather than emitted with empty content.
      emit({ type: "nova_state", state: "speaking" });
      emit({ type: "done", text: result.answer });
    } catch (err) {
      console.error("chat route failed:", err);
      emit({
        type: "degraded",
        degradation: {
          degraded: true,
          reason: "unavailable",
          message: `${config().assistant.name} could not finish that. Everything deterministic still works.`,
        },
      });
      emit({ type: "done", text: "" });
    } finally {
      close();
    }
  })();

  return new Response(stream, { headers: SSE_HEADERS });
}
