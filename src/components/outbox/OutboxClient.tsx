"use client";

import { useState } from "react";
import { Clock, FastForward } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common/EmptyState";
import { cn } from "@/lib/utils";

/**
 * The outbox, plus the time simulator.
 *
 * The simulator is the reason this is a client component. A scheduler is impossible to
 * demo in real time — nobody waits until 9am in a three-minute video — so the page can
 * ask the cron route to evaluate "as if" it were a given instant, and the answer is
 * computed properly in SQL rather than mimed.
 */

export type OutboxRow = {
  id: string;
  kind: string;
  connector: string;
  body: string;
  status: string;
  deliverAfter: string | null;
  deliveredAt: string | null;
};

const STATUS_TONE: Record<string, string> = {
  delivered: "border-violet-line text-violet",
  queued: "border-evidence-review-line text-evidence-review",
  failed: "border-coral-line text-coral",
};

function toLocalInput(date: Date): string {
  // datetime-local wants local time with no zone suffix.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function OutboxClient({ initial }: { initial: OutboxRow[] }) {
  const [rows, setRows] = useState(initial);
  const [asOf, setAsOf] = useState(() => toLocalInput(new Date(Date.now() + 86_400_000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ delivered: number; failed: number; asOf: string } | null>(null);

  const run = async (instant: string | null, digest = false) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cron", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(instant ? { asOf: new Date(instant).toISOString() } : {}),
          digest,
        }),
      });
      const json = (await res.json()) as {
        delivered?: number;
        failed?: number;
        asOf?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Cron run failed (${res.status})`);
      setLastRun({ delivered: json.delivered ?? 0, failed: json.failed ?? 0, asOf: json.asOf ?? "" });

      // Re-read rather than patching local state: the server is the authority on what
      // was delivered, and a demo must not show an optimistic lie.
      const refreshed = await fetch("/api/outbox");
      if (refreshed.ok) setRows(((await refreshed.json()) as { rows: OutboxRow[] }).rows);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-panel border border-line bg-surface-1 p-4">
        <h2 className="label-caps flex items-center gap-1.5 text-ink-3">
          <Clock className="size-3" />
          Time simulator
        </h2>
        <p className="mt-1.5 text-[12px] text-ink-3">
          Deliver everything that would be due at a chosen instant. Due-ness is computed in SQL against
          the timestamp, so the result is real rather than staged.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="as-of" className="sr-only">
            Simulated instant
          </label>
          <input
            id="as-of"
            type="datetime-local"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded-chip border border-line bg-ink px-2.5 py-1.5 text-[13px] text-ink-1 outline-none focus-visible:border-violet-line"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => run(asOf)}
            className="inline-flex items-center gap-1.5 rounded-pill border border-violet-line bg-violet-soft px-3 py-1.5 text-[12px] font-medium text-ink-1 transition-colors hover:bg-glass-strong disabled:opacity-50"
          >
            <FastForward className="size-3" />
            Fast-forward
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(null)}
            className="rounded-pill border border-line bg-glass px-3 py-1.5 text-[12px] text-ink-2 transition-colors hover:text-ink-1 disabled:opacity-50"
          >
            Deliver due now
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(asOf, true)}
            className="rounded-pill border border-line bg-glass px-3 py-1.5 text-[12px] text-ink-2 transition-colors hover:text-ink-1 disabled:opacity-50"
          >
            Queue a digest
          </button>
          {busy && <span className="text-[11px] text-ink-3">running…</span>}
        </div>
        {lastRun && (
          <p className="mt-2.5 text-[12px] text-ink-2">
            Delivered {lastRun.delivered}, failed {lastRun.failed}, evaluated at{" "}
            <span className="font-mono text-ink-3">{lastRun.asOf}</span>.
          </p>
        )}
      </section>

      {error && <ErrorState detail={error} onRetry={() => setError(null)} />}

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing in the outbox"
          description="Approve an action in the workspace, or schedule a reminder, and it appears here."
        />
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-card border border-line bg-surface-1 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "label-caps rounded-chip border px-1.5 py-0.5",
                    STATUS_TONE[row.status] ?? "border-line text-ink-3",
                  )}
                >
                  {row.status}
                </span>
                <span className="text-[12px] text-ink-2">{row.kind.replace(/_/g, " ")}</span>
                <span className="rounded-chip bg-glass px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                  {row.connector}
                </span>
                <span className="ml-auto font-mono text-[10px] text-ink-4">
                  {row.deliveredAt
                    ? `delivered ${row.deliveredAt.slice(0, 16).replace("T", " ")}`
                    : row.deliverAfter
                      ? `due ${row.deliverAfter.slice(0, 16).replace("T", " ")}`
                      : "due immediately"}
                </span>
              </div>
              <pre className="mt-2 max-h-32 overflow-auto font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">
                {row.body}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
