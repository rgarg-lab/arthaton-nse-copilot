import { cn } from "@/lib/utils";

/**
 * A 0–1 confidence, rendered honestly.
 *
 * Three states, not a gradient: above the threshold it is a fact, below it is not, and
 * absent means nothing checked it. The third state matters — an unbadged value should not
 * look the same as a verified one, or the badge becomes decoration.
 */
export function ConfidenceBadge({
  confidence,
  threshold,
  className,
}: {
  confidence: number | null | undefined;
  threshold: number;
  className?: string;
}) {
  if (confidence === null || confidence === undefined) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-pill border border-line bg-glass px-2 py-0.5 text-[11px] font-medium text-ink-3",
          className,
        )}
        title="Nothing verified this value"
      >
        <span className="size-1.5 rounded-pill bg-ink-4" aria-hidden />
        unverified
      </span>
    );
  }

  const passes = confidence >= threshold;
  const pct = Math.round(confidence * 100);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2 py-0.5 text-[11px] font-medium",
        passes
          ? "border-status-progress-line bg-status-progress-soft text-violet"
          : "border-evidence-review-line bg-evidence-review-soft text-evidence-review",
        className,
      )}
      title={
        passes
          ? `Verified with ${pct}% confidence (threshold ${Math.round(threshold * 100)}%)`
          : `Confidence ${pct}% is below the ${Math.round(threshold * 100)}% threshold — treat as unconfirmed`
      }
    >
      <span
        className={cn("size-1.5 rounded-pill", passes ? "bg-violet" : "bg-evidence-review")}
        aria-hidden
      />
      {pct}%{passes ? " verified" : " unconfirmed"}
    </span>
  );
}
