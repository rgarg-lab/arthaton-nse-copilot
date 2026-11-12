"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The approval tray: a bottom drawer listing everything the agent wants to do to the
 * outside world, with the exact text it would send.
 *
 * Approving uses hold-to-confirm rather than a click. That is not a gimmick — it is the
 * one irreversible button in the app, and it reads well on camera: the ring filling is a
 * visible moment of deliberate consent in a demo about an agent that does not act alone.
 */

export type PendingAction = {
  id: string;
  kind: string;
  connector: string;
  preview: string;
};

const HOLD_MS = 650;

function HoldToApprove({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [progress, setProgress] = useState(0);
  const [timer, setTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer) clearInterval(timer);
    setTimer(null);
    setProgress(0);
  };

  const start = () => {
    if (disabled || timer) return;
    const step = 40;
    let elapsed = 0;
    const id = setInterval(() => {
      elapsed += step;
      setProgress(Math.min(1, elapsed / HOLD_MS));
      if (elapsed >= HOLD_MS) {
        clearInterval(id);
        setTimer(null);
        setProgress(0);
        onConfirm();
      }
    }, step);
    setTimer(id);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      // Keyboard users get a plain activation: hold-to-confirm is a pointer affordance,
      // and making it the only path would lock out anyone not using a mouse.
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onConfirm();
        }
      }}
      className={cn(
        "relative inline-flex items-center gap-1.5 overflow-hidden rounded-pill border border-violet-line bg-violet-soft px-3 py-1.5 text-[12px] font-medium text-ink-1 transition-colors",
        disabled ? "opacity-50" : "hover:bg-glass-strong",
      )}
      aria-label="Hold to approve"
    >
      <span
        className="absolute inset-y-0 left-0 bg-violet-glow/30 transition-[width] duration-75"
        style={{ width: `${progress * 100}%` }}
        aria-hidden
      />
      <Check className="relative size-3" />
      <span className="relative">{progress > 0 ? "hold…" : "Approve"}</span>
    </button>
  );
}

export function ConfirmTray({
  actions,
  onDecide,
  busyId,
  className,
}: {
  actions: PendingAction[];
  onDecide: (id: string, decision: "approve" | "reject", edits?: { preview: string }) => void;
  busyId?: string | null;
  className?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (actions.length === 0) return null;

  return (
    <section
      className={cn(
        "rounded-panel border border-evidence-review-line bg-surface-2 shadow-float",
        className,
      )}
      aria-label="Actions awaiting approval"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="size-1.5 rounded-pill bg-evidence-review" aria-hidden />
        <h2 className="text-[13px] font-medium text-ink-1">
          {actions.length} {actions.length === 1 ? "action" : "actions"} waiting for you
        </h2>
        <span className="text-[11px] text-ink-3">Nothing has been sent yet.</span>
      </header>

      <ul className="flex list-none flex-col divide-y divide-line">
        {actions.map((action) => {
          const isEditing = editing === action.id;
          const busy = busyId === action.id;
          return (
            <li key={action.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="label-caps text-ink-3">{action.kind.replace(/_/g, " ")}</span>
                <span className="rounded-chip bg-glass px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                  via {action.connector}
                </span>
              </div>

              {isEditing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={5}
                  className="w-full resize-y rounded-card border border-line-strong bg-ink p-2.5 font-mono text-[12px] leading-relaxed text-ink-1 outline-none focus-visible:border-violet-line"
                  aria-label="Edit the action before approving"
                />
              ) : (
                <pre className="max-h-40 overflow-auto rounded-card border border-line bg-ink p-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">
                  {action.preview}
                </pre>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <HoldToApprove
                  disabled={busy}
                  onConfirm={() =>
                    onDecide(action.id, "approve", isEditing ? { preview: draft } : undefined)
                  }
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (isEditing) {
                      setEditing(null);
                    } else {
                      setEditing(action.id);
                      setDraft(action.preview);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-glass px-3 py-1.5 text-[12px] text-ink-2 transition-colors hover:text-ink-1 disabled:opacity-50"
                >
                  <Pencil className="size-3" />
                  {isEditing ? "Cancel edit" : "Edit"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDecide(action.id, "reject")}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-glass px-3 py-1.5 text-[12px] text-ink-2 transition-colors hover:border-coral-line hover:text-coral disabled:opacity-50"
                >
                  <X className="size-3" />
                  Reject
                </button>
                {busy && <span className="text-[11px] text-ink-3">working…</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
