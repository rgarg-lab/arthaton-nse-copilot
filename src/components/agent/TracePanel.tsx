"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronRight,
  CornerDownRight,
  Gavel,
  ShieldAlert,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { TraceEvent, TraceType } from "@/lib/agent/trace";
import { ConfidenceBadge } from "@/components/common/ConfidenceBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { cn } from "@/lib/utils";

/**
 * The live timeline of what the agent did. This is the main proof that the thing is
 * agentic, so it is built to be *read* rather than to look busy: one row per step, the
 * tool name and duration always visible, arguments and results one click away.
 */

const ICONS: Record<TraceType, typeof Brain> = {
  thought: Brain,
  tool_call: Wrench,
  tool_result: CornerDownRight,
  verify: CheckCircle2,
  rule: Gavel,
  approval_needed: ShieldAlert,
  final: Sparkles,
  fallback: AlertTriangle,
  error: AlertTriangle,
};

const TONE: Record<TraceType, string> = {
  thought: "text-ink-2",
  tool_call: "text-violet",
  tool_result: "text-ink-2",
  verify: "text-violet",
  rule: "text-evidence-review",
  approval_needed: "text-evidence-review",
  final: "text-ink-1",
  fallback: "text-evidence-review",
  error: "text-coral",
};

const LABELS: Record<TraceType, string> = {
  thought: "thinking",
  tool_call: "tool call",
  tool_result: "result",
  verify: "verification",
  rule: "rule fired",
  approval_needed: "needs approval",
  final: "answer",
  fallback: "fallback path",
  error: "error",
};

function Row({ event, threshold }: { event: TraceEvent; threshold: number }) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[event.type] ?? Brain;
  const payload = event.data ?? {};
  const hasDetail = Object.keys(payload).length > 0;

  return (
    <li className="relative pl-7">
      {/* The spine: a continuous line makes the sequence read as one run. */}
      <span className="absolute top-6 bottom-0 left-[11px] w-px bg-line" aria-hidden />
      <span
        className={cn(
          "absolute top-1 left-0 grid size-[22px] place-items-center rounded-pill border border-line bg-surface-2",
          TONE[event.type],
        )}
        aria-hidden
      >
        <Icon className="size-3" />
      </span>

      <div className="pb-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="label-caps text-ink-3">{LABELS[event.type] ?? event.type}</span>
          {event.model && (
            <span className="rounded-chip bg-glass px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
              {event.model}
            </span>
          )}
          {typeof event.durationMs === "number" && (
            <span className="font-mono text-[10px] text-ink-4">{event.durationMs}ms</span>
          )}
          {typeof event.confidence === "number" && (
            <ConfidenceBadge confidence={event.confidence} threshold={threshold} />
          )}
        </div>

        {event.label && (
          <p className={cn("mt-1 text-[13px] leading-snug", TONE[event.type])}>{event.label}</p>
        )}

        {hasDetail && (
          <>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-1.5 inline-flex items-center gap-1 rounded-chip px-1 py-0.5 text-[11px] text-ink-3 transition-colors hover:bg-glass hover:text-ink-1"
            >
              <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
              {open ? "hide" : "show"} detail
            </button>
            {open && (
              <pre className="mt-1.5 max-h-56 overflow-auto rounded-card border border-line bg-ink p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-2">
                {JSON.stringify(payload, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export function TracePanel({
  events,
  threshold,
  running,
  className,
}: {
  events: TraceEvent[];
  threshold: number;
  running: boolean;
  className?: string;
}) {
  const toolCalls = events.filter((e) => e.type === "tool_call").length;
  const rules = events.filter((e) => e.type === "rule").length;

  return (
    <section
      className={cn("flex min-h-0 flex-col rounded-panel border border-line bg-surface-1", className)}
      aria-label="Agent trace"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[13px] font-medium text-ink-1">Trace</h2>
        <div className="flex items-center gap-2 text-[11px] text-ink-3">
          {running && (
            <span className="inline-flex items-center gap-1.5 text-violet">
              <span className="size-1.5 animate-pulse rounded-pill bg-violet" aria-hidden />
              running
            </span>
          )}
          <span>
            {toolCalls} tool {toolCalls === 1 ? "call" : "calls"}
          </span>
          {rules > 0 && <span>· {rules} rule hits</span>}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {events.length === 0 ? (
          <EmptyState
            title={running ? "Waiting for the first step…" : "No run yet"}
            description={
              running
                ? "Steps appear here as they happen."
                : "Ask something on the left. Every thought, tool call and rule hit shows up here as it happens."
            }
            className="border-none bg-transparent px-0 py-6"
          />
        ) : (
          <ol className="list-none">
            {events.map((event) => (
              <Row key={event.seq} event={event} threshold={threshold} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
