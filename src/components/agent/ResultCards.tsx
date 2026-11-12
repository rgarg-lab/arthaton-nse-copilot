"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ConfidenceBadge } from "@/components/common/ConfidenceBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { cn } from "@/lib/utils";

/**
 * The answer, plus the tool outputs it rests on.
 *
 * The answer is rendered as text, not as a chat bubble: this is a workspace, not a
 * messenger, and the agent produces results rather than conversation. Each tool that ran
 * gets a collapsed card beneath, so "where did that come from?" is always one click away
 * during a demo.
 */

export type ResultCard = {
  tool: string;
  ok: boolean;
  durationMs: number;
  output: unknown;
  error?: string;
};

function confidenceOf(output: unknown): number | null {
  if (output && typeof output === "object" && "confidence" in output) {
    const value = (output as { confidence: unknown }).confidence;
    if (typeof value === "number") return value;
  }
  return null;
}

function Card({ card, threshold }: { card: ResultCard; threshold: number }) {
  const [open, setOpen] = useState(false);
  const confidence = confidenceOf(card.output);

  return (
    <li className="rounded-card border border-line bg-surface-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <ChevronRight className={cn("size-3.5 shrink-0 text-ink-3 transition-transform", open && "rotate-90")} />
        <span className="font-mono text-[12px] text-ink-1">{card.tool}</span>
        {!card.ok && <span className="text-[11px] text-coral">failed</span>}
        <span className="ml-auto flex items-center gap-2">
          {confidence !== null && <ConfidenceBadge confidence={confidence} threshold={threshold} />}
          <span className="font-mono text-[10px] text-ink-4">{card.durationMs}ms</span>
        </span>
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto border-t border-line px-3 py-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-2">
          {card.error ?? JSON.stringify(card.output, null, 2)}
        </pre>
      )}
    </li>
  );
}

export function ResultCards({
  answer,
  cards,
  threshold,
  running,
  className,
}: {
  answer: string | null;
  cards: ResultCard[];
  threshold: number;
  running: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn("flex min-h-0 flex-col gap-3 overflow-y-auto", className)}
      aria-label="Results"
      aria-busy={running}
    >
      {answer === null && cards.length === 0 ? (
        <EmptyState
          title={running ? "Working…" : "Nothing yet"}
          description={
            running
              ? "The answer appears here once the agent finishes."
              : "The answer and the tool output behind it will show up here."
          }
        />
      ) : (
        <>
          {answer !== null && (
            <article className="rounded-panel border border-line bg-surface-1 p-4">
              <h2 className="label-caps mb-2 text-ink-3">Answer</h2>
              <div className="text-[14px] leading-relaxed whitespace-pre-wrap text-ink-1">{answer}</div>
            </article>
          )}
          {running && answer === null && (
            <div className="rounded-panel border border-line bg-surface-1 p-4">
              <div className="h-3 w-2/3 animate-pulse rounded-pill bg-surface-3" />
              <div className="mt-2 h-3 w-1/2 animate-pulse rounded-pill bg-surface-3" />
            </div>
          )}
          {cards.length > 0 && (
            <div>
              <h2 className="label-caps mb-2 text-ink-3">What ran</h2>
              <ul className="flex list-none flex-col gap-2">
                {cards.map((card, i) => (
                  <Card key={`${card.tool}-${i}`} card={card} threshold={threshold} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
