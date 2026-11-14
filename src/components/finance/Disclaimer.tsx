import { cn } from "@/lib/utils";

/**
 * The disclaimer, as a component rather than a string repeated five times.
 *
 * §4.5 requires it visible on **every** surface that shows a signal, and the reason it is
 * a component is that the earlier version of this project had **zero** occurrences of
 * "not investment advice" anywhere in its `src/` tree — a polished app making directional
 * calls on a real listed company with no disclaimer at all. Making it a component means
 * adding a signal surface without one is a conspicuous omission rather than something you
 * simply forget.
 *
 * The text is duplicated in `ml/src/copilot/config.py` (`DISCLAIMER`) so that every API
 * payload carries it too. Two copies of one sentence is the right trade: the alternative
 * is the TypeScript depending on the Python service being reachable in order to render a
 * legal notice, which is exactly backwards.
 */

/**
 * The SEBI clause is explicit on purpose. "Not investment advice" is the phrase every app
 * uses, and in India it leaves the question a finance judge actually asks unanswered —
 * whether the person behind the tool is a registered adviser. Saying so unprompted costs
 * one clause and removes the doubt; its absence reads as an oversight.
 */
export const DISCLAIMER =
  "Historical and paper-trading analysis only. Not investment advice, and not from a " +
  "SEBI-registered investment adviser. Past measured accuracy does not predict future results.";

export const PAPER_ONLY = "Paper trading and historical data only — no real money, no broker.";

export function Disclaimer({
  className,
  variant = "block",
}: {
  className?: string;
  /** `block` for a panel footer, `inline` for a dense row, `banner` for the top of a page. */
  variant?: "block" | "inline" | "banner";
}) {
  if (variant === "inline") {
    return (
      <p className={cn("text-[11px] leading-snug text-ink-4", className)}>
        <span className="sr-only">Disclaimer: </span>
        {DISCLAIMER}
      </p>
    );
  }

  if (variant === "banner") {
    return (
      <div
        role="note"
        aria-label="Disclaimer"
        className={cn(
          "flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-card border border-line bg-glass px-3 py-2",
          className,
        )}
      >
        <span className="label-caps text-[10px] text-ink-3">Not advice</span>
        <p className="text-[12px] leading-relaxed text-ink-2">{DISCLAIMER}</p>
      </div>
    );
  }

  return (
    <p
      role="note"
      aria-label="Disclaimer"
      className={cn("border-t border-line pt-2 text-[11px] leading-relaxed text-ink-4", className)}
    >
      {DISCLAIMER}
    </p>
  );
}
