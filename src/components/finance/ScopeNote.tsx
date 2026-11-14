import type { IdeaConfig } from "@/lib/config/schema";

/**
 * Who this is for, what they do today, and what it deliberately is not.
 *
 * ## Why this exists as its own section
 *
 * The landing page answered "what does it do" six different ways and never answered "for
 * whom, instead of what". A reviewer reading it could not tell which decision the product
 * sits in front of, and a scope this narrow — one horizon, one basket, direction only —
 * reads as an unfinished build rather than a deliberate choice unless the refusals are
 * stated out loud.
 *
 * ## Why the non-goals are the interesting half
 *
 * Every one of them is a thing this could plausibly have done and does not: intraday, a
 * ranked pick list, position sizing, execution. Naming them removes the reviewer's main
 * question — "why so small?" — and the answer in each case is the same one the rest of the
 * project makes: the measurement does not support it.
 *
 * ## No figures here
 *
 * Deliberately. This is the one section about judgement rather than measurement, and every
 * number on this page comes from the artifacts through the ML service. The non-goal about
 * price targets says "never how big the move will be" rather than quoting the R² behind
 * that claim — the model card quotes it, from the artifact.
 */
export function ScopeNote({ idea, id }: { idea: IdeaConfig; id?: string }) {
  return (
    <section
      id={id}
      className="mx-auto w-full max-w-[1120px] px-6 py-16 sm:px-8"
      aria-labelledby="scope-heading"
    >
      <header className="max-w-[72ch]">
        <p className="label-caps text-[11px] text-ink-4">Scope</p>
        <h2
          id="scope-heading"
          className="mt-2 text-[26px] font-[420] leading-[1.2] tracking-[-0.03em] text-ink-1"
        >
          One investor, one decision, and the things this will not do.
        </h2>
      </header>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-panel border border-glass-line bg-surface-2 p-5">
          <p className="label-caps text-[11px] text-ink-4">Built for</p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-1">{idea.targetUser}</p>
          <p className="label-caps mt-5 text-[11px] text-ink-4">What they do today</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{idea.userToday}</p>
        </div>

        <div className="rounded-panel border border-glass-line bg-surface-2 p-5">
          <p className="label-caps text-[11px] text-ink-4">Not this</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {idea.nonGoals.map((item) => (
              <li key={item} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
                {/* A rule, not a bullet: these are boundaries rather than features. */}
                <span aria-hidden className="mt-[0.6em] h-px w-3 shrink-0 bg-ink-4" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
