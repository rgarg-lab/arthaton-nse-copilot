import {
  Activity,
  Calculator,
  Plug,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { Feature, IdeaConfig } from "@/lib/config";

/**
 * Icons are named in `idea.config.ts` as strings, resolved here against a small set.
 *
 * A fixed set rather than a dynamic import of all of lucide: pulling the whole icon
 * library into the client bundle to satisfy a config string is a poor trade. An
 * unrecognised name falls back to Sparkles rather than rendering nothing.
 */
const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  calculator: Calculator,
  "shield-check": ShieldCheck,
  plug: Plug,
  sparkles: Sparkles,
};

function Card({ feature }: { feature: Feature }) {
  const Icon = ICONS[feature.icon] ?? Sparkles;
  return (
    <li className="rounded-panel border border-line bg-surface-1 p-5">
      <span className="grid size-9 place-items-center rounded-card border border-violet-line bg-violet-soft text-violet" aria-hidden>
        <Icon className="size-4" />
      </span>
      <h3 className="mt-4 text-[15px] font-medium text-ink-1">{feature.title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{feature.description}</p>
    </li>
  );
}

export function Features({ idea }: { idea: IdeaConfig }) {
  return (
    <section id="features" className="px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-[420] tracking-[-0.03em] text-ink-1">
          What it does
        </h2>
        <p className="mt-2 max-w-[56ch] text-[14px] text-ink-2">{idea.problem}</p>
        <ul
          className="mt-8 grid list-none gap-3 sm:grid-cols-2 lg:grid-cols-4"
          style={{ gridTemplateColumns: undefined }}
        >
          {idea.landing.features.map((feature) => (
            <Card key={feature.title} feature={feature} />
          ))}
        </ul>
      </div>
    </section>
  );
}
