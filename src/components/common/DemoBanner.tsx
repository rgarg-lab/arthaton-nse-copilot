import { cn } from "@/lib/utils";

/**
 * What mode the app is actually in, stated plainly at the top of the screen.
 *
 * This exists for honesty under demo pressure. A mocked answer that looks live is the
 * fastest way to lose a judge's trust when they ask "is that real?" — so the app says so
 * itself, before they have to ask. Live mode shows nothing: there is nothing to disclose.
 *
 * ## Why the database no longer keeps it on screen
 *
 * It used to render whenever the driver was PGlite, *including in live mode*, which
 * contradicted the paragraph above and made the banner's only remaining job the display of
 * "Set DATABASE_URL to use Neon" — a deployment instruction for whoever is building this,
 * shown to whoever is using it. On a finished app a permanent strip telling the viewer to
 * configure a database reads as unfinished, and it is the first thing on the page.
 *
 * Which backend stores sessions is not a disclosure about whether an answer is real, so it
 * does not belong in an honesty banner. `/preflight` already reports it, with the same
 * advice and in the place built for exactly this: "pglite reachable, all 10 tables present
 * → Fine for local work. Set DATABASE_URL to a Neon database before deploying."
 *
 * What still shows: mock and cached, the two states where an answer is not what it appears
 * to be. Those are the ones worth interrupting the page for.
 */
export function DemoBanner({
  mode,
  className,
}: {
  mode: "mock" | "cached" | "live";
  className?: string;
}) {
  // Live is live, whatever the database is doing.
  if (mode === "live") return null;

  const label =
    mode === "mock"
      ? "Mock mode — no model is being called"
      : "Cached mode — answers are replayed from the response cache";

  const detail =
    mode === "mock"
      ? "Answers are generated locally and deterministically. Set an API key and LLM_MODE=live for real output."
      : "Responses may come from cache rather than a fresh model call.";

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-evidence-review-line bg-evidence-review-soft px-4 py-2 text-[12px]",
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-pill bg-evidence-review" aria-hidden />
      <span className="font-medium text-ink-1">{label}</span>
      <span className="text-ink-3">{detail}</span>
    </div>
  );
}
