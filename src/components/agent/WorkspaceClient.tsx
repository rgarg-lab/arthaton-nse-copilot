"use client";

import { useCallback, useState } from "react";
import type { TraceEvent } from "@/lib/agent/trace";
import type { IdeaConfig } from "@/lib/config";
import type { Change } from "@/lib/tools/clean_input";
import { ConfirmTray, type PendingAction } from "@/components/agent/ConfirmTray";
import { ResultCards, type ResultCard } from "@/components/agent/ResultCards";
import { TracePanel } from "@/components/agent/TracePanel";
import { SmartInput } from "@/components/input/SmartInput";
import { ErrorState } from "@/components/common/EmptyState";
import { readSse } from "@/lib/sseClient";

/**
 * `clean_input`'s result arrives in the trace as a summarised JSON string. Parsing it back
 * is what lets the raw-vs-cleaned panel appear without a second round trip; a truncated or
 * unexpected payload simply yields null rather than throwing in a render path.
 */
function parseCleanResult(
  summary: unknown,
): { raw: string; cleaned: string; changes: Change[] } | null {
  if (typeof summary !== "string") return null;
  try {
    const parsed = JSON.parse(summary) as {
      raw?: unknown;
      cleaned?: unknown;
      changes?: unknown;
    };
    if (typeof parsed.raw !== "string" || typeof parsed.cleaned !== "string") return null;
    return {
      raw: parsed.raw,
      cleaned: parsed.cleaned,
      changes: Array.isArray(parsed.changes) ? (parsed.changes as Change[]) : [],
    };
  } catch {
    return null;
  }
}

/**
 * The workspace: input on the left, results in the middle, trace on the right, approvals
 * in a drawer along the bottom.
 *
 * All the streaming lives here. The layout is three columns on desktop and a single
 * column on mobile, in the order input → results → trace, which is also the order a
 * person reads them.
 */
export function WorkspaceClient({
  idea,
  mode,
  initialPending,
}: {
  idea: IdeaConfig;
  mode: "mock" | "cached" | "live";
  /**
   * Read on the server so the tray is correct on first paint and there is no mount-time
   * fetch. After that the client re-reads it whenever a run finishes or a decision lands.
   */
  initialPending: PendingAction[];
}) {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [cards, setCards] = useState<ResultCard[]>([]);
  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction[]>(initialPending);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleaned, setCleaned] = useState<{ raw: string; cleaned: string; changes: Change[] } | null>(null);

  const refreshPending = useCallback(async (session: string | null) => {
    try {
      const res = await fetch(`/api/approve${session ? `?sessionId=${session}` : ""}`);
      if (!res.ok) return;
      const json = (await res.json()) as { pending: PendingAction[] };
      setPending(json.pending ?? []);
    } catch {
      // A failed poll is not worth surfacing; the tray simply stays as it was.
    }
  }, []);

  const ask = async (question: string) => {
    setRunning(true);
    setError(null);
    setEvents([]);
    setAnswer(null);
    setCards([]);
    setCleaned(null);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, sessionId: sessionId ?? undefined }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`The agent endpoint returned ${res.status}. ${detail.slice(0, 200)}`);
      }

      await readSse(res, (event, data) => {
        if (event === "trace") {
          const trace = data as TraceEvent;
          setEvents((prev) => [...prev, trace]);
          // Build the result cards from the trace rather than waiting for the final
          // payload, so they appear as the work happens.
          if (trace.type === "tool_result") {
            const tool = String(trace.label ?? "tool").replace(/ failed$/, "");
            setCards((prev) => [
              ...prev,
              {
                tool,
                ok: !String(trace.label ?? "").endsWith("failed"),
                durationMs: trace.durationMs ?? 0,
                output: trace.data?.summary ?? trace.data ?? null,
                error: trace.data?.error ? String(trace.data.error) : undefined,
              },
            ]);
            // When the agent cleaned the input, show the user exactly what was changed.
            if (tool === "clean_input") setCleaned(parseCleanResult(trace.data?.summary));
          }
        } else if (event === "done") {
          const payload = data as { answer: string; sessionId: string };
          setAnswer(payload.answer);
          setSessionId(payload.sessionId);
          void refreshPending(payload.sessionId);
        } else if (event === "error") {
          setError(String((data as { message?: string }).message ?? "The run failed."));
        }
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const decide = async (
    id: string,
    decision: "approve" | "reject",
    edits?: { preview: string },
  ) => {
    setBusyAction(id);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId: id, decision, edits }),
      });
      const json = (await res.json()) as { ok: boolean; detail?: string };
      if (!json.ok && json.detail) setError(json.detail);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAction(null);
      void refreshPending(sessionId);
    }
  };

  const ingestFile = async (file: File) => {
    setError(null);
    const form = new FormData();
    form.set("file", file);
    if (sessionId) form.set("sessionId", sessionId);
    try {
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const json = (await res.json()) as { sessionId?: string; error?: string; chunks?: number };
      if (!res.ok) throw new Error(json.error ?? `Ingest failed (${res.status})`);
      if (json.sessionId) setSessionId(json.sessionId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const ingestUrl = async (url: string) => {
    setError(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "url", url, sessionId: sessionId ?? undefined }),
      });
      const json = (await res.json()) as { sessionId?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Could not fetch ${url}`);
      if (json.sessionId) setSessionId(json.sessionId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadDemo = async () => {
    setError(null);
    try {
      const res = await fetch("/api/demo", { method: "POST" });
      const json = (await res.json()) as { sessionId?: string; error?: string; cleaned?: never };
      if (!res.ok) throw new Error(json.error ?? "Could not load the demo seed");
      if (json.sessionId) setSessionId(json.sessionId);
      void refreshPending(json.sessionId ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[18px] font-medium text-ink-1">{idea.name}</h1>
          <p className="text-[13px] text-ink-3">{idea.tagline}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadDemo}
            className="rounded-pill border border-line bg-glass px-3 py-1.5 text-[12px] text-ink-2 transition-colors hover:text-ink-1"
          >
            Load demo
          </button>
          <span className="rounded-pill border border-line bg-glass px-2.5 py-1 font-mono text-[11px] text-ink-3">
            {mode}
          </span>
        </div>
      </div>

      {error && <ErrorState detail={error} onRetry={() => setError(null)} />}

      {/* Three columns on desktop; stacked in reading order on mobile. */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <SmartInput
          modes={idea.inputs}
          acceptedFileTypes={idea.inputs.acceptedFileTypes}
          sampleQuestions={idea.sampleQuestions}
          busy={running}
          onSubmit={ask}
          onFile={idea.inputs.file ? ingestFile : undefined}
          onUrl={idea.inputs.url ? ingestUrl : undefined}
          cleaned={cleaned}
        />
        <ResultCards
          answer={answer}
          cards={cards}
          threshold={idea.agent.confidenceThreshold}
          running={running}
        />
        <TracePanel
          events={events}
          threshold={idea.agent.confidenceThreshold}
          running={running}
          className="max-h-[70vh] lg:max-h-none"
        />
      </div>

      <ConfirmTray actions={pending} onDecide={decide} busyId={busyAction} />
    </div>
  );
}
