import { cn } from "@/lib/utils";

/**
 * What mode the app is actually in, stated plainly at the top of the screen.
 *
 * This exists for honesty under demo pressure. A mocked answer that looks live is the
 * fastest way to lose a judge's trust when they ask "is that real?" — so the app says so
 * itself, before they have to ask. Live mode shows nothing: there is nothing to disclose.
 */
export function DemoBanner({
  mode,
  driver,
  className,
}: {
  mode: "mock" | "cached" | "live";
  driver?: "pglite" | "neon" | "postgres" | null;
  className?: string;
}) {
  const embedded = driver === "pglite";
  if (mode === "live" && !embedded) return null;

  const label =
    mode === "mock"
      ? "Mock mode — no model is being called"
      : mode === "cached"
        ? "Cached mode — answers are replayed from the response cache"
        : "Live model, embedded database";

  const detail =
    mode === "mock"
      ? "Answers are generated locally and deterministically. Set an API key and LLM_MODE=live for real output."
      : embedded
        ? "Running on the embedded database (PGlite). Set DATABASE_URL to use Neon."
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
