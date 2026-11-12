import type { ReactNode } from "react";
import type { IdeaConfig } from "@/lib/config";

/**
 * The deliberately empty container for the day's showcase component.
 *
 * It ships styled but unfilled, and says so. The reason is the event rule that starter
 * templates are allowed but pre-built solutions are not: the wow moment has to be built
 * on the day, so the template provides the stage and not the act.
 *
 * On the day, `/wow` writes a component and it is passed as `children`. Everything around
 * it — the framing, the spacing, the caption from `idea.config.wow` — is already right.
 */
export function WowSlot({ idea, children }: { idea: IdeaConfig; children?: ReactNode }) {
  return (
    <section id="wow" className="px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="label-caps text-violet">The moment</h2>
            <h3 className="mt-2 text-[clamp(1.6rem,3vw,2.2rem)] font-[420] tracking-[-0.03em] text-ink-1">
              {idea.wow.title}
            </h3>
          </div>
          <p className="max-w-[44ch] text-[13px] leading-relaxed text-ink-2">{idea.wow.description}</p>
        </div>

        <div className="relative mt-6 overflow-hidden rounded-panel border border-line bg-surface-1">
          <div className="bg-aurora-2 pointer-events-none absolute inset-0 opacity-40" aria-hidden />
          <div className="relative grid min-h-[320px] place-items-center p-6">
            {children ?? (
              <div className="flex max-w-[40ch] flex-col items-center gap-2 text-center">
                <span className="grid size-10 place-items-center rounded-pill border border-dashed border-line-strong text-ink-4" aria-hidden>
                  ✦
                </span>
                <p className="text-[14px] font-medium text-ink-2">The wow slot is empty on purpose.</p>
                <p className="text-[12px] leading-relaxed text-ink-4">
                  Build the day&apos;s showcase component into{" "}
                  <code className="font-mono text-ink-3">src/components/landing/WowSlot.tsx</code> and pass it
                  as children. The frame, spacing and caption are already here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
