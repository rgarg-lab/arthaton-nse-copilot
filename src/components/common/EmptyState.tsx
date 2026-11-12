import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The state a demo spends its first ten seconds in, so it is a real component rather than
 * a blank div. Every list in the app uses it — "no dead ends" in the quality bar means an
 * empty list still tells you what to do next.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-line bg-glass px-6 py-10 text-center",
        className,
      )}
    >
      {icon && <div className="text-ink-4" aria-hidden>{icon}</div>}
      <p className="text-[15px] font-medium text-ink-1">{title}</p>
      {description && <p className="max-w-[44ch] text-[13px] leading-relaxed text-ink-3">{description}</p>}
      {action}
    </div>
  );
}

/** Matching skeleton, so a loading list and an empty list occupy the same space. */
export function LoadingRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-card border border-line bg-surface-2"
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

/** The error twin of EmptyState: says what broke and offers the way back. */
export function ErrorState({
  title = "That did not work",
  detail,
  onRetry,
  className,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-panel border border-coral-line bg-coral-soft px-6 py-8 text-center",
        className,
      )}
    >
      <p className="text-[15px] font-medium text-ink-1">{title}</p>
      {detail && <p className="max-w-[48ch] font-mono text-[12px] leading-relaxed text-ink-2">{detail}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-pill border border-line-strong bg-glass-strong px-4 py-1.5 text-[13px] font-medium text-ink-1 transition-colors hover:bg-glass"
        >
          Try again
        </button>
      )}
    </div>
  );
}
