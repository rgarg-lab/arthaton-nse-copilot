import { traceEvents, type Db } from "@/db";

/**
 * The trace is the product, not the logging.
 *
 * "Prove the agent is truly agentic" comes down to one artefact: an ordered record of
 * what it thought, which tool it chose, what came back, which rules fired and how
 * confident it was. Every event is persisted (so it survives a reload and can be replayed
 * in a demo) and streamed to the client as it is written (so the panel fills live).
 */

export type TraceType =
  | "thought"
  | "tool_call"
  | "tool_result"
  | "verify"
  | "rule"
  | "approval_needed"
  | "final"
  | "fallback"
  | "error";

export type TraceEvent = {
  seq: number;
  type: TraceType;
  label?: string;
  data?: Record<string, unknown>;
  model?: string;
  durationMs?: number;
  confidence?: number;
  at: string;
};

export type Emit = (event: Omit<TraceEvent, "seq" | "at">) => Promise<TraceEvent>;

/**
 * A per-session trace writer. Sequence numbers are assigned here rather than by the
 * database so an event can be streamed to the client before the insert settles — the
 * panel should never lag behind the work.
 *
 * Persistence failures are swallowed on purpose: losing a trace row is a cosmetic
 * problem, and taking down a live demo over one is not a trade worth making.
 */
export function createTrace(opts: {
  db: Db | null;
  sessionId: string;
  onEvent?: (event: TraceEvent) => void;
}): { emit: Emit; events: TraceEvent[] } {
  const events: TraceEvent[] = [];
  let seq = 0;

  const emit: Emit = async (partial) => {
    const event: TraceEvent = { ...partial, seq: seq++, at: new Date().toISOString() };
    events.push(event);
    opts.onEvent?.(event);

    if (opts.db) {
      try {
        await opts.db.insert(traceEvents).values({
          sessionId: opts.sessionId,
          seq: event.seq,
          type: event.type,
          label: event.label ?? null,
          data: event.data ?? {},
          model: event.model ?? null,
          durationMs: event.durationMs ?? null,
          confidence: event.confidence ?? null,
        });
      } catch (err) {
        console.warn("trace persist failed:", err);
      }
    }
    return event;
  };

  return { emit, events };
}

/** Keep a tool result readable in the panel without hiding that it was truncated. */
export function summarise(value: unknown, max = 400): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}… (${text.length} chars)` : text;
}
